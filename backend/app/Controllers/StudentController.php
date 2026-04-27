<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Models\StudentModel;
use App\Helpers\ValidationHelper;

class StudentController extends BaseController
{
    private StudentModel $studentModel;

    public function __construct()
    {
        $this->studentModel = new StudentModel();
    }

    /**
     * List all students with pagination and search.
     */
    public function index(Request $request, Response $response): never
    {
        $page    = (int)($request->query('page') ?? 1);
        $perPage = (int)($request->query('per_page') ?? 15);
        $search  = $request->query('search') ?? $request->query('q') ?? '';
        
        $sortBy  = $request->query('sort_by');
        $sortDir = strtoupper($request->query('sort_dir') ?? 'DESC');

        $allowedSorts = ['id', 'fname', 'lname', 'regnumber', 'email', 'gender', 'nationality'];
        if (!in_array($sortBy, $allowedSorts, true)) {
            $sortBy = 'id';
        }
        if (!in_array($sortDir, ['ASC', 'DESC'], true)) {
            $sortDir = 'DESC';
        }

        $clauses  = [];
        $bindings = [];

        if ($search !== '') {
            $clauses[]  = "(fname LIKE ? OR lname LIKE ? OR regnumber LIKE ? OR email LIKE ?)";
            $bindings[] = "%$search%";
            $bindings[] = "%$search%";
            $bindings[] = "%$search%";
            $bindings[] = "%$search%";
        }

        // Exact-match filter columns accepted from the query string.
        $filterable = [
            'student_state', 'gender', 'faculty', 'department',
            'current_level', 'nationality', 'acc_year', 'program',
        ];

        foreach ($filterable as $col) {
            $val = $request->query($col);
            if ($val !== null && $val !== '') {
                $lower = strtolower((string)$val);
                // Treat "rwandan" family as a single bucket for the Rwandan vs Foreign overview
                if ($col === 'nationality' && $lower === 'rwandan') {
                    $clauses[]  = "LOWER(nationality) IN ('rwandan','rwandana','rwandese')";
                } elseif ($col === 'nationality' && $lower === 'foreign') {
                    $clauses[]  = "(nationality IS NOT NULL AND nationality <> '' AND LOWER(nationality) NOT IN ('rwandan','rwandana','rwandese'))";
                } elseif ($col === 'nationality' && $lower === 'unknown') {
                    $clauses[] = "(nationality IS NULL OR nationality = '')";
                } elseif ($col === 'gender') {
                    if (in_array($lower, ['m', 'male'], true)) {
                        $clauses[]  = "LOWER(gender) IN ('m','male')";
                    } elseif (in_array($lower, ['f', 'female'], true)) {
                        $clauses[]  = "LOWER(gender) IN ('f','female')";
                    } elseif ($lower === 'unknown') {
                        $clauses[] = "(gender IS NULL OR gender = '' OR LOWER(gender) NOT IN ('m','male','f','female'))";
                    }
                } elseif ($col === 'acc_year') {
                    // academic_years.label uses "2024/2025" (slash) while student.acc_year
                    // is historically stored as "2024-2025" (dash). Accept either format
                    // from the client and match against both.
                    $variants = self::accYearVariants((string)$val);
                    $ph = implode(',', array_fill(0, count($variants), '?'));
                    $clauses[] = "acc_year IN ($ph)";
                    foreach ($variants as $v) { $bindings[] = $v; }
                } else {
                    $clauses[]  = "`$col` = ?";
                    $bindings[] = $val;
                }
            }
        }

        $where = $clauses ? implode(' AND ', $clauses) : '';

        $paginated = $this->studentModel->paginate($page, $perPage, $where, $bindings, $sortBy, $sortDir);

        $this->success($response, $paginated, 'Students fetched successfully.');
    }

    /**
     * Get a single student.
     */
    public function show(Request $request, Response $response): never
    {
        $id      = (int)$request->param('id');
        $student = $this->studentModel->find($id);

        if (!$student) {
            $this->error($response, 'Student not found', 404);
        }

        $this->success($response, $student, 'Student details fetched.');
    }

    /**
     * Create a new student record.
     */
    public function create(Request $request, Response $response): never
    {
        $data = $request->body();

        $errors = ValidationHelper::validate($data, [
            'fname'   => ['required', 'min:2'],
            'lname'   => ['required', 'min:2'],
            'faculty' => ['required'],
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed', 422, $errors);
        }

        // Auto-generate reg number if not provided
        if (empty($data['regnumber'])) {
            $year              = date('Y');
            $data['regnumber'] = 'CUR/' . $year . '/' . str_pad((string)random_int(1, 99999), 5, '0', STR_PAD_LEFT);
        }

        $id = $this->studentModel->create([
            'regnumber'         => $data['regnumber'],
            'fname'             => trim($data['fname']),
            'lname'             => trim($data['lname']),
            'phone'             => $data['phone'] ?? null,
            'email'             => $data['email'] ?? null,
            'gender'            => $data['gender'] ?? null,
            'birthdate'         => $data['birthdate'] ?? null,
            'nationality'       => $data['nationality'] ?? 'Rwandan',
            'program'           => $data['program'] ?? null,
            'faculty'           => $data['faculty'],
            'department'        => $data['department'] ?? null,
            'current_level'     => $data['current_level'] ?? null,
            'registration_date' => $data['registration_date'] ?? date('Y-m-d'),
            'student_state'     => $data['student_state'] ?? 'active',
        ]);

        $this->success($response, ['id' => $id], 'Student created successfully.', 201);
    }

    /**
     * Update a student record.
     */
    public function update(Request $request, Response $response): never
    {
        $id      = (int)$request->param('id');
        $data    = $request->body();
        $student = $this->studentModel->find($id);

        if (!$student) {
            $this->error($response, 'Student not found', 404);
        }

        $errors = ValidationHelper::validate($data, [
            'fname'   => ['required', 'min:2'],
            'lname'   => ['required', 'min:2'],
            'faculty' => ['required'],
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed', 422, $errors);
        }

        $this->studentModel->update($id, [
            'regnumber'         => $data['regnumber'] ?? $student['regnumber'],
            'fname'             => trim($data['fname']),
            'lname'             => trim($data['lname']),
            'phone'             => $data['phone'] ?? null,
            'email'             => $data['email'] ?? null,
            'gender'            => $data['gender'] ?? null,
            'birthdate'         => $data['birthdate'] ?? null,
            'nationality'       => $data['nationality'] ?? null,
            'program'           => $data['program'] ?? null,
            'faculty'           => $data['faculty'],
            'department'        => $data['department'] ?? null,
            'current_level'     => $data['current_level'] ?? null,
            'registration_date' => $data['registration_date'] ?? null,
            'student_state'     => $data['student_state'] ?? $student['student_state'],
        ]);

        $this->success($response, null, 'Student updated successfully.');
    }

    /**
     * Delete a student record.
     */
    public function delete(Request $request, Response $response): never
    {
        $id      = (int)$request->param('id');
        $student = $this->studentModel->find($id);

        if (!$student) {
            $this->error($response, 'Student not found', 404);
        }

        $this->studentModel->delete($id);
        $this->success($response, null, 'Student deleted successfully.');
    }

    /**
     * Aggregated overview metrics for the Student Registry page.
     * Single round-trip — one aggregate query + one grouped query.
     */
    /**
     * Expand an academic-year filter value to every historical format the
     * `student.acc_year` column may hold (slash vs dash, e.g. "2024/2025"
     * vs "2024-2025"). Callers match with `acc_year IN (?,?)`.
     *
     * @return array<int, string>
     */
    private static function accYearVariants(string $value): array
    {
        $value = trim($value);
        if ($value === '') return [];
        $variants = [$value];
        $slash = str_replace('-', '/', $value);
        $dash  = str_replace('/', '-', $value);
        foreach ([$slash, $dash] as $v) {
            if (!in_array($v, $variants, true)) $variants[] = $v;
        }
        return $variants;
    }

    public function stats(Request $request, Response $response): never
    {
        $db = $this->studentModel->db();

        // Optional acc_year filter — driven by the topnav year selector.
        // Empty string means "All years"; anything truthy is applied to every
        // aggregate below via the same bound parameters ($yearBind).
        //
        // academic_years.label stores "2024/2025" (slash) but student.acc_year
        // stores "2024-2025" (dash); accept either format and match both.
        $yearFilter  = trim((string)($request->query('acc_year') ?? ''));
        $yearVariants = $yearFilter !== '' ? self::accYearVariants($yearFilter) : [];
        if ($yearVariants) {
            $ph = implode(',', array_fill(0, count($yearVariants), '?'));
            $yearScope  = " AND acc_year IN ($ph)";
            $yearScopeS = " AND s.acc_year IN ($ph)";
            $yearBind   = $yearVariants;
        } else {
            $yearScope = $yearScopeS = '';
            $yearBind  = [];
        }

        $row = $db->fetchOne("
            SELECT
              COUNT(*) AS total,
              SUM(CASE WHEN LOWER(student_state) = 'active'   THEN 1 ELSE 0 END) AS active,
              SUM(CASE WHEN LOWER(student_state) = 'inactive' THEN 1 ELSE 0 END) AS inactive,
              SUM(CASE WHEN LOWER(gender) IN ('m','male')     THEN 1 ELSE 0 END) AS male,
              SUM(CASE WHEN LOWER(gender) IN ('f','female')   THEN 1 ELSE 0 END) AS female,
              SUM(CASE WHEN LOWER(nationality) IN ('rwandan','rwandana','rwandese') THEN 1 ELSE 0 END) AS rwandan,
              SUM(CASE WHEN nationality IS NOT NULL
                        AND nationality <> ''
                        AND LOWER(nationality) NOT IN ('rwandan','rwandana','rwandese')
                        THEN 1 ELSE 0 END) AS foreign_students,
              COUNT(DISTINCT faculty) AS faculties,
              COUNT(DISTINCT acc_year) AS academic_years,

              -- ─── Active-only slices (for the Active Students tab) ───
              SUM(CASE WHEN LOWER(student_state) = 'active' AND LOWER(gender) IN ('m','male')   THEN 1 ELSE 0 END) AS active_male,
              SUM(CASE WHEN LOWER(student_state) = 'active' AND LOWER(gender) IN ('f','female') THEN 1 ELSE 0 END) AS active_female,
              SUM(CASE WHEN LOWER(student_state) = 'active'
                        AND (gender IS NULL OR gender = '' OR LOWER(gender) NOT IN ('m','male','f','female'))
                        THEN 1 ELSE 0 END) AS active_unknown_gender,
              SUM(CASE WHEN LOWER(student_state) = 'active' AND LOWER(nationality) IN ('rwandan','rwandana','rwandese') THEN 1 ELSE 0 END) AS active_rwandan,
              SUM(CASE WHEN LOWER(student_state) = 'active'
                        AND nationality IS NOT NULL AND nationality <> ''
                        AND LOWER(nationality) NOT IN ('rwandan','rwandana','rwandese')
                        THEN 1 ELSE 0 END) AS active_foreign,
              SUM(CASE WHEN LOWER(student_state) = 'active'
                        AND (nationality IS NULL OR nationality = '')
                        THEN 1 ELSE 0 END) AS active_unknown_nationality,
              COUNT(DISTINCT CASE WHEN LOWER(student_state) = 'active' AND faculty  <> '' THEN faculty  END) AS active_faculties,
              COUNT(DISTINCT CASE WHEN LOWER(student_state) = 'active' AND department <> '' THEN department END) AS active_departments,
              COUNT(DISTINCT CASE WHEN LOWER(student_state) = 'active' AND acc_year <> '' THEN acc_year END) AS active_academic_years
            FROM student
            WHERE 1=1{$yearScope}
        ", $yearBind) ?: [];

        // Breakdowns — ACTIVE students only. These power the "Active students" overview.
        $byLevel = $db->fetchAll("
            SELECT s.current_level AS value, l.name AS label, COUNT(*) AS total
            FROM student s
            LEFT JOIN levels l ON l.id = s.current_level
            WHERE LOWER(s.student_state) = 'active'
              AND s.current_level IS NOT NULL AND s.current_level <> ''
              {$yearScopeS}
            GROUP BY s.current_level, l.name
            ORDER BY s.current_level ASC
            LIMIT 20
        ", $yearBind);

        $byFaculty = $db->fetchAll("
            SELECT s.faculty AS value, f.fac_name AS label, f.fac_code AS code, COUNT(*) AS total
            FROM student s
            LEFT JOIN faculty f ON f.fac_id = s.faculty
            WHERE LOWER(s.student_state) = 'active'
              AND s.faculty IS NOT NULL AND s.faculty <> ''
              {$yearScopeS}
            GROUP BY s.faculty, f.fac_name, f.fac_code
            ORDER BY total DESC
            LIMIT 20
        ", $yearBind);

        $byDepartment = $db->fetchAll("
            SELECT s.department AS value, d.dep_name AS label, d.dep_acronym AS code, COUNT(*) AS total
            FROM student s
            LEFT JOIN departements d ON d.dep_id = s.department
            WHERE LOWER(s.student_state) = 'active'
              AND s.department IS NOT NULL AND s.department <> ''
              {$yearScopeS}
            GROUP BY s.department, d.dep_name, d.dep_acronym
            ORDER BY total DESC
            LIMIT 20
        ", $yearBind);

        $byProgram = $db->fetchAll("
            SELECT program AS value, program AS label, COUNT(*) AS total
            FROM student
            WHERE LOWER(student_state) = 'active'
              AND program IS NOT NULL AND program <> ''
              {$yearScope}
            GROUP BY program
            ORDER BY total DESC
            LIMIT 20
        ", $yearBind);

        // Distinct filter values joined to their reference tables so labels are human-readable
        // (student.faculty/department/current_level are stored as numeric IDs as VARCHAR).
        $faculties = $db->fetchAll("
            SELECT DISTINCT s.faculty AS v, f.fac_name AS label
            FROM student s
            LEFT JOIN faculty f ON f.fac_id = s.faculty
            WHERE s.faculty IS NOT NULL AND s.faculty <> ''
            ORDER BY label IS NULL, label ASC
            LIMIT 100
        ");
        $departments = $db->fetchAll("
            SELECT DISTINCT s.department AS v, d.dep_name AS label
            FROM student s
            LEFT JOIN departements d ON d.dep_id = s.department
            WHERE s.department IS NOT NULL AND s.department <> ''
            ORDER BY label IS NULL, label ASC
            LIMIT 100
        ");
        $levels = $db->fetchAll("
            SELECT DISTINCT s.current_level AS v, l.name AS label
            FROM student s
            LEFT JOIN levels l ON l.id = s.current_level
            WHERE s.current_level IS NOT NULL AND s.current_level <> ''
            ORDER BY s.current_level ASC
            LIMIT 50
        ");
        $years    = $db->fetchAll("SELECT DISTINCT acc_year AS v, acc_year AS label FROM student WHERE acc_year IS NOT NULL AND acc_year <> '' ORDER BY acc_year DESC LIMIT 30");
        $programs = $db->fetchAll("SELECT DISTINCT program  AS v, program  AS label FROM student WHERE program  IS NOT NULL AND program  <> '' ORDER BY program  ASC LIMIT 50");

        $asPairs = function (array $rows): array {
            $out = [];
            foreach ($rows as $r) {
                $v = (string)($r['v'] ?? '');
                if ($v === '') continue;
                $label = $r['label'] ?? null;
                $out[] = [
                    'value' => $v,
                    // Fall back to the raw ID when no joined label exists
                    'label' => ($label !== null && $label !== '') ? (string)$label : $v,
                ];
            }
            return $out;
        };

        $this->success($response, [
            'total'            => (int)($row['total']            ?? 0),
            'active'           => (int)($row['active']           ?? 0),
            'inactive'         => (int)($row['inactive']         ?? 0),
            'male'             => (int)($row['male']             ?? 0),
            'female'           => (int)($row['female']           ?? 0),
            'rwandan'          => (int)($row['rwandan']          ?? 0),
            'foreign_students' => (int)($row['foreign_students'] ?? 0),
            'faculties'        => (int)($row['faculties']        ?? 0),
            'academic_years'   => (int)($row['academic_years']   ?? 0),

            // Active-only aggregates — used by the "Active students" tab
            'active_male'                => (int)($row['active_male']                ?? 0),
            'active_female'              => (int)($row['active_female']              ?? 0),
            'active_unknown_gender'      => (int)($row['active_unknown_gender']      ?? 0),
            'active_rwandan'             => (int)($row['active_rwandan']             ?? 0),
            'active_foreign'             => (int)($row['active_foreign']             ?? 0),
            'active_unknown_nationality' => (int)($row['active_unknown_nationality'] ?? 0),
            'active_faculties'           => (int)($row['active_faculties']           ?? 0),
            'active_departments'         => (int)($row['active_departments']         ?? 0),
            'active_academic_years'      => (int)($row['active_academic_years']      ?? 0),

            'active_breakdown' => [
                'by_faculty'    => $byFaculty,
                'by_department' => $byDepartment,
                'by_level'      => $byLevel,
                'by_program'    => $byProgram,
            ],
            // Kept for backwards compatibility with any older client code
            'by_level'         => $byLevel,
            'facets'           => [
                'faculty'       => $asPairs($faculties),
                'department'    => $asPairs($departments),
                'current_level' => $asPairs($levels),
                'acc_year'      => $asPairs($years),
                'program'       => $asPairs($programs),
            ],
        ], 'Student stats fetched.');
    }
}

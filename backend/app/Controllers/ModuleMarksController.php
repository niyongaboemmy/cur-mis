<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use Core\Database;
use App\Constants\Permissions;
use App\Helpers\ValidationHelper;
use App\Helpers\TranscriptPdf;

/**
 * Module marks controller.
 *
 * Single-table model: `module_marks` — one row per (module, student, term)
 * with CAT, Assignment and Exam component scores plus computed total/percent
 * and a final letter grade.
 *
 * Scoping rules mirror the attendance module:
 *   - MANAGE_MODULE_MARKS  → unrestricted (admin)
 *   - RECORD_MODULE_MARKS  → can only edit modules they are assigned to
 *                            (module_assignments.staff_id → staff.user_id)
 *   - VIEW_MODULE_MARKS    → read-only, unrestricted by module
 */
class ModuleMarksController extends BaseController
{
    private Database $db;

    public function __construct()
    {
        $this->db = Database::getInstance();
    }

    /* ── helpers ───────────────────────────────────────────────────────── */

    private function authUserId(Request $request): int
    {
        $user = (array)($request->param('_auth_user') ?? []);
        return (int)($user['id'] ?? 0);
    }

    private function authPerms(Request $request): array
    {
        $user = (array)($request->param('_auth_user') ?? []);
        return (array)($user['permissions'] ?? []);
    }

    private function hasPerm(Request $request, string $slug): bool
    {
        $user = (array)($request->param('_auth_user') ?? []);
        if (($user['role'] ?? '') === 'superadmin') return true;
        return in_array($slug, $this->authPerms($request), true);
    }

    private function authStaffId(Request $request): ?int
    {
        $uid = $this->authUserId($request);
        if ($uid <= 0) return null;
        $row = $this->db->fetchOne("SELECT id FROM staff WHERE user_id = ? LIMIT 1", [$uid]);
        return $row ? (int)$row['id'] : null;
    }

    /**
     * Every `module_assignments.staff_id` candidate for the auth user — resolves
     * the person across BOTH the `staff` table (`staff.user_id`) and the linked
     * HR `employees` record (`employees.user_id`). So whatever a module was
     * assigned against — a staff row or the user's employee record — it shows up
     * as "assigned to me".
     *
     * @return int[]
     */
    private function authStaffIds(Request $request): array
    {
        $uid = $this->authUserId($request);
        if ($uid <= 0) return [];
        $ids = [];
        foreach ($this->db->fetchAll("SELECT id FROM staff WHERE user_id = ?", [$uid]) as $r) {
            $ids[(int)$r['id']] = true;
        }
        try {
            foreach ($this->db->fetchAll("SELECT employee_id FROM employees WHERE user_id = ?", [$uid]) as $r) {
                $ids[(int)$r['employee_id']] = true;
            }
        } catch (\Throwable) { /* employees.user_id not present yet — ignore */ }
        // A module can also be assigned directly against the user account, via the
        // namespaced instructor id (InstructorDirectory::USER_OFFSET + users.id).
        $ids[\App\Helpers\InstructorDirectory::USER_OFFSET + $uid] = true;
        return array_keys($ids);
    }

    /** null = full scope, [] = none, else list of module ids the user may record for. */
    private function teachableModuleIds(Request $request): ?array
    {
        if ($this->hasPerm($request, Permissions::MANAGE_MODULE_MARKS)) return null;
        $staffIds = $this->authStaffIds($request);
        if (empty($staffIds)) return [];
        $ph   = implode(',', array_fill(0, count($staffIds), '?'));
        $rows = $this->db->fetchAll(
            "SELECT DISTINCT module_id FROM module_assignments WHERE staff_id IN ($ph)",
            $staffIds
        );
        return array_map(fn($r) => (int)$r['module_id'], $rows);
    }

    private function ensureCanRecordForModule(Request $request, Response $response, int $moduleId): void
    {
        $allowed = $this->teachableModuleIds($request);
        if ($allowed === null) return;
        if (!in_array($moduleId, $allowed, true)) {
            $this->error($response, 'You are not assigned to this module.', 403);
        }
    }

    /** Official CUR grading scheme — matches the printed transcript. */
    private function gradeFor(float $pct): string
    {
        if ($pct >= 80) return 'A'; // Very Good
        if ($pct >= 70) return 'B'; // Good
        if ($pct >= 60) return 'C'; // Satisfaction
        if ($pct >= 50) return 'D'; // Pass
        return 'E';                 // Fail
    }

    /**
     * Resolve the authenticated user's student regnumber, or null.
     *
     * The JWT carries email + username. Student accounts at CUR are typically
     * provisioned with the registration number as the username, so we match on
     * that first (most reliable). Email is the fallback for legacy accounts.
     */
    private function authStudentRegnumber(Request $request): ?string
    {
        $user = (array)($request->param('_auth_user') ?? []);
        if (!empty($user['regnumber'])) return (string)$user['regnumber'];

        $username = trim((string)($user['username'] ?? ''));
        if ($username !== '') {
            $row = $this->db->fetchOne(
                "SELECT regnumber FROM `student` WHERE regnumber = ? LIMIT 1",
                [$username]
            );
            if ($row && !empty($row['regnumber'])) return (string)$row['regnumber'];
        }

        $email = trim((string)($user['email'] ?? ''));
        if ($email !== '') {
            $row = $this->db->fetchOne(
                "SELECT regnumber FROM `student` WHERE email = ? LIMIT 1",
                [$email]
            );
            if ($row && !empty($row['regnumber'])) return (string)$row['regnumber'];
        }
        return null;
    }

    /* ── "Modules I can mark" — drives the picker ──────────────────────── */

    public function myMarkableModules(Request $request, Response $response): never
    {
        $termId = (int)($request->query('academic_term_id') ?? 0);

        if ($this->hasPerm($request, Permissions::MANAGE_MODULE_MARKS)) {
            // Admin: show every active module — the marks page is the canonical
            // place to record marks, so the picker should never silently hide
            // a module just because nobody is registered yet.
            $rows = $this->db->fetchAll(
                "SELECT m.module_id, m.module_code, m.module_name, m.level
                 FROM modules m
                 WHERE m.status = 'active'
                 ORDER BY m.module_code ASC
                 LIMIT 2000",
                []
            );
        } else {
            $staffIds = $this->authStaffIds($request);
            if (empty($staffIds)) {
                $this->success($response, [], 'No staff profile linked to this user.');
            }
            $ph  = implode(',', array_fill(0, count($staffIds), '?'));
            $sql = "SELECT DISTINCT m.module_id, m.module_code, m.module_name, m.level,
                           ma.academic_term_id
                    FROM module_assignments ma
                    JOIN modules m ON m.module_id = ma.module_id
                    WHERE ma.staff_id IN ($ph)"
                    . ($termId > 0 ? " AND ma.academic_term_id = ?" : "")
                    . " ORDER BY m.module_code ASC";
            $bindings = $staffIds;
            if ($termId > 0) $bindings[] = $termId;
            $rows = $this->db->fetchAll($sql, $bindings);
        }

        $this->success($response, $rows, 'Markable modules fetched.');
    }

    /* ── List marks for module + term (full roster) ────────────────────── */

    /**
     * GET /api/marks?module_id=&academic_term_id=
     * Returns the registered roster for that module/term plus any saved
     * marks (left-joined so unmarked students still appear) and the rich
     * module header metadata used by the CUR module-marks template
     * (program, level, option, department, faculty, lecturer, teaching dates).
     */
    public function listMarks(Request $request, Response $response): never
    {
        $moduleId = (int)($request->query('module_id')        ?? 0);
        $termId   = (int)($request->query('academic_term_id') ?? 0);

        if ($moduleId <= 0 || $termId <= 0) {
            $this->error($response, 'module_id and academic_term_id are required.', 422);
        }

        $module = $this->db->fetchOne(
            "SELECT m.module_id, m.module_code, m.module_name, m.module_credits,
                    m.level, m.d_option,
                    d.dep_id, d.dep_name, d.dep_acronym, d.program AS dep_program,
                    f.fac_id, f.fac_name, f.fac_code
             FROM modules m
             LEFT JOIN departements d ON d.dep_id = m.department
             LEFT JOIN faculty     f ON f.fac_id = d.fac_id
             WHERE m.module_id = ?
             LIMIT 1",
            [$moduleId]
        );
        if (!$module) $this->error($response, 'Module not found.', 404);

        $term = $this->db->fetchOne(
            "SELECT id, label FROM academic_terms WHERE id = ? LIMIT 1",
            [$termId]
        );
        if (!$term) $this->error($response, 'Term not found.', 404);

        // Best-effort lecturer + teaching dates from module_offerings (if present),
        // falling back to module_assignments → staff for the lecturer.
        $offering = $this->db->fetchOne(
            "SELECT instructor_name, start_date, end_date
             FROM module_offerings
             WHERE module_id = ?
             ORDER BY id DESC LIMIT 1",
            [$moduleId]
        ) ?: [];

        $lecturer = $this->db->fetchOne(
            "SELECT s.first_name, s.last_name, s.email
             FROM module_assignments ma
             JOIN staff s ON s.id = ma.staff_id
             WHERE ma.module_id = ? AND ma.academic_term_id = ?
             ORDER BY ma.role = 'primary' DESC, ma.id ASC
             LIMIT 1",
            [$moduleId, $termId]
        );

        $module['program']         = $module['dep_program'] ?? null;
        $module['option_acronym']  = $module['d_option'] ?? null;
        $module['lecturer_name']   = $lecturer
            ? trim(($lecturer['first_name'] ?? '') . ' ' . ($lecturer['last_name'] ?? ''))
            : ($offering['instructor_name'] ?? null);
        $module['lecturer_email']  = $lecturer['email'] ?? null;
        $module['teaching_started_on'] = $offering['start_date'] ?? null;
        $module['teaching_ended_on']   = $offering['end_date']   ?? null;

        $rosterCols = "st.id AS student_id, st.regnumber, st.fname, st.lname, st.email,
                       st.gender AS sex, st.program AS student_program, st.std_option AS option_acro,
                       mm.id AS mark_id,
                       mm.cat_marks, mm.assignment_marks, mm.exam_marks,
                       mm.cat_max, mm.assignment_max, mm.exam_max,
                       mm.cat1, mm.cat2, mm.cat3, mm.partial_exam,
                       mm.cat1_max, mm.cat2_max, mm.cat3_max, mm.partial_exam_max, mm.cats_max,
                       mm.exam_1st_sitting, mm.exam_2nd_sitting, mm.final_exam_max,
                       mm.total, mm.percentage, mm.grade, mm.decision, mm.status,
                       mm.is_exempted, mm.exemption_reason,
                       mm.remarks, mm.updated_at,
                       mm.teaching_started_on, mm.teaching_ended_on";

        // Keep students whose marks have already been saved (status flips to
        // 'completed' or 'failed' inside saveMarks). Only `'dropped'` should
        // disappear from the roster.
        $roster = $this->db->fetchAll(
            "SELECT $rosterCols, mr.status AS reg_status
             FROM module_registrations mr
             JOIN student st ON st.regnumber = mr.student_regnumber
             LEFT JOIN module_marks mm
                    ON mm.module_id = mr.module_id
                   AND mm.student_regnumber = mr.student_regnumber
                   AND mm.academic_term_id  = mr.academic_term_id
             WHERE mr.module_id = ? AND mr.academic_term_id = ?
               AND mr.status IN ('registered','completed','failed')
             ORDER BY st.lname, st.fname",
            [$moduleId, $termId]
        );

        // Fallback — if nobody is formally registered for this (module, term),
        // derive the eligible roster from the module's offerings/programs:
        //   • module → module_programs.option_id → options.acro
        //   • options.acro → dep_options.option_acronym → dep_options.op_id
        //   • dep_options.op_id → student.std_option
        // Combined with the module's level + department, this picks up the
        // typical class even before formal module_registrations exist.
        if (count($roster) === 0) {
            $level = (int)($module['level'] ?? 0);
            $depId = (int)($module['dep_id'] ?? 0);

            // Legacy std_option ids for every option this module is offered to.
            $opIdRows = $this->db->fetchAll(
                "SELECT DISTINCT do.op_id
                 FROM module_programs mp
                 JOIN options       o  ON o.id = mp.option_id
                 JOIN dep_options   do ON do.option_acronym = o.acro
                 WHERE mp.module_id = ?",
                [$moduleId]
            );
            $optStdIds = array_values(array_filter(array_map(
                fn($r) => (string)($r['op_id'] ?? ''), $opIdRows
            ), fn($v) => $v !== ''));

            // The two `?` for the module_marks LEFT JOIN come BEFORE the WHERE.
            $args  = [$moduleId, $termId];
            $where = "st.student_state = 'active'";
            if ($level > 0) {
                $where .= " AND CAST(NULLIF(st.current_level,'') AS UNSIGNED) = ?";
                $args[] = $level;
            }
            if (count($optStdIds) > 0) {
                $placeholders = implode(',', array_fill(0, count($optStdIds), '?'));
                $where .= " AND st.std_option IN ($placeholders)";
                array_push($args, ...$optStdIds);
            } elseif ($depId > 0) {
                // No option mapping found — fall back to department match.
                $where .= " AND st.department = ?";
                $args[] = (string)$depId;
            }

            $roster = $this->db->fetchAll(
                "SELECT $rosterCols, NULL AS reg_status
                 FROM `student` st
                 LEFT JOIN module_marks mm
                        ON mm.student_regnumber = st.regnumber
                       AND mm.module_id        = ?
                       AND mm.academic_term_id = ?
                 WHERE $where
                 ORDER BY st.lname, st.fname
                 LIMIT 1000",
                $args
            );
        }

        // Workflow status & class-level teaching dates: mode of the saved rows
        // (rows are written together as a batch so they share the same values).
        $workflow = ['status' => 'draft', 'claims_opened_at' => null, 'submitted_at' => null, 'confirmed_at' => null];
        foreach ($roster as $r) {
            if (!empty($r['status'])) {
                $workflow['status'] = $r['status'];
                break;
            }
        }
        $batchRow = $this->db->fetchOne(
            "SELECT status, claims_opened_at, submitted_at, confirmed_at,
                    teaching_started_on, teaching_ended_on
             FROM module_marks
             WHERE module_id = ? AND academic_term_id = ?
             ORDER BY id DESC LIMIT 1",
            [$moduleId, $termId]
        ) ?: [];
        if ($batchRow) {
            $workflow['status']            = $batchRow['status'] ?? $workflow['status'];
            $workflow['claims_opened_at']  = $batchRow['claims_opened_at'] ?? null;
            $workflow['submitted_at']      = $batchRow['submitted_at']     ?? null;
            $workflow['confirmed_at']      = $batchRow['confirmed_at']     ?? null;
            // Prefer batch dates over offering dates.
            if (!empty($batchRow['teaching_started_on'])) {
                $module['teaching_started_on'] = $batchRow['teaching_started_on'];
            }
            if (!empty($batchRow['teaching_ended_on'])) {
                $module['teaching_ended_on'] = $batchRow['teaching_ended_on'];
            }
        }

        $summary = ['total_roster' => count($roster), 'recorded' => 0, 'unmarked' => 0, 'avg_pct' => 0];
        $sumPct = 0.0; $countedPct = 0;
        foreach ($roster as $r) {
            if ($r['mark_id'] !== null) {
                $summary['recorded']++;
                if ($r['percentage'] !== null) {
                    $sumPct += (float)$r['percentage'];
                    $countedPct++;
                }
            } else {
                $summary['unmarked']++;
            }
        }
        $summary['avg_pct'] = $countedPct > 0 ? (int)round($sumPct / $countedPct) : 0;

        $this->success($response, [
            'module'   => $module,
            'term'     => $term,
            'roster'   => $roster,
            'summary'  => $summary,
            'workflow' => $workflow,
        ], 'Marks fetched.');
    }

    /* ── Bulk upsert — save the whole roster's marks at once ───────────── */

    /**
     * PUT /api/marks
     * Body:
     *   {
     *     module_id, academic_term_id,
     *     records: [
     *       { student_regnumber, cat_marks?, assignment_marks?, exam_marks?,
     *         cat_max?, assignment_max?, exam_max?, remarks? }
     *     ]
     *   }
     *
     * Total is computed as the sum of the three components (NULL components
     * count as 0). Percentage = total / (sum of the three maxima) * 100.
     */
    public function saveMarks(Request $request, Response $response): never
    {
        $body     = $request->body();
        $moduleId = (int)($body['module_id']        ?? 0);
        $termId   = (int)($body['academic_term_id'] ?? 0);
        $records  = $body['records'] ?? [];

        if ($moduleId <= 0 || $termId <= 0) {
            $this->error($response, 'module_id and academic_term_id are required.', 422);
        }
        if (!is_array($records)) $this->error($response, 'records must be an array', 422);

        $this->ensureCanRecordForModule($request, $response, $moduleId);

        $userId = $this->authUserId($request) ?: null;
        $saved  = 0;

        $teachingStart = isset($body['teaching_started_on']) && $body['teaching_started_on'] !== ''
            ? (string)$body['teaching_started_on'] : null;
        $teachingEnd   = isset($body['teaching_ended_on']) && $body['teaching_ended_on'] !== ''
            ? (string)$body['teaching_ended_on'] : null;

        foreach ($records as $r) {
            $reg = trim((string)($r['student_regnumber'] ?? ''));
            if ($reg === '') continue;

            // Refuse to overwrite an exemption from this path. Admins must
            // delete the exemption first (Student details → Curriculum) if
            // they want to record a real CAT/exam mark instead.
            $existing = $this->db->fetchOne(
                "SELECT is_exempted FROM module_marks
                 WHERE module_id = ? AND student_regnumber = ? AND academic_term_id = ?
                 LIMIT 1",
                [$moduleId, $reg, $termId]
            );
            if ($existing && (int)($existing['is_exempted'] ?? 0) === 1) {
                continue;
            }

            $cat1     = $this->parseDecimal($r['cat1']             ?? null);
            $cat2     = $this->parseDecimal($r['cat2']             ?? null);
            $cat3     = $this->parseDecimal($r['cat3']             ?? null);
            $partial  = $this->parseDecimal($r['partial_exam']     ?? null);
            $exam1    = $this->parseDecimal($r['exam_1st_sitting'] ?? null);
            $exam2    = $this->parseDecimal($r['exam_2nd_sitting'] ?? null);

            $cat1Max     = $this->parseDecimal($r['cat1_max']         ?? null) ?? 15.0;
            $cat2Max     = $this->parseDecimal($r['cat2_max']         ?? null) ?? 15.0;
            $cat3Max     = $this->parseDecimal($r['cat3_max']         ?? null) ?? 15.0;
            $partialMax  = $this->parseDecimal($r['partial_exam_max'] ?? null) ?? 15.0;
            $catsMax     = $this->parseDecimal($r['cats_max']         ?? null) ?? 60.0;
            $finalMax    = $this->parseDecimal($r['final_exam_max']   ?? null) ?? 40.0;

            $remarks = isset($r['remarks']) && $r['remarks'] !== '' ? (string)$r['remarks'] : null;

            $hasAny = $cat1 !== null || $cat2 !== null || $cat3 !== null
                   || $partial !== null || $exam1 !== null || $exam2 !== null
                   || ($remarks !== null && $remarks !== '');

            if (!$hasAny) continue;

            // Total CATs = cat1 + cat2 + cat3 + partial (NULL counts as 0).
            $catsTotal = ($cat1 ?? 0) + ($cat2 ?? 0) + ($cat3 ?? 0) + ($partial ?? 0);
            // Final exam mark uses the better of the two sittings (resit beats first).
            $finalMark = $exam2 !== null
                ? max((float)($exam1 ?? 0), (float)$exam2)
                : ($exam1 ?? null);

            $totalRaw = $catsTotal + ($finalMark ?? 0);
            $maxSum   = $catsMax + $finalMax;
            $pct      = $maxSum > 0 ? round(($totalRaw / $maxSum) * 100, 2) : null;
            $grade    = $pct !== null ? $this->gradeFor($pct) : null;
            $decision = $pct === null ? null : ($pct >= 50 ? 'P' : 'F&R');

            // Keep legacy `cat_marks/exam_marks` synced for the transcript path
            // (transcript SQL still reads cat_marks/exam_marks/assignment_marks).
            $catLegacy  = $catsTotal > 0 ? round($catsTotal, 2) : null;
            $examLegacy = $finalMark !== null ? round((float)$finalMark, 2) : null;

            $this->db->execute(
                "INSERT INTO module_marks
                   (module_id, student_regnumber, academic_term_id,
                    cat_marks, assignment_marks, exam_marks,
                    cat1, cat2, cat3, partial_exam,
                    cat1_max, cat2_max, cat3_max, partial_exam_max, cats_max,
                    exam_1st_sitting, exam_2nd_sitting, final_exam_max,
                    cat_max, assignment_max, exam_max,
                    total, percentage, grade, decision, remarks,
                    teaching_started_on, teaching_ended_on, recorded_by)
                 VALUES (?, ?, ?,
                         ?, ?, ?,
                         ?, ?, ?, ?,
                         ?, ?, ?, ?, ?,
                         ?, ?, ?,
                         ?, ?, ?,
                         ?, ?, ?, ?, ?,
                         ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                   cat_marks         = VALUES(cat_marks),
                   assignment_marks  = VALUES(assignment_marks),
                   exam_marks        = VALUES(exam_marks),
                   cat1              = VALUES(cat1),
                   cat2              = VALUES(cat2),
                   cat3              = VALUES(cat3),
                   partial_exam      = VALUES(partial_exam),
                   cat1_max          = VALUES(cat1_max),
                   cat2_max          = VALUES(cat2_max),
                   cat3_max          = VALUES(cat3_max),
                   partial_exam_max  = VALUES(partial_exam_max),
                   cats_max          = VALUES(cats_max),
                   exam_1st_sitting  = VALUES(exam_1st_sitting),
                   exam_2nd_sitting  = VALUES(exam_2nd_sitting),
                   final_exam_max    = VALUES(final_exam_max),
                   cat_max           = VALUES(cat_max),
                   assignment_max    = VALUES(assignment_max),
                   exam_max          = VALUES(exam_max),
                   total             = VALUES(total),
                   percentage        = VALUES(percentage),
                   grade             = VALUES(grade),
                   decision          = VALUES(decision),
                   remarks           = VALUES(remarks),
                   teaching_started_on = VALUES(teaching_started_on),
                   teaching_ended_on   = VALUES(teaching_ended_on),
                   recorded_by       = VALUES(recorded_by)",
                [
                    $moduleId, $reg, $termId,
                    $catLegacy, null, $examLegacy,
                    $cat1, $cat2, $cat3, $partial,
                    $cat1Max, $cat2Max, $cat3Max, $partialMax, $catsMax,
                    $exam1, $exam2, $finalMax,
                    $catsMax, 0.0, $finalMax,
                    round($totalRaw, 2), $pct, $grade, $decision, $remarks,
                    $teachingStart, $teachingEnd, $userId,
                ]
            );

            if ($pct !== null) {
                $regStatus = $pct >= 50 ? 'completed' : 'failed';
                $this->db->execute(
                    "UPDATE module_registrations
                     SET status = ?, grade = ?
                     WHERE module_id = ? AND student_regnumber = ? AND academic_term_id = ?",
                    [$regStatus, $grade, $moduleId, $reg, $termId]
                );
            }

            $saved++;
        }

        $this->success($response, ['saved' => $saved], "$saved record(s) saved.");
    }

    /* ── Workflow transitions: open claims / submit / confirm ──────────── */

    /**
     * POST /api/marks/workflow
     * Body: { module_id, academic_term_id, action: 'open_claims'|'submit'|'confirm'|'reset' }
     * Updates the workflow status across every saved row of that module/term.
     */
    public function workflow(Request $request, Response $response): never
    {
        $body     = $request->body();
        $moduleId = (int)($body['module_id']        ?? 0);
        $termId   = (int)($body['academic_term_id'] ?? 0);
        $action   = (string)($body['action']        ?? '');

        if ($moduleId <= 0 || $termId <= 0) {
            $this->error($response, 'module_id and academic_term_id are required.', 422);
        }

        $this->ensureCanRecordForModule($request, $response, $moduleId);

        $sets = match ($action) {
            'open_claims' => ['status' => 'claims_open',  'col' => 'claims_opened_at'],
            'submit'      => ['status' => 'submitted',    'col' => 'submitted_at'],
            'confirm'     => ['status' => 'confirmed',    'col' => 'confirmed_at'],
            'reset'       => ['status' => 'draft',        'col' => null],
            default       => null,
        };
        if (!$sets) $this->error($response, 'Unknown action.', 422);

        if ($sets['col']) {
            $this->db->execute(
                "UPDATE module_marks
                 SET status = ?, {$sets['col']} = COALESCE({$sets['col']}, NOW())
                 WHERE module_id = ? AND academic_term_id = ?",
                [$sets['status'], $moduleId, $termId]
            );
        } else {
            $this->db->execute(
                "UPDATE module_marks
                 SET status = ?, claims_opened_at = NULL, submitted_at = NULL, confirmed_at = NULL
                 WHERE module_id = ? AND academic_term_id = ?",
                [$sets['status'], $moduleId, $termId]
            );
        }

        $this->success($response, ['status' => $sets['status']], 'Workflow updated.');
    }

    /** DELETE /api/marks/:id — clear a single saved row. */
    public function deleteMark(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        $row = $this->db->fetchOne("SELECT module_id FROM module_marks WHERE id = ?", [$id]);
        if (!$row) $this->error($response, 'Mark not found.', 404);

        $this->ensureCanRecordForModule($request, $response, (int)$row['module_id']);

        $this->db->execute("DELETE FROM module_marks WHERE id = ?", [$id]);
        $this->success($response, null, 'Mark cleared.');
    }

    /* ── Per-student summary (used on student details page) ────────────── */

    /** id-based variants of the regnumber routes — necessary because some
     *  regnumbers have slashes which break path-segment routing. */
    public function studentMarksById(Request $request, Response $response): never
    {
        $reg = $this->resolveRegnumberById($request, $response);
        $request->setRouteParams(['regnumber' => $reg]);
        $this->studentMarks($request, $response);
    }

    public function studentTranscriptById(Request $request, Response $response): never
    {
        $reg = $this->resolveRegnumberById($request, $response);
        $request->setRouteParams(['regnumber' => $reg]);
        $this->studentTranscript($request, $response);
    }

    /** Resolve a numeric `:id` route param to the student's regnumber, or
     *  short-circuit with an error response. */
    private function resolveRegnumberById(Request $request, Response $response): string
    {
        $id = (int) $request->param('id');
        if ($id <= 0) {
            $this->error($response, 'student id required', 422);
        }
        $row = $this->db->fetchOne('SELECT regnumber FROM `student` WHERE id = ? LIMIT 1', [$id]);
        if (!$row || empty($row['regnumber'])) {
            $this->error($response, 'Student not found.', 404);
        }
        return (string) $row['regnumber'];
    }

    /**
     * GET /api/marks/students/:regnumber
     * Admin-side view of one student's transcript bundle: rows + totals + bio.
     * Same shape as `myMarks` — keeps the frontend a single component.
     */
    public function studentMarks(Request $request, Response $response): never
    {
        $reg = trim((string)$request->param('regnumber'));
        if ($reg === '') $this->error($response, 'regnumber required', 422);

        [$rows, $totals, $student] = $this->loadTranscriptRows($reg, $request);
        $this->success($response, [
            'student' => $student,
            'rows'    => $rows,
            'totals'  => $totals,
        ], 'Student marks fetched.');
    }

    /**
     * GET /api/marks/students/:regnumber/transcript
     * Stream the official PDF transcript for any student (admin-only via gate).
     */
    public function studentTranscript(Request $request, Response $response): never
    {
        $reg = trim((string)$request->param('regnumber'));
        if ($reg === '') $this->error($response, 'regnumber required', 422);

        [$rows, $totals, $student] = $this->loadTranscriptRows($reg, $request);
        $html = TranscriptPdf::buildHtml($student, $rows, $totals);
        TranscriptPdf::stream($html, "transcript-{$reg}.pdf");
    }

    /* ══════════════════════════════════════════════════════════════════════
     * Student self-service — read-only access to one's own marks
     * ═══════════════════════════════════════════════════════════════════ */

    /**
     * GET /api/marks/my
     * Returns the authenticated student's marks across every module / term
     * they have studied. Optionally filtered by academic_year_id or term.
     */
    public function myMarks(Request $request, Response $response): never
    {
        $reg = $this->authStudentRegnumber($request);
        if (!$reg) $this->error($response, 'No student profile linked to this account.', 404);

        [$rows, $totals, $student] = $this->loadTranscriptRows($reg, $request);

        $this->success($response, [
            'student' => $student,
            'rows'    => $rows,
            'totals'  => $totals,
        ], 'Marks fetched.');
    }

    /**
     * GET /api/marks/my/transcript[?academic_year_id=]
     * Streams the student's transcript as a PDF.
     */
    public function myTranscript(Request $request, Response $response): never
    {
        $reg = $this->authStudentRegnumber($request);
        if (!$reg) $this->error($response, 'No student profile linked to this account.', 404);

        [$rows, $totals, $student] = $this->loadTranscriptRows($reg, $request);
        $html = TranscriptPdf::buildHtml($student, $rows, $totals);
        TranscriptPdf::stream($html, "transcript-{$reg}.pdf");
    }

    /* ── shared loader for student transcript / marks-by-self ──────────── */

    /**
     * @return array{0: array<int,array<string,mixed>>, 1: array<string,mixed>, 2: array<string,mixed>}
     */
    private function loadTranscriptRows(string $reg, Request $request): array
    {
        $yearId = (int)($request->query('academic_year_id') ?? 0);

        $student = $this->db->fetchOne(
            "SELECT s.regnumber, s.fname, s.lname, s.email, s.current_level, s.faculty, s.department, s.std_option,
                    f.fac_name, f.fac_code,
                    d.dep_name, d.dep_acronym
             FROM `student` s
             LEFT JOIN `faculty`      f ON CAST(f.fac_id AS CHAR) COLLATE utf8mb4_unicode_ci = s.faculty COLLATE utf8mb4_unicode_ci
             LEFT JOIN `departements` d ON CAST(d.dep_id AS CHAR) COLLATE utf8mb4_unicode_ci = s.department COLLATE utf8mb4_unicode_ci
             WHERE s.regnumber = ? LIMIT 1",
            [$reg]
        ) ?: ['regnumber' => $reg];

        $args = [$reg];
        $where = "WHERE mm.student_regnumber = ?";
        if ($yearId > 0) {
            $where .= " AND t.academic_year_id = ?";
            $args[] = $yearId;
        }

        $rows = $this->db->fetchAll(
            "SELECT mm.id, mm.module_id, mm.cat_marks, mm.assignment_marks, mm.exam_marks,
                    mm.cat_max, mm.assignment_max, mm.exam_max,
                    mm.total, mm.percentage, mm.grade, mm.remarks, mm.updated_at,
                    mm.is_exempted, mm.exemption_reason,
                    m.module_code, m.module_name, m.module_credits, m.level,
                    t.id AS academic_term_id, t.label AS term_label, t.academic_year_id,
                    y.label AS year_label
             FROM module_marks mm
             LEFT JOIN modules m         ON m.module_id = mm.module_id
             LEFT JOIN academic_terms t  ON t.id = mm.academic_term_id
             LEFT JOIN academic_years y  ON y.id = t.academic_year_id
             $where
             ORDER BY y.start_date ASC, t.start_date ASC, m.module_code ASC",
            $args
        );

        // Compute per-module credit_point = credits × marks/100 weighted equivalent.
        // The transcript model uses MARKS/100 directly (so percentage is the mark).
        $totalCredits      = 0;
        $totalCreditPoints = 0.0;
        $passed            = 0;
        $failed            = 0;
        foreach ($rows as &$r) {
            $credits = (int)($r['module_credits'] ?? 0);
            $pct     = $r['percentage'] !== null ? (float)$r['percentage'] : null;
            $r['credit_point'] = ($pct !== null) ? round($credits * $pct, 2) : null;

            if ($pct !== null) {
                $totalCredits      += $credits;
                $totalCreditPoints += $credits * $pct;
                if ($pct >= 50) $passed++; else $failed++;
            }
        }
        unset($r);

        $weightedAvg = $totalCredits > 0 ? round($totalCreditPoints / $totalCredits, 2) : null;
        $overallGrade = $weightedAvg !== null ? $this->gradeFor($weightedAvg) : null;
        $decision = $weightedAvg === null ? null
            : (($failed === 0 && $weightedAvg >= 50) ? 'Promoted' : 'Repeat');

        $totals = [
            'modules'              => count($rows),
            'total_credits'        => $totalCredits,
            'total_credit_points'  => $totalCreditPoints,
            'weighted_average'     => $weightedAvg,
            'overall_grade'        => $overallGrade,
            'overall_grade_label'  => $weightedAvg !== null ? $this->gradeLabel($overallGrade ?? '') : null,
            'decision'             => $decision,
            'passed'               => $passed,
            'failed'               => $failed,
        ];

        return [$rows, $totals, $student];
    }

    private function gradeLabel(string $grade): string
    {
        return [
            'A' => 'Very Good',
            'B' => 'Good',
            'C' => 'Satisfaction',
            'D' => 'Pass',
            'E' => 'Fail',
        ][$grade] ?? '';
    }

    /* ── small helpers ─────────────────────────────────────────────────── */

    private function parseDecimal(mixed $v): ?float
    {
        if ($v === null || $v === '') return null;
        if (!is_numeric($v))           return null;
        return (float)$v;
    }
}

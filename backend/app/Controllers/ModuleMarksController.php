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

    /** null = full scope, [] = none, else list of module ids the user may record for. */
    private function teachableModuleIds(Request $request): ?array
    {
        if ($this->hasPerm($request, Permissions::MANAGE_MODULE_MARKS)) return null;
        $staffId = $this->authStaffId($request);
        if ($staffId === null) return [];
        $rows = $this->db->fetchAll(
            "SELECT DISTINCT module_id FROM module_assignments WHERE staff_id = ?",
            [$staffId]
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
            // Admin: show every active module that has at least one assignment OR
            // at least one registration in the chosen term — that way the picker
            // never hides a module that students are actually enrolled in.
            $sql = "SELECT DISTINCT m.module_id, m.module_code, m.module_name, m.level
                    FROM modules m
                    LEFT JOIN module_assignments ma
                           ON ma.module_id = m.module_id"
                           . ($termId > 0 ? " AND ma.academic_term_id = ?" : "") . "
                    LEFT JOIN module_registrations mr
                           ON mr.module_id = m.module_id"
                           . ($termId > 0 ? " AND mr.academic_term_id = ?" : "") . "
                    WHERE m.status = 'active'
                      AND (ma.id IS NOT NULL OR mr.id IS NOT NULL)
                    ORDER BY m.module_code ASC LIMIT 500";
            $bindings = $termId > 0 ? [$termId, $termId] : [];
            $rows = $this->db->fetchAll($sql, $bindings);
        } else {
            $staffId = $this->authStaffId($request);
            if ($staffId === null) {
                $this->success($response, [], 'No staff profile linked to this user.');
            }
            $sql = "SELECT DISTINCT m.module_id, m.module_code, m.module_name, m.level,
                           ma.academic_term_id
                    FROM module_assignments ma
                    JOIN modules m ON m.module_id = ma.module_id
                    WHERE ma.staff_id = ?"
                    . ($termId > 0 ? " AND ma.academic_term_id = ?" : "")
                    . " ORDER BY m.module_code ASC";
            $bindings = [$staffId];
            if ($termId > 0) $bindings[] = $termId;
            $rows = $this->db->fetchAll($sql, $bindings);
        }

        $this->success($response, $rows, 'Markable modules fetched.');
    }

    /* ── List marks for module + term (full roster) ────────────────────── */

    /**
     * GET /api/marks?module_id=&academic_term_id=
     * Returns the registered roster for that module/term plus any saved
     * marks (left-joined so unmarked students still appear).
     */
    public function listMarks(Request $request, Response $response): never
    {
        $moduleId = (int)($request->query('module_id')        ?? 0);
        $termId   = (int)($request->query('academic_term_id') ?? 0);

        if ($moduleId <= 0 || $termId <= 0) {
            $this->error($response, 'module_id and academic_term_id are required.', 422);
        }

        $module = $this->db->fetchOne(
            "SELECT module_id, module_code, module_name FROM modules WHERE module_id = ? LIMIT 1",
            [$moduleId]
        );
        if (!$module) $this->error($response, 'Module not found.', 404);

        $term = $this->db->fetchOne(
            "SELECT id, label FROM academic_terms WHERE id = ? LIMIT 1",
            [$termId]
        );
        if (!$term) $this->error($response, 'Term not found.', 404);

        $roster = $this->db->fetchAll(
            "SELECT st.id AS student_id, st.regnumber, st.fname, st.lname, st.email,
                    mm.id AS mark_id,
                    mm.cat_marks, mm.assignment_marks, mm.exam_marks,
                    mm.cat_max, mm.assignment_max, mm.exam_max,
                    mm.total, mm.percentage, mm.grade, mm.remarks,
                    mm.updated_at
             FROM module_registrations mr
             JOIN student st ON st.regnumber = mr.student_regnumber
             LEFT JOIN module_marks mm
                    ON mm.module_id = mr.module_id
                   AND mm.student_regnumber = mr.student_regnumber
                   AND mm.academic_term_id  = mr.academic_term_id
             WHERE mr.module_id = ? AND mr.academic_term_id = ?
               AND mr.status = 'registered'
             ORDER BY st.lname, st.fname",
            [$moduleId, $termId]
        );

        // Attach computed pct from sums when no row was saved yet.
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
            'module'  => $module,
            'term'    => $term,
            'roster'  => $roster,
            'summary' => $summary,
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
        $saved = 0;

        foreach ($records as $r) {
            $reg = trim((string)($r['student_regnumber'] ?? ''));
            if ($reg === '') continue;

            $cat       = $this->parseDecimal($r['cat_marks']        ?? null);
            $asg       = $this->parseDecimal($r['assignment_marks'] ?? null);
            $exam      = $this->parseDecimal($r['exam_marks']       ?? null);
            $catMax    = $this->parseDecimal($r['cat_max']        ?? null) ?? 20.0;
            $asgMax    = $this->parseDecimal($r['assignment_max'] ?? null) ?? 10.0;
            $examMax   = $this->parseDecimal($r['exam_max']       ?? null) ?? 70.0;
            $remarks   = isset($r['remarks']) && $r['remarks'] !== '' ? (string)$r['remarks'] : null;

            $hasAny = $cat !== null || $asg !== null || $exam !== null
                   || ($remarks !== null && $remarks !== '');

            if (!$hasAny) {
                // Nothing to save for this row. Skip — but if a row exists, leave it alone.
                continue;
            }

            $totalRaw = ($cat ?? 0) + ($asg ?? 0) + ($exam ?? 0);
            $maxSum   = $catMax + $asgMax + $examMax;
            $pct      = $maxSum > 0 ? round(($totalRaw / $maxSum) * 100, 2) : null;
            $grade    = $pct !== null ? $this->gradeFor($pct) : null;

            $this->db->execute(
                "INSERT INTO module_marks
                   (module_id, student_regnumber, academic_term_id,
                    cat_marks, assignment_marks, exam_marks,
                    cat_max, assignment_max, exam_max,
                    total, percentage, grade, remarks, recorded_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                   cat_marks        = VALUES(cat_marks),
                   assignment_marks = VALUES(assignment_marks),
                   exam_marks       = VALUES(exam_marks),
                   cat_max          = VALUES(cat_max),
                   assignment_max   = VALUES(assignment_max),
                   exam_max         = VALUES(exam_max),
                   total            = VALUES(total),
                   percentage       = VALUES(percentage),
                   grade            = VALUES(grade),
                   remarks          = VALUES(remarks),
                   recorded_by      = VALUES(recorded_by)",
                [
                    $moduleId, $reg, $termId,
                    $cat, $asg, $exam,
                    $catMax, $asgMax, $examMax,
                    round($totalRaw, 2), $pct, $grade, $remarks, $userId,
                ]
            );

            // Once a percentage exists, sync the registration status: completed
            // (≥50%) or failed (<50%). Keeps the catalog/registrations view in
            // step with the marks book without requiring a second admin step.
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
             LEFT JOIN `faculty`     f ON CAST(f.fac_id AS CHAR) = s.faculty
             LEFT JOIN `departements` d ON CAST(d.dep_id AS CHAR) = s.department
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

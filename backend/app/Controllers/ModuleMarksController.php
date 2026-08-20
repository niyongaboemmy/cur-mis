<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use Core\Database;
use App\Constants\Permissions;
use App\Helpers\ValidationHelper;
use App\Helpers\TranscriptPdf;
use App\Helpers\GradingScale;
use App\Services\AuthService;
use App\Services\DegreeClassificationService;
use App\Helpers\MarksTemplateExcel;
use App\Services\SystemLogService;

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
        if (AuthService::isSuperadmin($user)) return true;
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
        // Delegated to the shared resolver so marks, attendance, the module
        // picker and the teacher portal all agree on what "my modules" means.
        // It additionally matches `module_assignments.user_id`, the canonical
        // link, which the old staff_id-only query ignored.
        $uid = $this->authUserId($request);
        if ($uid <= 0) return [];
        return \App\Helpers\LecturerScope::moduleIds($this->db, $uid);
    }

    private function ensureCanRecordForModule(Request $request, Response $response, int $moduleId): void
    {
        $allowed = $this->teachableModuleIds($request);
        if ($allowed === null) return;
        if (!in_array($moduleId, $allowed, true)) {
            $this->error($response, 'You are not assigned to this module.', 403);
        }
    }

    /**
     * The workflow status of a module's mark sheet for one term.
     *
     * Status lives per row, but rows are written as a batch and therefore share
     * it — the newest row is authoritative, matching how listMarks derives the
     * status it hands the UI. Returns 'draft' when nothing is recorded yet.
     */
    private function sheetStatus(int $moduleId, int $termId): string
    {
        $row = $this->db->fetchOne(
            "SELECT status FROM module_marks
             WHERE module_id = ? AND academic_term_id = ?
             ORDER BY id DESC LIMIT 1",
            [$moduleId, $termId]
        );

        return (string)($row['status'] ?? 'draft');
    }

    /**
     * Block writes to a sheet that has been submitted or confirmed.
     *
     * The UI already greys these sheets out, but that is cosmetic — before this
     * guard a plain POST to /api/marks overwrote confirmed marks. Re-opening a
     * locked sheet is a CONFIRM_MODULE_MARKS action (workflow → reset), so the
     * 409 tells the client exactly which door to use.
     */
    private function ensureSheetUnlocked(Response $response, int $moduleId, int $termId): void
    {
        $status = $this->sheetStatus($moduleId, $termId);

        if ($status === 'submitted' || $status === 'confirmed') {
            $this->error(
                $response,
                $status === 'confirmed'
                    ? 'These marks are confirmed and locked. Ask the registry to re-open the sheet before editing.'
                    : 'These marks are submitted and locked. Ask the registry to re-open the sheet before editing.',
                409
            );
        }
    }

    /**
     * Letter grade for a percentage, from the registry's configured scale.
     *
     * This used to be a hardcoded A/B/C/D/E ladder, which meant the bands the
     * registry maintains at /academic/grading-scale governed the settings
     * screen and nothing else. @see \App\Helpers\GradingScale
     */
    private function gradeFor(float $pct): ?string
    {
        return GradingScale::gradeFor($pct);
    }

    /**
     * Fill in `grade` (and `grade_point`) for rows that carry a percentage.
     *
     * Every one of the 292,632 imported marks was landed with a NULL grade, so
     * every screen reading `module_marks.grade` showed a dash. Deriving from
     * the percentage is also what keeps a single scale authoritative: a grade
     * stored under the old hardcoded ladder would otherwise sit next to a
     * freshly-computed one and disagree with it.
     *
     * @param array<int,array<string,mixed>> $rows
     * @return array<int,array<string,mixed>>
     */
    private function withGrades(array $rows): array
    {
        foreach ($rows as &$r) {
            $pct = isset($r['percentage']) && $r['percentage'] !== null
                ? (float)$r['percentage']
                : null;
            if ($pct === null) {
                // No percentage to grade from — keep whatever was stored.
                $r['grade_point'] = null;
                $r['grade_label'] = GradingScale::labelForGrade($r['grade'] ?? null);
                continue;
            }
            $r['grade']       = GradingScale::gradeFor($pct);
            $r['grade_point'] = GradingScale::gradePointFor($pct);
            $r['grade_label'] = GradingScale::labelFor($pct);
        }
        unset($r);
        return $rows;
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
            // Resolved via LecturerScope so this picker and the save guard agree.
            $uid = $this->authUserId($request);
            if ($uid <= 0) {
                $this->success($response, [], 'No user record linked to this account.');
            }
            // Same resolver as the save guard, so picker and guard agree; also
            // covers timetable-only assignments (module_offerings.instructor_id).
            $mine = \App\Helpers\LecturerScope::moduleIds($this->db, $uid, $termId > 0 ? $termId : null);
            if ($mine === []) {
                $mine = \App\Helpers\LecturerScope::moduleIds($this->db, $uid);
            }
            if ($mine === []) {
                $this->success($response, [], 'You are not assigned to any module.');
            }
            $ph   = implode(',', array_fill(0, count($mine), '?'));
            $rows = $this->db->fetchAll(
                "SELECT DISTINCT m.module_id, m.module_code, m.module_name, m.level,
                        NULL AS academic_term_id
                 FROM modules m
                 WHERE m.module_id IN ($ph)
                 ORDER BY m.module_code ASC",
                $mine
            );
        }

        $this->success($response, \App\Helpers\LevelHelper::decorate($rows), 'Markable modules fetched.');
    }

    /* ── List marks for module + term (full roster) ────────────────────── */


    /**
     * GET /api/marks/template?module_id=&academic_term_id=
     *
     * The blank marks workbook the registry fills in offline — the
     * "Templete bakuye muri system" the August 2026 report asked for.
     *
     * Cut from buildRoster(), the same class list the grid renders, and
     * stamped on a `_meta` sheet with the module, the term and the maxima it
     * was issued against. The importer checks that stamp, which is what stops
     * a sheet filled in for one module being uploaded against another.
     */
    public function template(Request $request, Response $response): never
    {
        $moduleId = (int) ($request->query('module_id')        ?? 0);
        $termId   = (int) ($request->query('academic_term_id') ?? 0);

        if ($moduleId <= 0 || $termId <= 0) {
            $this->error($response, 'module_id and academic_term_id are required.', 422);
        }

        // Same gate as reading the sheet: a template lists every student in
        // the class, so it is exactly as sensitive as the grid.
        $this->ensureCanRecordForModule($request, $response, $moduleId);

        $module = $this->db->fetchOne(
            "SELECT m.module_id, m.module_code, m.module_name, m.level, m.d_option,
                    d.dep_id
             FROM modules m
             LEFT JOIN departements d ON d.dep_id = m.department
             WHERE m.module_id = ? LIMIT 1",
            [$moduleId]
        );
        if (!$module) {
            $this->error($response, 'Module not found.', 404);
        }

        $term = $this->db->fetchOne(
            "SELECT id, label FROM academic_terms WHERE id = ? LIMIT 1",
            [$termId]
        );
        if (!$term) {
            $this->error($response, 'Term not found.', 404);
        }

        $roster = $this->buildRoster($moduleId, $termId, $module);

        // Maxima: the sheet's own saved values when it has any, else the CUR
        // standard 15/15/15/15 + 40. Mirrors how ModulesMarksPage seeds them,
        // so a template and the grid always show the same denominators.
        $maxes = ['cat1' => 15.0, 'cat2' => 15.0, 'cat3' => 15.0, 'partial' => 15.0, 'final' => 40.0];
        foreach ($roster as $r) {
            if (($r['mark_id'] ?? null) !== null) {
                $maxes = [
                    'cat1'    => (float) ($r['cat1_max']         ?: 15),
                    'cat2'    => (float) ($r['cat2_max']         ?: 15),
                    'cat3'    => (float) ($r['cat3_max']         ?: 15),
                    'partial' => (float) ($r['partial_exam_max'] ?: 15),
                    'final'   => (float) ($r['final_exam_max']   ?: 40),
                ];
                break;
            }
        }
        // Trim trailing .0 so the header reads "CAT1 (/15)", not "CAT1 (/15.0)".
        $maxes = array_map(
            fn (float $v) => rtrim(rtrim(number_format($v, 2, '.', ''), '0'), '.'),
            $maxes
        );

        $book = MarksTemplateExcel::build($module, $term, $maxes, $roster);

        $safeCode = preg_replace('/[^A-Za-z0-9_-]/', '', (string) $module['module_code']) ?: "module{$moduleId}";
        SystemLogService::log(
            'EXPORT',
            'ACADEMICS',
            "Marks template issued for {$module['module_code']} (term {$termId}), " . count($roster) . " student(s)",
            $moduleId,
            'module'
        );

        MarksTemplateExcel::stream($book, "marks-template_{$safeCode}_term-{$termId}.xlsx");
    }

    /**
     * Build the mark-sheet roster for one (module, term).
     *
     * Extracted from listMarks() so the downloadable template is cut from
     * exactly the same class list the grid shows — a template built from a
     * second, near-identical query would drift from the grid the moment
     * either was touched, and the registry would be filling in a sheet for
     * students the grid does not have.
     *
     * Carries all three of listMarks' original paths: formal registrations,
     * the eligibility fallback when nobody is registered, and the append of
     * anyone already holding a mark.
     */
    private function buildRoster(int $moduleId, int $termId, array $module): array
    {
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
                       mm.created_at,
                       mm.teaching_started_on, mm.teaching_ended_on";
        // `created_at` backs the roster's "marks added between" filter.
        // `updated_at` alone cannot tell a mark entered today apart from one
        // entered in June and merely edited today.

        // Keep students whose marks have already been saved (status flips to
        // 'completed' or 'failed' inside saveMarks). Only `'dropped'` should
        // disappear from the roster.
        $roster = $this->db->fetchAll(
            "SELECT $rosterCols, mr.status AS reg_status
             FROM module_registrations mr
             JOIN student st ON st.regnumber = mr.student_regnumber COLLATE utf8mb4_general_ci
             LEFT JOIN module_marks mm
                    ON mm.module_id = mr.module_id
                   AND mm.student_regnumber = mr.student_regnumber COLLATE utf8mb4_general_ci
                   AND mm.academic_term_id  = mr.academic_term_id
                   AND mm.superseded = 0
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

            // Guess only when there is something to guess FROM. With no level,
            // no option mapping and no department the filter degrades to "any
            // active student", which returned 1,000 arbitrary strangers for a
            // module whose real class is 15 people. An empty roster here is
            // honest — the mark-holder pass below still supplies everyone who
            // actually has a mark.
            $hasBasis = $level > 0 || count($optStdIds) > 0 || $depId > 0;

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

            $roster = $hasBasis ? $this->db->fetchAll(
                "SELECT $rosterCols, NULL AS reg_status
                 FROM `student` st
                 LEFT JOIN module_marks mm
                        ON mm.student_regnumber = st.regnumber COLLATE utf8mb4_general_ci
                       AND mm.module_id        = ?
                       AND mm.academic_term_id = ?
                       AND mm.superseded = 0
                 WHERE $where
                 ORDER BY st.lname, st.fname
                 LIMIT 1000",
                $args
            ) : [];
        }

        /* ── Nothing-missed guarantee ──────────────────────────────────────
         * Neither roster path above starts from `module_marks`: the primary
         * one walks `module_registrations` (which covers only a couple of
         * modules) and the fallback derives a class from each student's
         * CURRENT option and level. So a student who sat this module in an
         * earlier year — or whose option/level has since changed, or who has
         * left and is no longer 'active' — could hold a mark that no screen
         * would ever display. That is how ~26k legacy marks stayed invisible.
         *
         * Anyone holding a mark for this (module, term) is appended here, so a
         * recorded mark is always reachable. `student` is LEFT JOINed and the
         * regnumber falls back to the mark row, because some legacy marks name
         * students who are no longer in the `student` table at all.
         */
        $seen = [];
        foreach ($roster as $r) {
            $key = strtolower(trim((string)($r['regnumber'] ?? '')));
            if ($key !== '') $seen[$key] = true;
        }

        $markHolders = $this->db->fetchAll(
            "SELECT st.id AS student_id,
                    COALESCE(st.regnumber, mm.student_regnumber) AS regnumber,
                    COALESCE(st.fname, '') AS fname,
                    COALESCE(st.lname, '') AS lname,
                    st.email,
                    st.gender AS sex, st.program AS student_program, st.std_option AS option_acro,
                    mm.id AS mark_id,
                    mm.cat_marks, mm.assignment_marks, mm.exam_marks,
                    mm.cat_max, mm.assignment_max, mm.exam_max,
                    mm.cat1, mm.cat2, mm.cat3, mm.partial_exam,
                    mm.cat1_max, mm.cat2_max, mm.cat3_max, mm.partial_exam_max, mm.cats_max,
                    mm.exam_1st_sitting, mm.exam_2nd_sitting, mm.final_exam_max,
                    mm.total, mm.percentage, mm.grade, mm.decision, mm.status,
                    mm.is_exempted, mm.exemption_reason,
                    mm.remarks, mm.updated_at, mm.created_at,
                    mm.teaching_started_on, mm.teaching_ended_on,
                    NULL AS reg_status
             FROM module_marks mm
             LEFT JOIN `student` st
                    ON st.regnumber = mm.student_regnumber COLLATE utf8mb4_general_ci
             WHERE mm.module_id = ? AND mm.academic_term_id = ?
             ORDER BY mm.id DESC",
            [$moduleId, $termId]
        );

        foreach ($markHolders as $row) {
            $key = strtolower(trim((string)($row['regnumber'] ?? '')));
            if ($key === '' || isset($seen[$key])) continue;
            $seen[$key] = true;
            $roster[] = $row;
        }

        return $roster;
    }

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

        // Reading a mark sheet is as sensitive as writing one: it exposes every
        // student's scores for the module. This endpoint was previously gated
        // only by the route-level permission, so any RECORD_MODULE_MARKS holder
        // could read any module's full sheet. MANAGE_MODULE_MARKS still bypasses.
        $this->ensureCanRecordForModule($request, $response, $moduleId);

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
        // 15 module ids hold marks but have no catalogue row — modules deleted or
        // renumbered before `module_id_map` existed, whose marks were kept during
        // consolidation because the marks themselves are real. 404-ing here would
        // strand those 203 rows: reachable in a student's record but on no sheet.
        // Synthesise a header instead so the mark sheet still opens.
        if (!$module) {
            $module = [
                'module_id'     => $moduleId,
                'module_code'   => 'MODULE-' . $moduleId,
                'module_name'   => 'Unknown module (not in catalogue)',
                'module_credits'=> null,
                'level'         => null,
                'd_option'      => null,
                'dep_id'        => null, 'dep_name' => null, 'dep_acronym' => null, 'dep_program' => null,
                'fac_id'        => null, 'fac_name' => null, 'fac_code' => null,
            ];
        }

        $term = $this->db->fetchOne(
            "SELECT id, label FROM academic_terms WHERE id = ? LIMIT 1",
            [$termId]
        );
        if (!$term) $this->error($response, 'Term not found.', 404);

        /* ── Serve the term that actually holds this module's marks ────────
         * Every query below is term-scoped, and the client opens on the term
         * flagged `is_current`. But 292,632 of the 292,648 marks in the system
         * were landed by the legacy consolidation under the 'Legacy (imported
         * marks)' term, so the current term is empty for 663 of the 664
         * modules that hold marks — the sheet showed a guessed roster and not
         * one number.
         *
         * So: if the requested term has no marks for this module but another
         * term does, serve that term instead and say so. `requested_term_id`
         * plus `terms_with_marks` let the client re-sync its own selector, and
         * `term` stays authoritative for what a save must be written against.
         * A module with marks in the requested term is never redirected.
         */
        $requestedTermId = $termId;
        $termsWithMarks  = $this->db->fetchAll(
            "SELECT mm.academic_term_id AS id,
                    COALESCE(t.label, CONCAT('Term ', mm.academic_term_id)) AS label,
                    COUNT(*) AS mark_count
             FROM module_marks mm
             LEFT JOIN academic_terms t ON t.id = mm.academic_term_id
             WHERE mm.module_id = ?
             GROUP BY mm.academic_term_id, t.label
             ORDER BY mark_count DESC, mm.academic_term_id DESC",
            [$moduleId]
        );

        $hasMarksHere = false;
        foreach ($termsWithMarks as $t) {
            if ((int)$t['id'] === $termId) { $hasMarksHere = true; break; }
        }
        if (!$hasMarksHere && count($termsWithMarks) > 0) {
            $termId = (int)$termsWithMarks[0]['id'];
            $term   = $this->db->fetchOne(
                "SELECT id, label FROM academic_terms WHERE id = ? LIMIT 1",
                [$termId]
            ) ?: ['id' => $termId, 'label' => 'Term ' . $termId];
        }

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

        $roster = $this->buildRoster($moduleId, $termId, $module);

        // Workflow status & class-level teaching dates: mode of the saved rows
        // (rows are written together as a batch so they share the same values).
        $workflow = ['status' => 'draft', 'claims_opened_at' => null, 'submitted_at' => null, 'confirmed_at' => null];
        foreach ($roster as $r) {
            if (!empty($r['status'])) {
                $workflow['status'] = $r['status'];
                break;
            }
        }
        // Resolve the submit/confirm actors to names so the sheet can say who
        // locked it, not just when — a locked sheet is otherwise a dead end for
        // whoever needs it re-opened.
        $batchRow = $this->db->fetchOne(
            "SELECT mm.status, mm.claims_opened_at, mm.submitted_at, mm.confirmed_at,
                    mm.teaching_started_on, mm.teaching_ended_on,
                    -- `users` stores one `full_name`; there is no
                    -- first_name/last_name pair on this table. Selecting them
                    -- raised 1054 and made every mark sheet 500 — the whole
                    -- screen, not just this banner.
                    sub.full_name AS submitted_by_name,
                    con.full_name AS confirmed_by_name
             FROM module_marks mm
             LEFT JOIN users sub ON sub.id = mm.submitted_by
             LEFT JOIN users con ON con.id = mm.confirmed_by
             WHERE mm.module_id = ? AND mm.academic_term_id = ?
             ORDER BY mm.id DESC LIMIT 1",
            [$moduleId, $termId]
        ) ?: [];
        if ($batchRow) {
            $workflow['status']            = $batchRow['status'] ?? $workflow['status'];
            $workflow['claims_opened_at']  = $batchRow['claims_opened_at'] ?? null;
            $workflow['submitted_at']      = $batchRow['submitted_at']     ?? null;
            $workflow['confirmed_at']      = $batchRow['confirmed_at']     ?? null;
            $workflow['submitted_by_name'] = $batchRow['submitted_by_name'] ?: null;
            $workflow['confirmed_by_name'] = $batchRow['confirmed_by_name'] ?: null;
            // Prefer batch dates over offering dates.
            if (!empty($batchRow['teaching_started_on'])) {
                $module['teaching_started_on'] = $batchRow['teaching_started_on'];
            }
            if (!empty($batchRow['teaching_ended_on'])) {
                $module['teaching_ended_on'] = $batchRow['teaching_ended_on'];
            }
        }

        // Grade every row from the configured scale before it goes out — the
        // imported marks all carry a NULL `grade` column.
        $roster = $this->withGrades($roster);

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

        $module['level_name'] = \App\Helpers\LevelHelper::name($module['level'] ?? null) ?: null;

        $this->success($response, [
            'module'   => $module,
            'term'     => $term,
            'roster'   => $roster,
            'summary'  => $summary,
            'workflow' => $workflow,
            // `term` may differ from what was asked for — see the redirect
            // above. The client re-syncs its term selector from these so the
            // toolbar never claims a term the sheet is not showing.
            'requested_term_id' => $requestedTermId,
            'terms_with_marks'  => array_map(fn($t) => [
                'id'         => (int)$t['id'],
                'label'      => (string)$t['label'],
                'mark_count' => (int)$t['mark_count'],
            ], $termsWithMarks),
        ], 'Marks fetched.');
    }

    /* ── Bulk upsert — save the whole roster's marks at once ───────────── */

    /**
     * Validate every component score against the maximum sent with it.
     *
     * Keyed by registration number so the client can highlight the offending
     * rows. Maxima themselves are bounded too: they arrive from the client on
     * each payload, so an absurd max would otherwise be a way to smuggle an
     * absurd mark past this check.
     *
     * @return array<string, string[]>
     */
    private function collectRangeErrors(array $records): array
    {
        $components = [
            'cat1'             => ['cat1_max',         15.0,  'CAT1'],
            'cat2'             => ['cat2_max',         15.0,  'CAT2'],
            'cat3'             => ['cat3_max',         15.0,  'CAT3'],
            'partial_exam'     => ['partial_exam_max', 15.0,  'Partial'],
            'exam_1st_sitting' => ['final_exam_max',   40.0,  'Exam 1st sitting'],
            'exam_2nd_sitting' => ['final_exam_max',   40.0,  'Exam 2nd sitting'],
        ];

        $errors = [];

        foreach ($records as $r) {
            $reg = trim((string) ($r['student_regnumber'] ?? ''));
            if ($reg === '') continue;

            foreach ($components as $field => [$maxField, $defaultMax, $label]) {
                $value = $this->parseDecimal($r[$field] ?? null);
                if ($value === null) continue;

                $max = $this->parseDecimal($r[$maxField] ?? null) ?? $defaultMax;

                // A max of zero or less cannot be satisfied by any mark, and a
                // wildly large one defeats the check entirely. 100 is well
                // above any real component on the CUR template.
                if ($max <= 0 || $max > 100) {
                    $errors[$reg][] = "{$label}: the maximum sent ({$max}) is not a usable mark total.";
                    continue;
                }

                if ($value < 0) {
                    $errors[$reg][] = "{$label}: {$value} is negative.";
                } elseif ($value > $max) {
                    $errors[$reg][] = "{$label}: {$value} is above the maximum of {$max}.";
                }
            }
        }

        return $errors;
    }

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
        $this->ensureSheetUnlocked($response, $moduleId, $termId);

        // ── Range check, before anything is written ──────────────────────
        // Nothing here validated a component against its maximum, so a CAT of
        // 999 out of 15 stored happily and produced a percentage well over
        // 100 — which then flowed into the grade, the transcript and the
        // deliberation sheet. Uploading a filled-in template makes that a
        // single typo away, so the sheet is checked as a whole and rejected
        // as a whole: a partial write would leave the grid disagreeing with
        // the database on rows the user never saw fail.
        $rangeErrors = $this->collectRangeErrors($records);
        if ($rangeErrors !== []) {
            $this->error(
                $response,
                'Some marks are outside their allowed range. Nothing was saved.',
                422,
                $rangeErrors
            );
        }

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

        /* Keep the `superseded` flag true for this module + term.
         *
         * The INSERT above says ON DUPLICATE KEY UPDATE, but there is no UNIQUE
         * key on (module_id, student_regnumber, academic_term_id) — only the
         * auto-increment PK — so that branch never fires and every save appends
         * a new row. That is how 71,648 (module, student, term) combinations
         * ended up with duplicates, up to 33 deep.
         *
         * Rather than delete history, migration 127 flags the current row per
         * combination and every read filters on it. One statement re-establishes
         * that here, for the batch just written: newest id per student wins.
         */
        $this->db->execute(
            "UPDATE module_marks mm
             LEFT JOIN (
                 SELECT MAX(id) AS id
                 FROM module_marks
                 WHERE module_id = ? AND academic_term_id = ?
                 GROUP BY student_regnumber
             ) live ON live.id = mm.id
             SET mm.superseded = IF(live.id IS NULL, 1, 0)
             WHERE mm.module_id = ? AND mm.academic_term_id = ?",
            [$moduleId, $termId, $moduleId, $termId]
        );

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

        // Confirming locks the sheet; `reset` is the ONLY way back out of a
        // locked sheet. Both are registry acts — gating them on
        // RECORD_MODULE_MARKS (as this did before) let the same lecturer who
        // entered the marks confirm them and immediately unlock and change
        // them, which makes confirmation meaningless.
        if ($action === 'confirm' || $action === 'reset') {
            if (!$this->hasPerm($request, Permissions::CONFIRM_MODULE_MARKS)) {
                $this->error(
                    $response,
                    $action === 'confirm'
                        ? 'You do not have permission to confirm marks.'
                        : 'Only the registry can re-open a locked mark sheet.',
                    403
                );
            }
        } else {
            // draft → claims_open → submitted are recorder-side transitions,
            // but they must not walk backwards out of a locked sheet.
            $this->ensureSheetUnlocked($response, $moduleId, $termId);
        }

        $userId = $this->authUserId($request) ?: null;

        if ($sets['col']) {
            // Stamp the actor alongside the timestamp for submit/confirm so a
            // locked sheet can be traced to a person, not just a moment.
            $actorSql = match ($action) {
                'submit'  => ', submitted_by = COALESCE(submitted_by, ?)',
                'confirm' => ', confirmed_by = COALESCE(confirmed_by, ?)',
                default   => '',
            };
            $params = [$sets['status']];
            if ($actorSql !== '') $params[] = $userId;
            $params[] = $moduleId;
            $params[] = $termId;

            $this->db->execute(
                "UPDATE module_marks
                 SET status = ?, {$sets['col']} = COALESCE({$sets['col']}, NOW()){$actorSql}
                 WHERE module_id = ? AND academic_term_id = ?",
                $params
            );
        } else {
            $this->db->execute(
                "UPDATE module_marks
                 SET status = ?, claims_opened_at = NULL, submitted_at = NULL, confirmed_at = NULL,
                     submitted_by = NULL, confirmed_by = NULL
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
        $row = $this->db->fetchOne(
            "SELECT module_id, academic_term_id FROM module_marks WHERE id = ?",
            [$id]
        );
        if (!$row) $this->error($response, 'Mark not found.', 404);

        $this->ensureCanRecordForModule($request, $response, (int)$row['module_id']);
        // Clearing a row is a write like any other — a locked sheet stays locked.
        $this->ensureSheetUnlocked($response, (int)$row['module_id'], (int)$row['academic_term_id']);

        $this->db->execute("DELETE FROM module_marks WHERE id = ?", [$id]);
        $this->success($response, null, 'Mark cleared.');
    }

    /* ── Per-student summary (used on student details page) ────────────── */

    /** id-based variants of the regnumber routes — necessary because some
     *  regnumbers have slashes which break path-segment routing. */
    /**
     * A whole-student view (every module, every term) is far broader than a
     * single mark sheet, so it must not be readable by any lecturer who happens
     * to hold RECORD_MODULE_MARKS. Admins (MANAGE_MODULE_MARKS) keep the full
     * view; a lecturer may only open a student who is registered on one of THEIR
     * modules.
     */
    private function ensureCanReadStudent(Request $request, Response $response, string $reg): void
    {
        $allowed = $this->teachableModuleIds($request);
        if ($allowed === null) {
            return; // MANAGE_MODULE_MARKS / superadmin — full scope
        }
        if ($allowed === [] || $reg === '') {
            $this->error($response, 'You are not assigned to any of this student\'s modules.', 403);
        }
        $ph  = implode(',', array_fill(0, count($allowed), '?'));
        $hit = $this->db->fetchOne(
            "SELECT 1 AS ok FROM `module_registrations`
              WHERE student_regnumber = ? AND module_id IN ($ph) LIMIT 1",
            array_merge([$reg], $allowed)
        );
        if (!$hit) {
            $this->error($response, 'You are not assigned to any of this student\'s modules.', 403);
        }
    }

    public function studentMarksById(Request $request, Response $response): never
    {
        $reg = $this->resolveRegnumberById($request, $response);
        $request->setRouteParams(['regnumber' => $reg]);
        $this->studentMarks($request, $response);
    }

    /**
     * GET /api/marks/students/by-id/:id/coverage
     *
     * What the student has done against what their programme still requires.
     *
     * "Remaining" is the programme curriculum (`module_programs` for the
     * student's `std_option`) minus every module they already hold a live mark
     * for. Marks OUTSIDE that curriculum still count as completed — students
     * carry marks from earlier options and from the legacy import — they simply
     * cannot make a curriculum module stop being outstanding.
     */
    public function studentCoverageById(Request $request, Response $response): never
    {
        $reg = $this->resolveRegnumberById($request, $response);

        $student = $this->db->fetchOne(
            "SELECT st.id, st.regnumber, st.fname, st.lname, st.current_level,
                    st.std_option, o.id AS option_id, o.name AS option_name, o.acro AS option_acro
             FROM `student` st
             -- `options.name` is utf8mb4_unicode_ci while `student.std_option`
             -- is general_ci; both sides are pinned or MySQL raises 1267.
             LEFT JOIN options o
                    ON CAST(o.id AS CHAR) COLLATE utf8mb4_unicode_ci
                     = st.std_option      COLLATE utf8mb4_unicode_ci
             WHERE st.regnumber = ? LIMIT 1",
            [$reg]
        ) ?: ['regnumber' => $reg];

        // Completed — every live mark, newest row per module/term.
        $completed = $this->db->fetchAll(
            "SELECT mm.module_id,
                    COALESCE(m.module_code, CONCAT('MODULE-', mm.module_id)) AS module_code,
                    COALESCE(m.module_name, 'Unknown module (not in catalogue)') AS module_name,
                    m.module_credits, m.level,
                    mm.cat_marks, mm.exam_marks, mm.total, mm.percentage, mm.grade,
                    mm.status, t.label AS term_label, y.label AS year_label,
                    mm.created_at
             FROM module_marks mm
             LEFT JOIN modules m         ON m.module_id = mm.module_id
             LEFT JOIN academic_terms t  ON t.id = mm.academic_term_id
             LEFT JOIN academic_years y  ON y.id = t.academic_year_id
             WHERE mm.student_regnumber = ? AND mm.superseded = 0
             ORDER BY m.level ASC, module_code ASC",
            [$reg]
        );

        // Remaining — curriculum modules with no live mark for this student.
        $optionId  = (int)($student['option_id'] ?? 0);
        $remaining = $optionId > 0 ? $this->db->fetchAll(
            "SELECT m.module_id, m.module_code, m.module_name, m.module_credits, m.level
             FROM module_programs mp
             JOIN modules m ON m.module_id = mp.module_id
             WHERE mp.option_id = ?
               AND m.status <> 'archived'
               AND NOT EXISTS (
                   SELECT 1 FROM module_marks mm
                   WHERE mm.student_regnumber = ?
                     AND mm.module_id = m.module_id
                     AND mm.superseded = 0
               )
             ORDER BY m.level ASC, m.module_code ASC",
            [$optionId, $reg]
        ) : [];

        $completed = \App\Helpers\LevelHelper::decorate($this->withGrades($completed));
        $remaining = \App\Helpers\LevelHelper::decorate($remaining);

        $creditsDone = 0.0;
        $passed = 0; $failed = 0;
        foreach ($completed as $c) {
            $creditsDone += (float)($c['module_credits'] ?? 0);
            $pct = $this->dec($c['percentage'] ?? null);
            if ($pct !== null) { if ($pct >= 50) $passed++; else $failed++; }
        }
        $creditsLeft = 0.0;
        foreach ($remaining as $r) $creditsLeft += (float)($r['module_credits'] ?? 0);

        // `module_programs` is a legacy bulk import for the big Education
        // options (18-21, 26-28 map to 272-273 modules, against 129 for the
        // largest genuine programme), so "remaining" there is mostly noise.
        // Reuse the audit service's threshold rather than inventing a second one.
        $curriculumSize = count($completed) + count($remaining);
        $curriculumSize = $optionId > 0
            ? (int)($this->db->fetchOne(
                "SELECT COUNT(*) AS c
                 FROM module_programs mp
                 JOIN modules m ON m.module_id = mp.module_id
                 WHERE mp.option_id = ? AND m.status <> 'archived'",
                [$optionId]
              )['c'] ?? 0)
            : 0;
        $suspect = $curriculumSize > \App\Services\GraduationAuditService::CURRICULUM_SUSPECT_THRESHOLD;

        $this->success($response, [
            'student'   => $student,
            'completed' => $completed,
            'remaining' => $remaining,
            'totals'    => [
                'completed'         => count($completed),
                'remaining'         => count($remaining),
                'passed'            => $passed,
                'failed'            => $failed,
                'credits_completed' => round($creditsDone, 1),
                'credits_remaining' => round($creditsLeft, 1),
                // No programme mapped means "remaining" cannot be computed —
                // the UI says so rather than implying the student is finished.
                'has_curriculum'     => $optionId > 0,
                'curriculum_size'    => $curriculumSize,
                // True when module_programs looks like the legacy bulk import
                // rather than a real curriculum; the UI warns instead of
                // presenting a 200-module backlog as fact.
                'curriculum_suspect' => $suspect,
            ],
        ], 'Student coverage loaded.');
    }

    /** Numeric helper shared with the coverage roll-up. */
    private function dec(mixed $v): ?float
    {
        if ($v === null || $v === '') return null;
        return is_numeric($v) ? (float)$v : null;
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
        $this->ensureCanReadStudent($request, $response, $reg);

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
        $this->ensureCanReadStudent($request, $response, $reg);

        [$rows, , $student] = $this->loadTranscriptRows($reg, $request);
        $html = TranscriptPdf::buildHtml($student, $rows);
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

        [$rows, , $student] = $this->loadTranscriptRows($reg, $request);
        $html = TranscriptPdf::buildHtml($student, $rows);
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
                    d.dep_name, d.dep_acronym,
                    o.name AS option_name, o.acro AS option_acro
             FROM `student` s
             LEFT JOIN `faculty`      f ON CAST(f.fac_id AS CHAR) COLLATE utf8mb4_unicode_ci = s.faculty COLLATE utf8mb4_unicode_ci
             LEFT JOIN `departements` d ON CAST(d.dep_id AS CHAR) COLLATE utf8mb4_unicode_ci = s.department COLLATE utf8mb4_unicode_ci
             LEFT JOIN `options`      o ON CAST(o.id AS CHAR) COLLATE utf8mb4_unicode_ci = s.std_option COLLATE utf8mb4_unicode_ci
             WHERE s.regnumber = ? LIMIT 1",
            [$reg]
        ) ?: ['regnumber' => $reg];

        $args = [$reg];
        // One row per (module, term). `module_marks` carries repeated rows for
        // the same student+module — re-entries accumulated over the years, and
        // the consolidated legacy import added more. Without this the record
        // lists a module several times AND the totals below are computed over
        // the duplicates: one student showed 286 "modules" for 99 real ones,
        // inflating total_credits and skewing the weighted average. The newest
        // row wins, matching how the mark sheet resolves the same collision.
        $where = "WHERE mm.student_regnumber = ? AND mm.superseded = 0";
        if ($yearId > 0) {
            $where .= " AND t.academic_year_id = ?";
            $args[] = $yearId;
        }

        $rows = $this->db->fetchAll(
            "SELECT mm.id, mm.module_id, mm.cat_marks, mm.assignment_marks, mm.exam_marks,
                    mm.cat_max, mm.assignment_max, mm.exam_max,
                    mm.total, mm.percentage, mm.grade, mm.remarks, mm.updated_at,
                    mm.is_exempted, mm.exemption_reason,
                    -- A mark can outlive its module (deleted, or never imported).
                    -- Labelling the orphan puts it in front of the registry to
                    -- fix; a blank row on a signed transcript just looks broken,
                    -- and dropping it would quietly shorten the record. Same
                    -- treatment as the coverage view.
                    COALESCE(m.module_code, CONCAT('MODULE-', mm.module_id)) AS module_code,
                    COALESCE(m.module_name, 'Unknown module (not in catalogue)') AS module_name,
                    m.module_credits, m.level,
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

        // Collapse the catalogue's duplicate module rows before anything is
        // counted — otherwise the same module is both listed twice and counted
        // twice in the totals below.
        $rows = $this->dedupeTranscriptRows($rows);

        // Compute per-module credit_point = credits × marks/100 weighted equivalent.
        // The transcript model uses MARKS/100 directly (so percentage is the mark).
        $totalCredits      = 0;
        $totalCreditPoints = 0.0;
        $passed            = 0;
        $failed            = 0;
        // Grade the rows from the configured scale first — imported marks carry
        // a NULL `grade`, which is why a transcript of 44 legacy modules showed
        // a dash in every Grade cell.
        $rows = \App\Helpers\LevelHelper::decorate($this->withGrades($rows));

        foreach ($rows as &$r) {
            $credits = (int)($r['module_credits'] ?? 0);
            $pct     = $r['percentage'] !== null ? (float)$r['percentage'] : null;
            $r['credit_point'] = ($pct !== null) ? round($credits * $pct, 2) : null;

            if ($pct !== null) {
                $totalCredits      += $credits;
                $totalCreditPoints += $credits * $pct;
                if ($pct >= GradingScale::PASS_MARK) $passed++; else $failed++;
            }
        }
        unset($r);

        $weightedAvg = $totalCredits > 0 ? round($totalCreditPoints / $totalCredits, 2) : null;
        $overallGrade = $weightedAvg !== null ? $this->gradeFor($weightedAvg) : null;
        $decision = $weightedAvg === null ? null
            : (($failed === 0 && $weightedAvg >= GradingScale::PASS_MARK) ? 'Promoted' : 'Repeat');

        $totals = [
            'modules'              => count($rows),
            'total_credits'        => $totalCredits,
            'total_credit_points'  => $totalCreditPoints,
            'weighted_average'     => $weightedAvg,
            'overall_grade'        => $overallGrade,
            'overall_grade_label'  => $weightedAvg !== null ? $this->gradeLabel($overallGrade ?? '') : null,
            'overall_grade_point'  => $weightedAvg !== null ? GradingScale::gradePointFor($weightedAvg) : null,
            'decision'             => $decision,
            'passed'               => $passed,
            'failed'               => $failed,
            // The degree class the regulations award, computed from the rows
            // just loaded rather than from the average — see
            // DegreeClassificationService::honours(). A year-filtered request
            // holds only part of the record, so classifying it would report a
            // class off an incomplete final year.
            'classification'       => $yearId > 0 ? null : DegreeClassificationService::honours($rows),
        ];

        return [$rows, $totals, $student];
    }

    /**
     * Collapse catalogue twins so a module appears once per level.
     *
     * `modules.module_code` is dirty from the legacy import: the same module
     * exists several times under codes that differ only by a trailing tab or
     * stray space ("CCU8113\t" vs "CCU8113 "), each with its own `module_id`.
     * `mm.superseded` only resolves rows that share a module_id, so both twins
     * reach the transcript and the student reads "Social Doctirne of the
     * Church" directly above "Social Doctrine of the Church" — and, worse, is
     * credited twice for one module in `total_credits` and the weighted
     * average.
     *
     * The key is the whitespace-stripped code AND the level, because a code
     * genuinely can cover two different modules across levels: EDU8123 is
     * "Theories and practices of teaching and learning" at level 1 and
     * "Guidance, Counseling and Inclusive Education" at level 2. Keying on the
     * code alone would silently drop one of them.
     *
     * @param  array<int,array<string,mixed>> $rows
     * @return array<int,array<string,mixed>>
     */
    private function dedupeTranscriptRows(array $rows): array
    {
        $best = [];
        foreach ($rows as $r) {
            $raw = (string)($r['module_code'] ?? '');
            // Codes reach the UI with the import's tabs and double spaces still
            // in them ("ENGS  1321"); tidy them once, here, so every consumer
            // shows the same string.
            $r['module_code'] = trim((string)preg_replace('/\s+/', ' ', $raw));

            $key = strtoupper((string)preg_replace('/\s+/', '', $raw))
                 . '|' . (string)($r['level'] ?? '');
            // A row with no code is not a duplicate of the next codeless row —
            // keep those apart by module_id rather than merging them all.
            if ($r['module_code'] === '') {
                $key .= '|' . (string)($r['module_id'] ?? $r['id'] ?? '');
            }

            if (!isset($best[$key]) || $this->transcriptRowWins($r, $best[$key])) {
                $best[$key] = $r;
            }
        }
        return array_values($best);
    }

    /**
     * Which of two rows for the same module survives: a marked row always beats
     * an unmarked one, then the newest wins — the same rule the mark sheet uses
     * for this collision.
     */
    private function transcriptRowWins(array $candidate, array $incumbent): bool
    {
        $hasMark = static fn(array $r): bool => ($r['percentage'] ?? null) !== null;
        if ($hasMark($candidate) !== $hasMark($incumbent)) {
            return $hasMark($candidate);
        }

        $stamp = static fn(array $r): string => (string)($r['updated_at'] ?? '');
        if ($stamp($candidate) !== $stamp($incumbent)) {
            return $stamp($candidate) > $stamp($incumbent);
        }
        return (int)($candidate['id'] ?? 0) > (int)($incumbent['id'] ?? 0);
    }

    /** The band's own description ('Distinction', 'Credit', …) — no longer a
     *  hardcoded A–E lookup, so renaming a band renames it everywhere. */
    private function gradeLabel(string $grade): string
    {
        return GradingScale::labelForGrade($grade) ?? '';
    }

    /* ── small helpers ─────────────────────────────────────────────────── */

    private function parseDecimal(mixed $v): ?float
    {
        if ($v === null || $v === '') return null;
        if (!is_numeric($v))           return null;
        return (float)$v;
    }
}

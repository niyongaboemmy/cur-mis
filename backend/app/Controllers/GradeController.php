<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use Core\Database;
use App\Models\GradingScaleModel;
use App\Helpers\ValidationHelper;
use App\Services\SystemLogService;

/**
 * Grade management — configurable grading scale (bands → letter + grade point)
 * and GPA / CGPA computation derived from the live module_marks data.
 *
 * GPA is computed on demand from `module_marks` joined to `modules`
 * (for credits) using the configured `grading_scales.grade_point`:
 *
 *   term GPA = Σ(grade_point × credits) / Σ(credits)   over that term
 *   CGPA     = same, cumulative across all completed modules
 */
class GradeController extends BaseController
{
    private GradingScaleModel $scales;
    private Database          $db;

    public function __construct()
    {
        $this->scales = new GradingScaleModel();
        $this->db     = Database::getInstance();
    }

    /* ══════════════════════════════════════════════════════════════════════
     * Grading scale configuration
     * ═══════════════════════════════════════════════════════════════════ */

    // GET /api/grades/scales
    public function listScales(Request $request, Response $response): never
    {
        $this->success($response, $this->scales->allBands(), 'Grading scale fetched.');
    }

    // POST /api/grades/scales
    public function createScale(Request $request, Response $response): never
    {
        $actor = (array) $request->param('_auth_user');
        $body  = $request->body();

        $payload = $this->validateScale($body, $response);
        $id = (int) $this->scales->create($payload);

        SystemLogService::log('CREATE', 'GRADING', "User {$actor['id']} added grading band {$payload['grade']}.",
            $id, 'grading_scale', $payload, $actor);

        $this->success($response, $this->scales->find($id), 'Grading band added.', 201);
    }

    // PUT /api/grades/scales/:id
    public function updateScale(Request $request, Response $response): never
    {
        $actor = (array) $request->param('_auth_user');
        $id    = (int) $request->param('id');
        if (!$this->scales->find($id)) {
            $this->error($response, 'Grading band not found.', 404);
        }

        $payload = $this->validateScale($request->body(), $response);
        $this->scales->update($id, $payload);

        SystemLogService::log('UPDATE', 'GRADING', "User {$actor['id']} updated grading band {$id}.",
            $id, 'grading_scale', $payload, $actor);

        $this->success($response, $this->scales->find($id), 'Grading band updated.');
    }

    // DELETE /api/grades/scales/:id
    public function deleteScale(Request $request, Response $response): never
    {
        $actor = (array) $request->param('_auth_user');
        $id    = (int) $request->param('id');
        if (!$this->scales->find($id)) {
            $this->error($response, 'Grading band not found.', 404);
        }
        $this->scales->delete($id);

        SystemLogService::log('DELETE', 'GRADING', "User {$actor['id']} deleted grading band {$id}.",
            $id, 'grading_scale', null, $actor);

        $this->success($response, null, 'Grading band deleted.');
    }

    /* ══════════════════════════════════════════════════════════════════════
     * GPA / CGPA
     * ═══════════════════════════════════════════════════════════════════ */

    // GET /api/grades/gpa/by-id/:id
    public function gpaById(Request $request, Response $response): never
    {
        $id  = (int) $request->param('id');
        $row = $this->db->fetchOne('SELECT regnumber FROM `student` WHERE id = ? LIMIT 1', [$id]);
        if (!$row || empty($row['regnumber'])) {
            $this->error($response, 'Student not found.', 404);
        }
        $this->success($response, $this->computeGpa((string) $row['regnumber']), 'GPA computed.');
    }

    // GET /api/grades/my-gpa
    public function myGpa(Request $request, Response $response): never
    {
        $user = (array) ($request->param('_auth_user') ?? []);
        $reg  = (string) ($user['regnumber'] ?? $user['username'] ?? '');
        if ($reg === '') {
            $this->error($response, 'No student profile linked to this account.', 404);
        }
        // Confirm it's a real regnumber.
        $exists = $this->db->fetchOne('SELECT regnumber FROM `student` WHERE regnumber = ? LIMIT 1', [$reg]);
        if (!$exists) {
            // Fall back to email match.
            $byEmail = $this->db->fetchOne('SELECT regnumber FROM `student` WHERE email = ? LIMIT 1', [$user['email'] ?? '']);
            if (!$byEmail) {
                $this->error($response, 'No student profile linked to this account.', 404);
            }
            $reg = (string) $byEmail['regnumber'];
        }
        $this->success($response, $this->computeGpa($reg), 'GPA computed.');
    }

    /* ── computation ──────────────────────────────────────────────────────── */

    /**
     * Compute per-term GPA and cumulative CGPA for one student.
     *
     * @return array{
     *   terms: array<int,array<string,mixed>>,
     *   cgpa: float|null,
     *   total_credits: int,
     *   total_quality_points: float,
     *   grade_points_available: bool
     * }
     */
    private function computeGpa(string $reg): array
    {
        $bands = $this->scales->allBands();
        $hasGradePoints = !empty($bands);

        $rows = $this->db->fetchAll(
            "SELECT mm.percentage, m.module_credits,
                    t.id AS term_id, t.label AS term_label,
                    y.id AS year_id, y.label AS year_label
             FROM module_marks mm
             LEFT JOIN modules m        ON m.module_id = mm.module_id
             LEFT JOIN academic_terms t ON t.id = mm.academic_term_id
             LEFT JOIN academic_years y ON y.id = t.academic_year_id
             WHERE mm.student_regnumber = ?
               AND mm.percentage IS NOT NULL
             ORDER BY y.start_date ASC, t.start_date ASC",
            [$reg]
        );

        // Group by term, accumulating quality points (gp × credits) and credits.
        $terms = [];
        $cumCredits = 0;
        $cumQuality = 0.0;

        foreach ($rows as $r) {
            $credits = (int) ($r['module_credits'] ?? 0);
            $pct     = (float) $r['percentage'];
            // Ladder lookup, not a strict min<=pct<=max range: the configured
            // bands leave gaps (A is 80–100, B+ is 70–79), and a range match
            // returned null for a percentage like 79.50 — which `continue`
            // below then dropped from the GPA entirely.
            $gp      = \App\Helpers\GradingScale::gradePointFor($pct);
            if ($gp === null || $credits <= 0) {
                continue;
            }

            $key = ($r['term_id'] ?? 0) . ':' . ($r['year_id'] ?? 0);
            if (!isset($terms[$key])) {
                $terms[$key] = [
                    'term_id'       => (int) ($r['term_id'] ?? 0),
                    'term_label'    => $r['term_label'] ?? '—',
                    'year_id'       => (int) ($r['year_id'] ?? 0),
                    'year_label'    => $r['year_label'] ?? '—',
                    'credits'       => 0,
                    'quality_points'=> 0.0,
                ];
            }
            $terms[$key]['credits']        += $credits;
            $terms[$key]['quality_points'] += $gp * $credits;

            $cumCredits += $credits;
            $cumQuality += $gp * $credits;
        }

        $termList = array_values(array_map(function ($t) {
            $t['gpa'] = $t['credits'] > 0 ? round($t['quality_points'] / $t['credits'], 2) : null;
            $t['quality_points'] = round($t['quality_points'], 2);
            return $t;
        }, $terms));

        return [
            'terms'                  => $termList,
            'cgpa'                   => $cumCredits > 0 ? round($cumQuality / $cumCredits, 2) : null,
            'total_credits'          => $cumCredits,
            'total_quality_points'   => round($cumQuality, 2),
            'grade_points_available' => $hasGradePoints,
        ];
    }

    /* ── validation ───────────────────────────────────────────────────────── */

    private function validateScale(array $body, Response $response): array
    {
        $errors = ValidationHelper::validate($body, [
            'grade'       => ['required', 'max:5'],
            'min_marks'   => ['required'],
            'max_marks'   => ['required'],
            'grade_point' => ['required'],
        ]);
        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        $min = (float) $body['min_marks'];
        $max = (float) $body['max_marks'];
        if ($min > $max) {
            $this->error($response, 'Minimum marks cannot exceed maximum marks.', 422);
        }

        return [
            'grade'       => strtoupper(trim((string) $body['grade'])),
            'min_marks'   => $min,
            'max_marks'   => $max,
            'grade_point' => (float) $body['grade_point'],
            'description' => trim((string) ($body['description'] ?? '')) ?: null,
        ];
    }
}

<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Database;
use Core\Request;
use Core\Response;

/**
 * CRUD for the `grading_scales` table.
 *
 * The grading scale maps percentage ranges to letter grades and GPA points.
 * CUR defaults (seeded on reset):
 *   A  80–100  4.0  Very Good
 *   B  70–79   3.5  Good
 *   C  60–69   3.0  Satisfaction
 *   D  50–59   2.5  Pass
 *   E   0–49   0.0  Fail
 */
class GradingScaleController extends BaseController
{
    private Database $db;

    public function __construct()
    {
        $this->db = Database::getInstance();
    }

    /** GET /api/grading-scales — return all rows ordered by min_marks DESC. */
    public function list(Request $request, Response $response): never
    {
        $rows = $this->db->fetchAll(
            "SELECT id, grade, min_marks, max_marks, grade_point, description
             FROM grading_scales
             ORDER BY min_marks DESC"
        );
        $this->success($response, $rows, 'Grading scale fetched.');
    }

    /**
     * PUT /api/grading-scales
     * Body: { scales: [{ grade, min_marks, max_marks, grade_point, description? }] }
     * Replaces the entire table with the submitted rows (delete + re-insert).
     */
    public function upsert(Request $request, Response $response): never
    {
        $body   = $request->body();
        $scales = $body['scales'] ?? [];

        if (!is_array($scales) || count($scales) === 0) {
            $this->error($response, 'scales array is required and must not be empty.', 422);
        }

        foreach ($scales as $i => $s) {
            if (!isset($s['grade'], $s['min_marks'], $s['max_marks'], $s['grade_point'])) {
                $this->error($response, "Row #{$i}: grade, min_marks, max_marks, grade_point are required.", 422);
            }
        }

        $this->db->execute("DELETE FROM grading_scales");

        foreach ($scales as $s) {
            $this->db->execute(
                "INSERT INTO grading_scales (grade, min_marks, max_marks, grade_point, description)
                 VALUES (?, ?, ?, ?, ?)",
                [
                    strtoupper(trim((string)$s['grade'])),
                    (float)$s['min_marks'],
                    (float)$s['max_marks'],
                    (float)$s['grade_point'],
                    isset($s['description']) ? (string)$s['description'] : null,
                ]
            );
        }

        $this->success($response, null, 'Grading scale saved.');
    }

    /**
     * POST /api/grading-scales/reset
     * Replaces the table with CUR's standard five-band scale.
     */
    public function reset(Request $request, Response $response): never
    {
        $defaults = [
            ['A', 80.0, 100.0, 4.0, 'Very Good'],
            ['B', 70.0,  79.0, 3.5, 'Good'],
            ['C', 60.0,  69.0, 3.0, 'Satisfaction'],
            ['D', 50.0,  59.0, 2.5, 'Pass'],
            ['E',  0.0,  49.0, 0.0, 'Fail'],
        ];

        $this->db->execute("DELETE FROM grading_scales");

        foreach ($defaults as [$grade, $min, $max, $point, $desc]) {
            $this->db->execute(
                "INSERT INTO grading_scales (grade, min_marks, max_marks, grade_point, description)
                 VALUES (?, ?, ?, ?, ?)",
                [$grade, $min, $max, $point, $desc]
            );
        }

        $this->success($response, null, 'Grading scale reset to CUR defaults.');
    }
}

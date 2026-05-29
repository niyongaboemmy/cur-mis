<?php

declare(strict_types=1);

namespace App\Models;

/**
 * Configurable grading scale — maps a marks band to a letter grade and a
 * grade point used for GPA / CGPA computation.
 *
 * Table `grading_scales`:
 *   id, grade, min_marks, max_marks, grade_point, description
 */
class GradingScaleModel extends BaseModel
{
    protected string $table = 'grading_scales';

    protected array $fillable = [
        'grade',
        'min_marks',
        'max_marks',
        'grade_point',
        'description',
    ];

    /** All bands, highest marks first. */
    public function allBands(): array
    {
        return $this->db->fetchAll(
            "SELECT id, grade, min_marks, max_marks, grade_point, description
             FROM grading_scales
             ORDER BY min_marks DESC"
        );
    }

    /**
     * Resolve a percentage to the matching band's grade point.
     * Returns null when no band covers the value.
     *
     * @param array<int,array<string,mixed>> $bands pre-fetched bands (allBands())
     */
    public static function gradePointFor(float $pct, array $bands): ?float
    {
        foreach ($bands as $b) {
            $min = (float) $b['min_marks'];
            $max = (float) $b['max_marks'];
            if ($pct >= $min && $pct <= $max) {
                return (float) $b['grade_point'];
            }
        }
        return null;
    }

    /** Letter grade for a percentage, or null. */
    public static function gradeFor(float $pct, array $bands): ?string
    {
        foreach ($bands as $b) {
            if ($pct >= (float) $b['min_marks'] && $pct <= (float) $b['max_marks']) {
                return (string) $b['grade'];
            }
        }
        return null;
    }
}

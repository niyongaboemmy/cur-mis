<?php

declare(strict_types=1);

namespace App\Models;

class AcademicYearModel extends BaseModel
{
    protected string $table = 'academic_years';
    protected array $fillable = ['label', 'start_date', 'end_date', 'is_current', 'clearance_threshold'];

    /**
     * Get the currently active academic year.
     */
    public function getActive(): array|false
    {
        return $this->findBy('is_current', 1);
    }
}

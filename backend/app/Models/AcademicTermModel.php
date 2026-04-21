<?php

declare(strict_types=1);

namespace App\Models;

class AcademicTermModel extends BaseModel
{
    protected string $table = 'academic_terms';
    protected array $fillable = ['academic_year_id', 'label', 'start_date', 'end_date', 'is_current'];

    /**
     * Get the currently active academic term.
     */
    public function getActive(): array|false
    {
        return $this->findBy('is_current', 1);
    }
}

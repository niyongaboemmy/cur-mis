<?php

namespace App\Models;

use CodeIgniter\Model;

class UserModulePreference extends Model
{
    protected $table            = 'user_module_preferences';
    protected $primaryKey       = 'id';
    protected $useAutoIncrement = true;
    protected $returnType       = 'object';
    protected $useSoftDeletes   = false;
    protected $allowedFields    = ['user_id', 'module_name', 'selected_academic_year_id'];

    // Dates
    protected $useTimestamps = true;
    protected $dateFormat    = 'datetime';
    protected $createdField  = 'created_at';
    protected $updatedField  = 'updated_at';

    // Validation
    protected $validationRules      = [
        'user_id'                   => 'required|integer|is_not_unique[users.id]',
        'module_name'               => 'required|string|max_length[50]',
        'selected_academic_year_id' => 'permit_empty|integer|is_not_unique[academic_years.id]',
    ];
    protected $validationMessages   = [];
    protected $skipValidation       = false;
    protected $cleanValidationRules = true;

    // Relationships
    public function user()
    {
        return $this->belongsTo('App\Models\User', 'user_id', 'id');
    }

    public function academicYear()
    {
        return $this->belongsTo('App\Models\AcademicYear', 'selected_academic_year_id', 'id');
    }

    /**
     * Get or create a preference, defaulting to current year if not set
     */
    public function getModuleYearForUser($userId, $moduleName, $currentYearId = null)
    {
        $preference = $this
            ->where('user_id', $userId)
            ->where('module_name', $moduleName)
            ->first();

        if (!$preference || !$preference->selected_academic_year_id) {
            return $currentYearId;
        }

        return $preference->selected_academic_year_id;
    }

    /**
     * Set module year preference
     */
    public function setModuleYear($userId, $moduleName, $academicYearId = null)
    {
        return $this->updateOrCreate(
            ['user_id' => $userId, 'module_name' => $moduleName],
            ['selected_academic_year_id' => $academicYearId]
        );
    }

    /**
     * Reset to current year (NULL value means use current)
     */
    public function resetToCurrentYear($userId, $moduleName)
    {
        return $this->setModuleYear($userId, $moduleName, null);
    }

    /**
     * Get all modules user is currently tracking (non-current years)
     */
    public function getTrackedModules($userId, $currentYearId)
    {
        return $this
            ->where('user_id', $userId)
            ->where('selected_academic_year_id !=', $currentYearId)
            ->where('selected_academic_year_id !=', 'NULL', false)
            ->findAll();
    }
}

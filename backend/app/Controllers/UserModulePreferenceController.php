<?php

namespace App\Controllers;

use CodeIgniter\HTTP\ResponseInterface;
use App\Models\UserModulePreference;
use App\Models\AcademicYear;

class UserModulePreferenceController extends BaseController
{
    /**
     * Get module year preference for authenticated user and specific module
     * GET /api/users/me/module-preferences/:module_name
     */
    public function getModuleYear($moduleName)
    {
        try {
            $userId = auth()->id();

            // Validate module name (whitelist)
            $allowedModules = [
                'finance', 'academic', 'hr', 'registry',
                'admissions', 'library', 'hostel', 'exams'
            ];

            if (!in_array($moduleName, $allowedModules)) {
                return $this->respond([
                    'error' => 'Invalid module name',
                    'allowed_modules' => $allowedModules
                ], 400);
            }

            // Get user's preference for this module
            $preferenceModel = new UserModulePreference();
            $preference = $preferenceModel
                ->where('user_id', $userId)
                ->where('module_name', $moduleName)
                ->first();

            // Get selected year or fallback to current year
            $selectedYearId = $preference?->selected_academic_year_id;

            $academicYearModel = new AcademicYear();
            $selectedYear = null;
            $currentYear = null;

            if ($selectedYearId) {
                $selectedYear = $academicYearModel->find($selectedYearId);
            }

            $currentYear = $academicYearModel->where('is_current', 1)->first();

            // If selected year not found, default to current
            if (!$selectedYear && $selectedYearId) {
                $selectedYear = $currentYear;
            } elseif (!$selectedYear) {
                $selectedYear = $currentYear;
            }

            return $this->respond([
                'success' => true,
                'module_name' => $moduleName,
                'selected_academic_year_id' => $selectedYear->id ?? null,
                'selected_academic_year' => $selectedYear,
                'current_academic_year_id' => $currentYear->id ?? null,
                'current_academic_year' => $currentYear,
                'is_using_current_year' => ($selectedYear?->id === $currentYear?->id)
            ]);

        } catch (\Exception $e) {
            log_message('error', 'Error getting module year: ' . $e->getMessage());
            return $this->respond(['error' => 'Failed to get module year'], 500);
        }
    }

    /**
     * Set module year preference for authenticated user
     * POST /api/users/me/module-preferences/:module_name
     * Body: { academic_year_id: 123 } or { academic_year_id: null } to reset
     */
    public function setModuleYear($moduleName)
    {
        try {
            $userId = auth()->id();

            // Validate module name
            $allowedModules = [
                'finance', 'academic', 'hr', 'registry',
                'admissions', 'library', 'hostel', 'exams'
            ];

            if (!in_array($moduleName, $allowedModules)) {
                return $this->respond([
                    'error' => 'Invalid module name',
                    'allowed_modules' => $allowedModules
                ], 400);
            }

            // Get and validate input
            $data = $this->request->getJSON();
            $academicYearId = $data?->academic_year_id;

            // Validate academic year exists (if provided)
            if ($academicYearId) {
                $academicYearModel = new AcademicYear();
                $academicYear = $academicYearModel->find($academicYearId);

                if (!$academicYear) {
                    return $this->respond([
                        'error' => 'Invalid academic year ID',
                        'academic_year_id' => $academicYearId
                    ], 400);
                }
            }

            // Update or create preference
            $preferenceModel = new UserModulePreference();
            $preference = $preferenceModel->updateOrCreate(
                ['user_id' => $userId, 'module_name' => $moduleName],
                ['selected_academic_year_id' => $academicYearId]
            );

            // Log the change for audit trail
            log_message('info', "User {$userId} changed {$moduleName} year to " . ($academicYearId ?? 'CURRENT'));

            return $this->respond([
                'success' => true,
                'module_name' => $moduleName,
                'selected_academic_year_id' => $preference->selected_academic_year_id,
                'message' => $academicYearId ? 'Year changed successfully' : 'Reset to current year'
            ]);

        } catch (\Exception $e) {
            log_message('error', 'Error setting module year: ' . $e->getMessage());
            return $this->respond(['error' => 'Failed to set module year'], 500);
        }
    }

    /**
     * Get all module preferences for authenticated user
     * GET /api/users/me/module-preferences
     */
    public function getAllModulePreferences()
    {
        try {
            $userId = auth()->id();

            $preferenceModel = new UserModulePreference();
            $preferences = $preferenceModel
                ->where('user_id', $userId)
                ->orderBy('module_name', 'ASC')
                ->findAll();

            $academicYearModel = new AcademicYear();
            $currentYear = $academicYearModel->where('is_current', 1)->first();

            $result = [];
            foreach ($preferences as $pref) {
                $selectedYear = $academicYearModel->find($pref->selected_academic_year_id);
                $result[$pref->module_name] = [
                    'academic_year_id' => $pref->selected_academic_year_id,
                    'academic_year_name' => $selectedYear->name ?? $currentYear->name,
                    'is_current_year' => ($pref->selected_academic_year_id === $currentYear->id)
                ];
            }

            return $this->respond([
                'success' => true,
                'module_preferences' => $result,
                'current_academic_year_id' => $currentYear->id,
                'current_academic_year_name' => $currentYear->name
            ]);

        } catch (\Exception $e) {
            log_message('error', 'Error getting all module preferences: ' . $e->getMessage());
            return $this->respond(['error' => 'Failed to get module preferences'], 500);
        }
    }

    /**
     * Reset module preference to current year
     * DELETE /api/users/me/module-preferences/:module_name
     */
    public function resetModuleYear($moduleName)
    {
        try {
            $userId = auth()->id();

            // Validate module name
            $allowedModules = [
                'finance', 'academic', 'hr', 'registry',
                'admissions', 'library', 'hostel', 'exams'
            ];

            if (!in_array($moduleName, $allowedModules)) {
                return $this->respond([
                    'error' => 'Invalid module name',
                    'allowed_modules' => $allowedModules
                ], 400);
            }

            // Update preference to NULL (use current year)
            $preferenceModel = new UserModulePreference();
            $preferenceModel->updateOrCreate(
                ['user_id' => $userId, 'module_name' => $moduleName],
                ['selected_academic_year_id' => null]
            );

            log_message('info', "User {$userId} reset {$moduleName} to current year");

            return $this->respond([
                'success' => true,
                'module_name' => $moduleName,
                'message' => 'Reset to current academic year'
            ]);

        } catch (\Exception $e) {
            log_message('error', 'Error resetting module year: ' . $e->getMessage());
            return $this->respond(['error' => 'Failed to reset module year'], 500);
        }
    }
}

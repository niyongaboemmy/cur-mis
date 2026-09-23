<?php

namespace App\Helpers;

use App\Models\UserModulePreference;
use App\Models\AcademicYear;

/**
 * Helper class for managing per-module academic year selection
 * Provides convenience functions for getting/setting module years
 */
class ModuleYearHelper
{
    /**
     * Get the academic year ID that a user is viewing for a specific module
     * Returns user's preference if set, otherwise returns current year
     *
     * @param int $userId User ID
     * @param string $moduleName Module name (finance, academic, hr, etc)
     * @return int Academic year ID
     */
    public static function getModuleAcademicYearId($userId, $moduleName)
    {
        $preference = (new UserModulePreference())
            ->where('user_id', $userId)
            ->where('module_name', $moduleName)
            ->first();

        if ($preference && $preference->selected_academic_year_id) {
            return $preference->selected_academic_year_id;
        }

        // Return current academic year ID
        $currentYear = (new AcademicYear())
            ->where('is_current', 1)
            ->first();

        return $currentYear?->id ?? null;
    }

    /**
     * Get the full academic year object that a user is viewing for a specific module
     *
     * @param int $userId User ID
     * @param string $moduleName Module name
     * @return object|null Academic year object
     */
    public static function getModuleAcademicYear($userId, $moduleName)
    {
        $yearId = self::getModuleAcademicYearId($userId, $moduleName);

        if (!$yearId) {
            return null;
        }

        return (new AcademicYear())->find($yearId);
    }

    /**
     * Set the academic year for a user's module
     *
     * @param int $userId User ID
     * @param string $moduleName Module name
     * @param int|null $academicYearId Year ID (null = use current)
     * @return UserModulePreference
     */
    public static function setModuleAcademicYear($userId, $moduleName, $academicYearId = null)
    {
        return (new UserModulePreference())->updateOrCreate(
            ['user_id' => $userId, 'module_name' => $moduleName],
            ['selected_academic_year_id' => $academicYearId]
        );
    }

    /**
     * Reset a user's module to current year
     *
     * @param int $userId User ID
     * @param string $moduleName Module name
     * @return UserModulePreference
     */
    public static function resetModuleToCurrentYear($userId, $moduleName)
    {
        return self::setModuleAcademicYear($userId, $moduleName, null);
    }

    /**
     * Get all modules a user is currently tracking (non-current years)
     * Useful for audit or dashboard purposes
     *
     * @param int $userId User ID
     * @return array Array of modules with their selected years
     */
    public static function getTrackedModules($userId)
    {
        $currentYear = (new AcademicYear())
            ->where('is_current', 1)
            ->first();

        $preferences = (new UserModulePreference())
            ->where('user_id', $userId)
            ->where('selected_academic_year_id !=', null)
            ->findAll();

        $tracked = [];
        foreach ($preferences as $pref) {
            if ($pref->selected_academic_year_id != $currentYear?->id) {
                $tracked[$pref->module_name] = [
                    'academic_year_id' => $pref->selected_academic_year_id,
                    'year_name' => (new AcademicYear())->find($pref->selected_academic_year_id)?->name
                ];
            }
        }

        return $tracked;
    }

    /**
     * Check if a user is using current year for a module
     *
     * @param int $userId User ID
     * @param string $moduleName Module name
     * @return bool True if using current year
     */
    public static function isUsingCurrentYear($userId, $moduleName)
    {
        $moduleYearId = self::getModuleAcademicYearId($userId, $moduleName);
        $currentYear = (new AcademicYear())->where('is_current', 1)->first();

        return $moduleYearId === $currentYear?->id;
    }

    /**
     * Build a WHERE clause for queries to filter by module's selected year
     * Usage: $query->where($moduleYearHelper->getYearWhereClause($userId, $moduleName, 'invoices.year_id'))
     *
     * @param int $userId User ID
     * @param string $moduleName Module name
     * @param string $fieldName Database field name to filter (e.g., 'invoices.year_id')
     * @return array Where clause array
     */
    public static function getYearWhereClause($userId, $moduleName, $fieldName)
    {
        $yearId = self::getModuleAcademicYearId($userId, $moduleName);

        return [$fieldName => $yearId];
    }

    /**
     * Get all allowed modules
     *
     * @return array List of allowed module names
     */
    public static function getAllowedModules()
    {
        return [
            'finance',
            'academic',
            'hr',
            'registry',
            'admissions',
            'library',
            'hostel',
            'exams',
        ];
    }

    /**
     * Validate module name
     *
     * @param string $moduleName Module name to validate
     * @return bool True if valid
     */
    public static function isValidModule($moduleName)
    {
        return in_array($moduleName, self::getAllowedModules());
    }
}

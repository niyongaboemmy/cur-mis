<?php

declare(strict_types=1);

namespace App\Constants;

class Permissions
{
    public const MANAGE_ROLES       = 'MANAGE_ROLES';
    public const MANAGE_PERMISSIONS = 'MANAGE_PERMISSIONS';
    public const MANAGE_USERS       = 'MANAGE_USERS';
    public const VIEW_SYSTEM_LOGS   = 'VIEW_SYSTEM_LOGS';

    // System Settings
    public const MANAGE_ACADEMIC_YEARS = 'MANAGE_ACADEMIC_YEARS';
    public const MANAGE_ACADEMIC_TERMS = 'MANAGE_ACADEMIC_TERMS';
    public const VIEW_SYSTEM_BASICS    = 'VIEW_SYSTEM_BASICS';

    // Academic Registry
    public const VIEW_STUDENTS       = 'VIEW_STUDENTS';
    public const MANAGE_ACADEMICS    = 'MANAGE_ACADEMICS';
    public const MANAGE_DEGREES      = 'MANAGE_DEGREES';
    public const MANAGE_FACILITIES   = 'MANAGE_FACILITIES';
    public const MANAGE_DEPARTMENTS  = 'MANAGE_DEPARTMENTS';
    public const MANAGE_OPTIONS      = 'MANAGE_OPTIONS';
    public const MANAGE_LEVELS       = 'MANAGE_LEVELS';
    public const MANAGE_MODULES      = 'MANAGE_MODULES';
    public const MANAGE_SCHOOLS      = 'MANAGE_SCHOOLS';

    // HR Management
    public const VIEW_HR_EMPLOYEES   = 'VIEW_HR_EMPLOYEES';
    public const MANAGE_LEAVE_TYPES  = 'MANAGE_LEAVE_TYPES';

    // Finance
    public const MANAGE_FINANCE = 'MANAGE_FINANCE';

    /**
     * Get all predefined system permissions.
     */
    public static function all(): array
    {
        return [
            self::MANAGE_ROLES,
            self::MANAGE_PERMISSIONS,
            self::MANAGE_USERS,
            self::VIEW_SYSTEM_LOGS,
            self::MANAGE_ACADEMIC_YEARS,
            self::MANAGE_ACADEMIC_TERMS,
            self::VIEW_SYSTEM_BASICS,
            self::VIEW_STUDENTS,
            self::MANAGE_ACADEMICS,
            self::MANAGE_DEGREES,
            self::MANAGE_FACILITIES,
            self::MANAGE_DEPARTMENTS,
            self::MANAGE_OPTIONS,
            self::MANAGE_LEVELS,
            self::MANAGE_MODULES,
            self::MANAGE_SCHOOLS,
            self::VIEW_HR_EMPLOYEES,
            self::MANAGE_LEAVE_TYPES,
            self::MANAGE_FINANCE,
        ];
    }
}

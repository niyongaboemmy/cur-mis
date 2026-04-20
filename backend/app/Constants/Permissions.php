<?php

declare(strict_types=1);

namespace App\Constants;

class Permissions
{
    public const MANAGE_ROLES       = 'MANAGE_ROLES';
    public const MANAGE_PERMISSIONS = 'MANAGE_PERMISSIONS';
    public const MANAGE_USERS       = 'MANAGE_USERS';
    public const VIEW_SYSTEM_LOGS   = 'VIEW_SYSTEM_LOGS';

    // Academic Registry
    public const VIEW_STUDENTS = 'VIEW_STUDENTS';
    public const MANAGE_ACADEMICS = 'MANAGE_ACADEMICS';

    // Finance
    public const MANAGE_FINANCE = 'MANAGE_FINANCE';

    // Examinations
    public const MANAGE_EXAMS = 'MANAGE_EXAMS';

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
            self::VIEW_STUDENTS,
            self::MANAGE_ACADEMICS,
            self::MANAGE_FINANCE,
            self::MANAGE_EXAMS,
        ];
    }
}

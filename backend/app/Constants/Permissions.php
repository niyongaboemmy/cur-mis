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
    public const VIEW_SETTINGS         = 'VIEW_SETTINGS';
    public const MANAGE_SETTINGS       = 'MANAGE_SETTINGS';

    // Academic Registry
    public const VIEW_STUDENTS       = 'VIEW_STUDENTS';
    public const MANAGE_STUDENTS     = 'MANAGE_STUDENTS';
    public const MANAGE_ACADEMICS    = 'MANAGE_ACADEMICS';
    public const MANAGE_DEGREES      = 'MANAGE_DEGREES';
    public const MANAGE_FACILITIES   = 'MANAGE_FACILITIES';
    public const MANAGE_DEPARTMENTS  = 'MANAGE_DEPARTMENTS';
    public const MANAGE_OPTIONS      = 'MANAGE_OPTIONS';
    public const MANAGE_LEVELS       = 'MANAGE_LEVELS';
    public const MANAGE_MODULES      = 'MANAGE_MODULES';
    public const MANAGE_SCHOOLS      = 'MANAGE_SCHOOLS';
    public const VIEW_TIMETABLE      = 'VIEW_TIMETABLE';
    public const MANAGE_TIMETABLE    = 'MANAGE_TIMETABLE';

    // Modules Management Module
    public const MANAGE_MODULE_SCHEDULES     = 'MANAGE_MODULE_SCHEDULES';
    public const MANAGE_MODULE_ASSIGNMENTS   = 'MANAGE_MODULE_ASSIGNMENTS';
    public const MANAGE_MODULE_REGISTRATIONS = 'MANAGE_MODULE_REGISTRATIONS';
    public const VIEW_MY_MODULES             = 'VIEW_MY_MODULES';

    // HR Management
    public const VIEW_HR_EMPLOYEES   = 'VIEW_HR_EMPLOYEES';
    public const MANAGE_HR_EMPLOYEES = 'MANAGE_HR_EMPLOYEES';
    public const MANAGE_LEAVE_TYPES  = 'MANAGE_LEAVE_TYPES';
    public const VIEW_PAYROLL        = 'VIEW_PAYROLL';
    public const MANAGE_PAYROLL      = 'MANAGE_PAYROLL';

    // Finance
    public const VIEW_FINANCE    = 'VIEW_FINANCE';
    public const MANAGE_FINANCE  = 'MANAGE_FINANCE';

    // Admissions
    public const MANAGE_ADMISSION_REQUIREMENTS = 'MANAGE_ADMISSION_REQUIREMENTS';
    public const MANAGE_STUDENT_APPLICATIONS   = 'MANAGE_STUDENT_APPLICATIONS';
    public const VERIFY_DOCUMENTS              = 'VERIFY_DOCUMENTS';
    public const MANAGE_ADMISSIONS             = 'MANAGE_ADMISSIONS';
    public const VIEW_MERIT_LIST               = 'VIEW_MERIT_LIST';
    public const MANAGE_MERIT_LIST             = 'MANAGE_MERIT_LIST';

    // Examinations
    public const VIEW_EXAMS   = 'VIEW_EXAMS';
    public const MANAGE_EXAMS = 'MANAGE_EXAMS';

    // Attendance
    public const VIEW_ATTENDANCE   = 'VIEW_ATTENDANCE';
    public const RECORD_ATTENDANCE = 'RECORD_ATTENDANCE';
    public const MANAGE_ATTENDANCE = 'MANAGE_ATTENDANCE';

    // Student Clearance
    public const VIEW_CLEARANCE   = 'VIEW_CLEARANCE';
    public const MANAGE_CLEARANCE = 'MANAGE_CLEARANCE';

    // External portals (role-bound permissions assigned via RBAC seed)
    public const ACCESS_APPLICANT_PORTAL = 'ACCESS_APPLICANT_PORTAL';
    public const ACCESS_STUDENT_PORTAL   = 'ACCESS_STUDENT_PORTAL';

    // Applicant self-service
    public const MANAGE_OWN_PROFILE = 'MANAGE_OWN_PROFILE';

    /**
     * Get all predefined system permissions.
     *
     * This list is the single source of truth — both the backend RBAC middleware
     * and the frontend `PERMISSIONS` constant must stay aligned with it.
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
            self::VIEW_SETTINGS,
            self::MANAGE_SETTINGS,
            self::VIEW_STUDENTS,
            self::MANAGE_STUDENTS,
            self::MANAGE_ACADEMICS,
            self::MANAGE_DEGREES,
            self::MANAGE_FACILITIES,
            self::MANAGE_DEPARTMENTS,
            self::MANAGE_OPTIONS,
            self::MANAGE_LEVELS,
            self::MANAGE_MODULES,
            self::MANAGE_SCHOOLS,
            self::VIEW_TIMETABLE,
            self::MANAGE_TIMETABLE,
            self::MANAGE_MODULE_SCHEDULES,
            self::MANAGE_MODULE_ASSIGNMENTS,
            self::MANAGE_MODULE_REGISTRATIONS,
            self::VIEW_MY_MODULES,
            self::VIEW_HR_EMPLOYEES,
            self::MANAGE_HR_EMPLOYEES,
            self::MANAGE_LEAVE_TYPES,
            self::VIEW_PAYROLL,
            self::MANAGE_PAYROLL,
            self::VIEW_FINANCE,
            self::MANAGE_FINANCE,
            self::MANAGE_ADMISSION_REQUIREMENTS,
            self::MANAGE_STUDENT_APPLICATIONS,
            self::VERIFY_DOCUMENTS,
            self::MANAGE_ADMISSIONS,
            self::VIEW_MERIT_LIST,
            self::MANAGE_MERIT_LIST,
            self::VIEW_EXAMS,
            self::MANAGE_EXAMS,
            self::VIEW_ATTENDANCE,
            self::RECORD_ATTENDANCE,
            self::MANAGE_ATTENDANCE,
            self::VIEW_CLEARANCE,
            self::MANAGE_CLEARANCE,
            self::ACCESS_APPLICANT_PORTAL,
            self::ACCESS_STUDENT_PORTAL,
            self::MANAGE_OWN_PROFILE,
        ];
    }
}

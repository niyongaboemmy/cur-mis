<?php

declare(strict_types=1);

namespace App\Models;

class ApplicantProfileModel extends BaseModel
{
    protected string $table = 'applicant_profiles';

    protected array $fillable = [
        'user_id',
        'application_id',
        'middle_name',
        'id_type',
        'id_number',
        'province',
        'district',
        'sector',
        'emergency_contact_name',
        'emergency_contact_phone',
        'profile_photo_id',
    ];

    protected array $hidden = [];

    public function findByUserId(int $userId): array|false
    {
        return $this->db->fetchOne(
            "SELECT * FROM `applicant_profiles` WHERE user_id = ? LIMIT 1",
            [$userId]
        );
    }

    public function findByApplicationId(int $applicationId): array|false
    {
        return $this->db->fetchOne(
            "SELECT * FROM `applicant_profiles` WHERE application_id = ? LIMIT 1",
            [$applicationId]
        );
    }

    /**
     * Return profile + merged application summary in a single query.
     */
    public function getFullProfile(int $userId): array|false
    {
        return $this->db->fetchOne(
            "SELECT
                ap.*,
                u.email, u.full_name, u.username,
                sa.application_number, sa.status AS application_status,
                sa.document_status, sa.first_name, sa.last_name,
                sa.phone, sa.gender, sa.birthdate, sa.nationality, sa.address,
                sa.intake, sa.submitted_at,
                d.dep_name    AS department_name,
                d.dep_acronym AS department_code,
                f.fac_name AS faculty_name,
                ay.label   AS academic_year
             FROM `applicant_profiles` ap
             JOIN `users`                u  ON u.id       = ap.user_id
             JOIN `student_applications` sa ON sa.id      = ap.application_id
             LEFT JOIN `departements`    d  ON d.dep_id   = sa.department_id
             LEFT JOIN `faculty`         f  ON f.fac_id   = sa.faculty_id
             LEFT JOIN `academic_years`  ay ON ay.id      = sa.academic_year_id
             WHERE ap.user_id = ?
             LIMIT 1",
            [$userId]
        );
    }
}

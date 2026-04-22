<?php

declare(strict_types=1);

namespace App\Models;

/**
 * ApplicantAcademicRecordModel
 *
 * Manages academic history entries for an applicant profile.
 * Each applicant may have multiple records; one is marked is_primary = 1.
 */
class ApplicantAcademicRecordModel extends BaseModel
{
    protected string $table = 'applicant_academic_records';

    protected array $fillable = [
        'applicant_profile_id',
        'institution_name',
        'qualification',
        'grade',
        'combination',
        'year_completed',
        'is_primary',
    ];

    protected array $hidden = [];

    /**
     * Get all academic records for a given profile, newest first.
     */
    public function getForProfile(int $profileId): array
    {
        return $this->db->fetchAll(
            "SELECT * FROM `applicant_academic_records`
             WHERE applicant_profile_id = ?
             ORDER BY is_primary DESC, year_completed DESC",
            [$profileId]
        );
    }

    /**
     * Set a specific record as the primary record for a profile.
     * Clears all other is_primary flags first (atomic within the profile).
     */
    public function setPrimary(int $profileId, int $recordId): void
    {
        // Clear existing primary flag
        $this->db->execute(
            "UPDATE `applicant_academic_records`
             SET is_primary = 0, updated_at = NOW()
             WHERE applicant_profile_id = ?",
            [$profileId]
        );

        // Set the new primary
        $this->db->execute(
            "UPDATE `applicant_academic_records`
             SET is_primary = 1, updated_at = NOW()
             WHERE id = ? AND applicant_profile_id = ?",
            [$recordId, $profileId]
        );
    }

    /**
     * Verify that a given record belongs to the given profile.
     */
    public function belongsToProfile(int $recordId, int $profileId): bool
    {
        $row = $this->db->fetchOne(
            "SELECT id FROM `applicant_academic_records`
             WHERE id = ? AND applicant_profile_id = ? LIMIT 1",
            [$recordId, $profileId]
        );
        return (bool)$row;
    }
}

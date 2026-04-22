<?php

declare(strict_types=1);

namespace App\Models;

class AdmissionOfferModel extends BaseModel
{
    protected string $table    = 'admission_offers';
    protected array  $fillable = [
        'application_id', 'offer_letter_reference', 'offered_at', 'offered_by',
        'expires_at', 'status', 'responded_at', 'response_notes',
        'enrollment_initiated', 'student_id', 'enrolled_at',
    ];
    protected array $hidden = [];

    public function generateOfferReference(): string
    {
        $year = date('Y');
        $row  = $this->db->fetchOne("SELECT MAX(id) AS max_id FROM `admission_offers`");
        $seq  = ((int)($row['max_id'] ?? 0)) + 1;
        return sprintf('OFF-%s-%05d', $year, $seq);
    }

    public function getWithApplication(int $offerId): array|false
    {
        return $this->db->fetchOne(
            "SELECT ao.*, sa.first_name, sa.last_name, sa.email, sa.phone,
                    sa.application_number, sa.status AS application_status,
                    d.dep_name    AS department_name,
                    d.dep_acronym AS department_code
             FROM `admission_offers` ao
             JOIN `student_applications` sa ON sa.id      = ao.application_id
             JOIN `departements`         d  ON d.dep_id   = sa.department_id
             WHERE ao.id = ?
             LIMIT 1",
            [$offerId]
        );
    }

    public function findByApplicationId(int $applicationId): array|false
    {
        return $this->db->fetchOne(
            "SELECT * FROM `admission_offers` WHERE application_id = ? LIMIT 1",
            [$applicationId]
        );
    }
}

<?php

declare(strict_types=1);

namespace App\Models;

class ApplicationPendingNoteModel extends BaseModel
{
    protected string $table = 'application_pending_notes';
    protected array $fillable = [
        'application_id',
        'note',
        'created_by',
    ];

    /** Notes for an application, newest first, with the author's name joined in. */
    public function listForApplication(int $applicationId): array
    {
        return $this->db->fetchAll(
            "SELECT n.id,
                    n.application_id,
                    n.note,
                    n.created_by,
                    n.created_at,
                    u.full_name AS created_by_name,
                    u.email     AS created_by_email
             FROM `application_pending_notes` n
             LEFT JOIN `users` u ON u.id = n.created_by
             WHERE n.application_id = ?
             ORDER BY n.created_at DESC, n.id DESC",
            [$applicationId]
        );
    }

    /**
     * Latest note per application for a set of application IDs.
     * Used so list views can show "why pending" inline without N+1 queries.
     */
    public function latestForApplications(array $applicationIds): array
    {
        if (empty($applicationIds)) {
            return [];
        }
        $placeholders = implode(',', array_fill(0, count($applicationIds), '?'));
        $rows = $this->db->fetchAll(
            "SELECT n.application_id,
                    n.note,
                    n.created_at,
                    u.full_name AS created_by_name
             FROM `application_pending_notes` n
             LEFT JOIN `users` u ON u.id = n.created_by
             WHERE n.application_id IN ($placeholders)
             ORDER BY n.created_at DESC, n.id DESC",
            $applicationIds
        );
        // Keep only the first (newest) per application_id.
        $latest = [];
        foreach ($rows as $r) {
            $aid = (int)$r['application_id'];
            if (!isset($latest[$aid])) {
                $latest[$aid] = $r;
            }
        }
        return $latest;
    }

    /** Number of notes per application_id, for badge counts in list views. */
    public function countsForApplications(array $applicationIds): array
    {
        if (empty($applicationIds)) {
            return [];
        }
        $placeholders = implode(',', array_fill(0, count($applicationIds), '?'));
        $rows = $this->db->fetchAll(
            "SELECT application_id, COUNT(*) AS cnt
             FROM `application_pending_notes`
             WHERE application_id IN ($placeholders)
             GROUP BY application_id",
            $applicationIds
        );
        $out = [];
        foreach ($rows as $r) {
            $out[(int)$r['application_id']] = (int)$r['cnt'];
        }
        return $out;
    }
}

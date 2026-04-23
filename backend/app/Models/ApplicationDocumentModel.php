<?php

declare(strict_types=1);

namespace App\Models;

class ApplicationDocumentModel extends BaseModel
{
    protected string $table    = 'application_documents';
    protected array  $fillable = [
        'application_id', 'document_type_id', 'file_server_id',
        'file_original_name', 'file_size', 'file_mime',
        'verification_status', 'verified_by', 'verified_at', 'rejection_notes',
    ];
    protected array $hidden = [];

    public function getForApplication(int $applicationId): array
    {
        return $this->db->fetchAll(
            "SELECT ad.*, dt.name AS type_name, dt.slug AS type_slug
             FROM `application_documents` ad
             JOIN `document_types` dt ON dt.id = ad.document_type_id
             WHERE ad.application_id = ?
             ORDER BY dt.sort_order ASC, dt.id ASC",
            [$applicationId]
        );
    }

    public function countVerified(int $applicationId): int
    {
        $row = $this->db->fetchOne(
            "SELECT COUNT(*) AS cnt FROM `application_documents`
             WHERE application_id = ? AND verification_status = 'verified'",
            [$applicationId]
        );
        return (int)($row['cnt'] ?? 0);
    }

    public function countRejected(int $applicationId): int
    {
        $row = $this->db->fetchOne(
            "SELECT COUNT(*) AS cnt FROM `application_documents`
             WHERE application_id = ? AND verification_status = 'rejected'",
            [$applicationId]
        );
        return (int)($row['cnt'] ?? 0);
    }

    public function upsert(int $applicationId, int $documentTypeId, array $data): string
    {
        $existing = $this->db->fetchOne(
            "SELECT id FROM `application_documents` WHERE application_id = ? AND document_type_id = ?",
            [$applicationId, $documentTypeId]
        );

        if ($existing) {
            $this->update((int)$existing['id'], $data);
            return (string)$existing['id'];
        }

        $data['application_id']   = $applicationId;
        $data['document_type_id'] = $documentTypeId;
        return $this->create($data);
    }
}

<?php

declare(strict_types=1);

namespace App\Models;

class ServiceRequestModel extends BaseModel
{
    protected string $table      = 'service_requests';
    protected string $primaryKey = 'id';

    protected array $fillable = [
        'request_code', 'service_id', 'requester_type', 'requester_user_id',
        'student_regnumber', 'national_id', 'full_name', 'phone', 'email',
        'form_data', 'current_stage_order', 'status', 'invoice_id',
        'document_generated_at', 'download_token', 'downloaded_at', 'download_count',
        'submitted_at', 'completed_at',
    ];

    public function findByCode(string $requestCode): array|false
    {
        return $this->db->fetchOne(
            "SELECT * FROM `service_requests` WHERE `request_code` = ? LIMIT 1",
            [$requestCode]
        );
    }

    public function findByStudent(string $regnumber): array
    {
        return $this->db->fetchAll(
            "SELECT sr.*, sc.name AS service_name, sc.slug AS service_slug
             FROM `service_requests` sr
             JOIN `service_catalog` sc ON sc.id = sr.service_id
             WHERE sr.`student_regnumber` = ?
             ORDER BY sr.created_at DESC",
            [$regnumber]
        );
    }

    public function findByDownloadToken(string $token): array|false
    {
        return $this->db->fetchOne(
            "SELECT * FROM `service_requests` WHERE `download_token` = ? LIMIT 1",
            [$token]
        );
    }

    public function findByInvoiceId(int $invoiceId): array|false
    {
        return $this->db->fetchOne(
            "SELECT * FROM `service_requests` WHERE `invoice_id` = ? LIMIT 1",
            [$invoiceId]
        );
    }

    public function updateStatus(int $id, string $status, array $extra = []): int
    {
        return $this->update($id, array_merge(['status' => $status], $extra));
    }

    public function queueForStage(int $stageOrder, string $permissionSlug): array
    {
        return $this->db->fetchAll(
            "SELECT sr.*, sc.name AS service_name, sc.slug AS service_slug, scs.stage_label, scs.is_final_approval
             FROM `service_requests` sr
             JOIN `service_catalog` sc ON sc.id = sr.service_id
             JOIN `service_catalog_stages` scs ON scs.service_id = sr.service_id AND scs.stage_order = sr.current_stage_order
             WHERE sr.`status` = 'in_review'
               AND sr.`current_stage_order` = ?
               AND scs.`required_permission_slug` = ?
             ORDER BY sr.submitted_at ASC",
            [$stageOrder, $permissionSlug]
        );
    }
}

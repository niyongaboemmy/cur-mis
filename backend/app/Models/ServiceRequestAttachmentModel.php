<?php

declare(strict_types=1);

namespace App\Models;

class ServiceRequestAttachmentModel extends BaseModel
{
    protected string $table      = 'service_request_attachments';
    protected string $primaryKey = 'id';

    protected array $fillable = [
        'service_request_id', 'attachment_key', 'file_server_id',
        'original_name', 'file_size', 'file_mime',
    ];

    public function findByRequest(int $serviceRequestId): array
    {
        return $this->db->fetchAll(
            "SELECT * FROM `service_request_attachments` WHERE `service_request_id` = ? ORDER BY `id` ASC",
            [$serviceRequestId]
        );
    }
}

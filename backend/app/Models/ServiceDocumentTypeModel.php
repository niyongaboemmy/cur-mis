<?php

declare(strict_types=1);

namespace App\Models;

/**
 * Lookup of document generators a service_catalog row can be linked to.
 * Keys match DocumentController::ALLOWED_TYPES — see migration 114.
 */
class ServiceDocumentTypeModel extends BaseModel
{
    protected string $table      = 'service_document_types';
    protected string $primaryKey = 'id';

    public function listActive(): array
    {
        return $this->db->fetchAll(
            "SELECT * FROM `service_document_types` WHERE `is_active` = 1 ORDER BY `name` ASC"
        );
    }

    public function findKey(?int $id): ?string
    {
        if (!$id) {
            return null;
        }
        $row = $this->db->fetchOne(
            "SELECT `key` FROM `service_document_types` WHERE `id` = ? LIMIT 1",
            [$id]
        );
        return $row ? (string)$row['key'] : null;
    }
}

<?php

declare(strict_types=1);

namespace App\Models;

class FeeTypeModel extends BaseModel
{
    protected string $table      = 'fee_types';
    protected string $primaryKey = 'id';

    /** code is immutable after creation — excluded from mass-assignment. */
    protected array $fillable = ['label', 'description', 'is_active', 'sort_order'];

    public function listAll(): array
    {
        return $this->db->fetchAll(
            "SELECT ft.*,
                    (SELECT COUNT(*) FROM `fee_structures`        WHERE fee_type = ft.code) AS structure_count,
                    (SELECT COUNT(*) FROM `fee_invoices`          WHERE fee_type = ft.code) AS invoice_count
             FROM `fee_types` ft
             ORDER BY ft.sort_order ASC, ft.code ASC"
        );
    }

    public function findByCode(string $code): array|false
    {
        return $this->db->fetchOne(
            "SELECT * FROM `fee_types` WHERE `code` = ? LIMIT 1",
            [$code]
        );
    }

    public function createWithCode(array $data): string
    {
        $this->db->execute(
            "INSERT INTO `fee_types` (`code`, `label`, `description`, `is_active`, `sort_order`)
             VALUES (?, ?, ?, ?, ?)",
            [
                $data['code'],
                $data['label'],
                $data['description'] ?? null,
                $data['is_active']   ?? 1,
                $data['sort_order']  ?? 0,
            ]
        );
        return $this->db->lastInsertId();
    }

    public function isCodeInUse(string $code): bool
    {
        $row = $this->db->fetchOne(
            "SELECT
               (SELECT COUNT(*) FROM `fee_structures`        WHERE fee_type = ?) +
               (SELECT COUNT(*) FROM `fee_invoices`          WHERE fee_type = ?) +
               (SELECT COUNT(*) FROM `student_fee_overrides` WHERE fee_type = ?) AS total",
            [$code, $code, $code]
        );
        return (int)($row['total'] ?? 0) > 0;
    }
}

<?php

declare(strict_types=1);

namespace App\Models;

class PaymentCalendarDocumentModel extends BaseModel
{
    protected string $table      = 'payment_calendar_documents';
    protected string $primaryKey = 'id';

    protected array $fillable = [
        'academic_year_id', 'faculty_id', 'title', 'intake_label', 'department_label', 'level_label',
        'notes', 'bank_account_note', 'cursu_account_note', 'payment_method_note', 'fine_notice',
        'prepared_by_name', 'prepared_by_title', 'verified_by_name', 'verified_by_title',
        'approved_by_name', 'approved_by_title', 'is_active', 'created_by',
    ];

    public function listWithFilters(array $filters): array
    {
        $where    = ['1=1'];
        $bindings = [];

        if (!empty($filters['academic_year_id'])) {
            $where[]    = 'pcd.`academic_year_id` = ?';
            $bindings[] = $filters['academic_year_id'];
        }
        if (!empty($filters['faculty_id'])) {
            $where[]    = 'pcd.`faculty_id` = ?';
            $bindings[] = $filters['faculty_id'];
        }
        if (isset($filters['is_active']) && $filters['is_active'] !== null) {
            $where[]    = 'pcd.`is_active` = ?';
            $bindings[] = (int)$filters['is_active'];
        }

        $whereSql = implode(' AND ', $where);

        return $this->db->fetchAll(
            "SELECT pcd.*, ay.`label` AS academic_year_label, f.`fac_name` AS faculty_name
             FROM `payment_calendar_documents` pcd
             LEFT JOIN `academic_years` ay ON ay.`id` = pcd.`academic_year_id`
             LEFT JOIN `faculty` f         ON f.`fac_id` = pcd.`faculty_id`
             WHERE {$whereSql}
             ORDER BY pcd.`academic_year_id` DESC, pcd.`faculty_id` ASC, pcd.`id` ASC",
            $bindings
        );
    }

    public function findWithMeta(int $id): array|false
    {
        $row = $this->db->fetchOne(
            "SELECT pcd.*, ay.`label` AS academic_year_label, f.`fac_name` AS faculty_name
             FROM `payment_calendar_documents` pcd
             LEFT JOIN `academic_years` ay ON ay.`id` = pcd.`academic_year_id`
             LEFT JOIN `faculty` f         ON f.`fac_id` = pcd.`faculty_id`
             WHERE pcd.`id` = ?
             LIMIT 1",
            [$id]
        );
        return $row ?: false;
    }

    public function getItems(int $documentId): array
    {
        return $this->db->fetchAll(
            "SELECT * FROM `payment_calendar_items` WHERE `document_id` = ? ORDER BY `sort_order` ASC, `id` ASC",
            [$documentId]
        );
    }

    public function createItem(int $documentId, array $data): string
    {
        $this->db->execute(
            "INSERT INTO `payment_calendar_items`
                (`document_id`, `group_label`, `item_label`, `event_type`, `start_date`, `deadline_date`, `amount`, `is_active`, `sort_order`)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                $documentId,
                $data['group_label'] ?? null,
                $data['item_label'],
                $data['event_type'] ?? 'installment_due',
                $data['start_date'] ?? null,
                $data['deadline_date'],
                $data['amount'] ?? null,
                $data['is_active'] ?? 1,
                $data['sort_order'] ?? 0,
            ]
        );
        return $this->db->lastInsertId();
    }

    public function updateItem(int $itemId, array $data): int
    {
        $map = [
            'group_label'   => 'group_label',
            'item_label'    => 'item_label',
            'event_type'    => 'event_type',
            'start_date'    => 'start_date',
            'deadline_date' => 'deadline_date',
            'amount'        => 'amount',
            'is_active'     => 'is_active',
            'sort_order'    => 'sort_order',
        ];
        $sets     = [];
        $bindings = [];
        foreach ($map as $key => $col) {
            if (array_key_exists($key, $data)) {
                $sets[]     = "`{$col}` = ?";
                $bindings[] = $data[$key];
            }
        }
        if (empty($sets)) return 0;

        $bindings[] = $itemId;
        return $this->db->execute(
            'UPDATE `payment_calendar_items` SET ' . implode(', ', $sets) . ' WHERE `id` = ?',
            $bindings
        );
    }

    public function deleteItem(int $itemId): int
    {
        return $this->db->execute('DELETE FROM `payment_calendar_items` WHERE `id` = ?', [$itemId]);
    }

    public function itemBelongsToDocument(int $itemId, int $documentId): bool
    {
        $row = $this->db->fetchOne(
            'SELECT `id` FROM `payment_calendar_items` WHERE `id` = ? AND `document_id` = ? LIMIT 1',
            [$itemId, $documentId]
        );
        return $row !== false;
    }
}

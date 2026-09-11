<?php

declare(strict_types=1);

namespace App\Models;

class AdmissionRequirementModel extends BaseModel
{
    protected string $table    = 'admission_requirements';
    protected array  $fillable = [
        'faculty_id', 'document_type_id',
        'is_required', 'is_active', 'notes', 'sort_order', 'created_by',
    ];
    protected array $hidden = [];

    /**
     * Get all document requirements for a faculty, joined with document_type
     * details. Requirements are no longer scoped per academic year — a faculty
     * carries the same checklist across years.
     *
     * Uses LEFT JOIN with no `dt.is_active` filter so requirements remain
     * visible even after their document type is deactivated or deleted; the
     * admin can then either delete the stale row or re-activate the doc type.
     *
     * $activeOnly — the admin checklist editor needs every row (active and
     * inactive) so a disabled requirement can still be found and re-enabled;
     * the applicant-facing upload step passes true so a deactivated
     * requirement simply doesn't appear on their checklist.
     */
    public function getForFaculty(int $facultyId, bool $activeOnly = false): array
    {
        $activeWhere = $activeOnly ? ' AND ar.is_active = 1' : '';
        return $this->db->fetchAll(
            "SELECT ar.*,
                    dt.name AS document_type_name,
                    dt.slug AS document_type_slug,
                    dt.description AS document_description,
                    dt.allowed_extensions,
                    COALESCE(dt.is_active, 0) AS document_type_active
             FROM `admission_requirements` ar
             LEFT JOIN `document_types` dt ON dt.id = ar.document_type_id
             WHERE ar.faculty_id = ?{$activeWhere}
             ORDER BY ar.sort_order ASC, ar.id ASC",
            [$facultyId]
        );
    }

    /**
     * Get requirements with faculty + document-type labels (admin listing).
     */
    public function paginateWithDetails(int $page, int $perPage, array $filters = []): array
    {
        $page    = max(1, $page);
        $perPage = max(1, min(100, $perPage));
        $offset  = ($page - 1) * $perPage;

        $conditions = [];
        $bindings   = [];

        if (!empty($filters['faculty_id'])) {
            $conditions[] = 'ar.faculty_id = ?';
            $bindings[]   = (int)$filters['faculty_id'];
        }

        $where = $conditions ? 'WHERE ' . implode(' AND ', $conditions) : '';

        $total = (int)($this->db->fetchOne(
            "SELECT COUNT(*) AS cnt FROM `admission_requirements` ar {$where}",
            $bindings
        )['cnt'] ?? 0);

        $rows = $this->db->fetchAll(
            "SELECT ar.*,
                    dt.name AS document_type_name, dt.slug AS document_type_slug,
                    f.fac_name AS faculty_name, f.fac_code AS faculty_code
             FROM `admission_requirements` ar
             JOIN `document_types` dt ON dt.id = ar.document_type_id
             JOIN `faculty` f ON f.fac_id = ar.faculty_id
             {$where}
             ORDER BY f.fac_name ASC, ar.sort_order ASC
             LIMIT ? OFFSET ?",
            [...$bindings, $perPage, $offset]
        );

        return [
            'data'         => $rows,
            'total'        => $total,
            'per_page'     => $perPage,
            'current_page' => $page,
            'last_page'    => (int)ceil($total / $perPage),
        ];
    }

    /**
     * Check if a requirement already exists for this (faculty, document_type).
     */
    public function existsForFacultyType(int $facultyId, int $typeId, ?int $excludeId = null): bool
    {
        $sql      = "SELECT COUNT(*) AS cnt FROM `admission_requirements`
                     WHERE faculty_id = ? AND document_type_id = ?";
        $bindings = [$facultyId, $typeId];

        if ($excludeId !== null) {
            $sql       .= " AND id != ?";
            $bindings[] = $excludeId;
        }

        $row = $this->db->fetchOne($sql, $bindings);
        return ($row['cnt'] ?? 0) > 0;
    }
}

<?php

declare(strict_types=1);

namespace App\Models;

/**
 * Required student documents per programme category
 * (undergraduate / postgraduate / masters). Each row points at a
 * `document_types` catalogue entry so uploads are matched by
 * `application_documents.document_type_id`, not by name.
 */
class ProgrammeDocumentRequirementModel extends BaseModel
{
    public const CATEGORIES = ['undergraduate', 'postgraduate', 'masters'];

    protected string $table    = 'programme_document_requirements';
    protected array  $fillable = [
        'programme_category', 'document_type_id',
        'is_required', 'is_active', 'notes', 'sort_order', 'created_by',
    ];
    protected array $hidden = [];

    /**
     * Every configured requirement (all categories), with its document-type
     * label. LEFT JOIN so a row whose type was deactivated still shows in the
     * admin editor — the admin can then fix or remove it.
     */
    public function allWithDetails(): array
    {
        return $this->db->fetchAll(
            "SELECT r.*,
                    dt.name        AS document_type_name,
                    dt.slug        AS document_type_slug,
                    dt.description AS document_description,
                    COALESCE(dt.is_active, 0) AS document_type_active
             FROM `programme_document_requirements` r
             LEFT JOIN `document_types` dt ON dt.id = r.document_type_id
             ORDER BY FIELD(r.programme_category, 'undergraduate', 'postgraduate', 'masters'),
                      r.sort_order ASC, r.id ASC"
        );
    }

    /**
     * Active checklist for one category — what a student in that category is
     * expected to have on file. Only active document types count: a
     * requirement pointing at a retired type can't be satisfied by an upload.
     */
    public function getForCategory(string $category): array
    {
        return $this->db->fetchAll(
            "SELECT r.id, r.programme_category, r.document_type_id, r.is_required, r.notes, r.sort_order,
                    dt.name AS document_type_name, dt.slug AS document_type_slug,
                    dt.description AS document_description
             FROM `programme_document_requirements` r
             JOIN `document_types` dt ON dt.id = r.document_type_id AND dt.is_active = 1
             WHERE r.programme_category = ? AND r.is_active = 1
             ORDER BY r.sort_order ASC, r.id ASC",
            [$category]
        );
    }

    public function existsForCategoryType(string $category, int $typeId, ?int $excludeId = null): bool
    {
        $sql      = "SELECT id FROM `programme_document_requirements` WHERE programme_category = ? AND document_type_id = ?";
        $bindings = [$category, $typeId];
        if ($excludeId !== null) {
            $sql       .= " AND id <> ?";
            $bindings[] = $excludeId;
        }
        return (bool) $this->db->fetchOne($sql . " LIMIT 1", $bindings);
    }
}

<?php

declare(strict_types=1);

namespace App\Models;

class AdmissionRequirementModel extends BaseModel
{
    protected string $table    = 'admission_requirements';
    protected array  $fillable = [
        'faculty_id', 'academic_year_id', 'document_type_id',
        'is_required', 'notes', 'sort_order', 'created_by',
    ];
    protected array $hidden = [];

    /**
     * Get all document requirements for a faculty in a given academic year,
     * joined with document_type details.
     */
    public function getForFacultyYear(int $facultyId, int $academicYearId): array
    {
        return $this->db->fetchAll(
            "SELECT ar.*, dt.name AS document_name, dt.slug AS document_slug,
                    dt.description AS document_description
             FROM `admission_requirements` ar
             JOIN `document_types` dt ON dt.id = ar.document_type_id
             WHERE ar.faculty_id = ? AND ar.academic_year_id = ?
             AND dt.is_active = 1
             ORDER BY ar.sort_order ASC, ar.id ASC",
            [$facultyId, $academicYearId]
        );
    }

    /**
     * Get requirements with faculty and academic year labels (for admin listing).
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

        if (!empty($filters['academic_year_id'])) {
            $conditions[] = 'ar.academic_year_id = ?';
            $bindings[]   = (int)$filters['academic_year_id'];
        }

        $where = $conditions ? 'WHERE ' . implode(' AND ', $conditions) : '';

        $total = (int)($this->db->fetchOne(
            "SELECT COUNT(*) AS cnt FROM `admission_requirements` ar {$where}",
            $bindings
        )['cnt'] ?? 0);

        $rows = $this->db->fetchAll(
            "SELECT ar.*,
                    dt.name AS document_name, dt.slug AS document_slug,
                    f.fac_name AS faculty_name, f.fac_code AS faculty_code,
                    ay.label AS academic_year_label
             FROM `admission_requirements` ar
             JOIN `document_types` dt ON dt.id = ar.document_type_id
             JOIN `faculty` f ON f.fac_id = ar.faculty_id
             JOIN `academic_years` ay ON ay.id = ar.academic_year_id
             {$where}
             ORDER BY f.fac_name ASC, ay.label DESC, ar.sort_order ASC
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
     * Check if a requirement already exists for this faculty+year+type combination.
     */
    public function existsForFacultyYearType(int $facultyId, int $yearId, int $typeId, ?int $excludeId = null): bool
    {
        $sql      = "SELECT COUNT(*) AS cnt FROM `admission_requirements`
                     WHERE faculty_id = ? AND academic_year_id = ? AND document_type_id = ?";
        $bindings = [$facultyId, $yearId, $typeId];

        if ($excludeId !== null) {
            $sql       .= " AND id != ?";
            $bindings[] = $excludeId;
        }

        $row = $this->db->fetchOne($sql, $bindings);
        return ($row['cnt'] ?? 0) > 0;
    }

    /**
     * Copy all requirements from one academic year to another for the same faculty.
     * Used when setting up a new admission round based on the previous year's requirements.
     */
    public function copyForNewYear(int $facultyId, int $fromYearId, int $toYearId, int $actorId): int
    {
        $existing = $this->getForFacultyYear($facultyId, $fromYearId);
        $count    = 0;

        foreach ($existing as $req) {
            if (!$this->existsForFacultyYearType($facultyId, $toYearId, (int)$req['document_type_id'])) {
                $this->create([
                    'faculty_id'       => $facultyId,
                    'academic_year_id' => $toYearId,
                    'document_type_id' => (int)$req['document_type_id'],
                    'is_required'      => (int)$req['is_required'],
                    'notes'            => $req['notes'],
                    'sort_order'       => (int)$req['sort_order'],
                    'created_by'       => $actorId,
                ]);
                $count++;
            }
        }

        return $count;
    }
}

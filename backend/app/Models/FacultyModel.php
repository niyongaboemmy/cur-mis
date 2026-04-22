<?php

declare(strict_types=1);

namespace App\Models;

class FacultyModel extends BaseModel
{
    protected string $table      = 'faculty';
    protected string $primaryKey = 'fac_id';
    protected array  $fillable   = ['fac_name', 'fac_code', 'fac_descript', 'fac_reg_date', 'school_id'];
    protected array  $hidden     = [];

    /**
     * Return all faculties with their school name.
     */
    public function getAllWithSchool(): array
    {
        return $this->db->fetchAll(
            "SELECT f.fac_id AS id, f.fac_name AS name, f.fac_code AS code,
                    f.fac_descript AS description, f.school_id,
                    s.school_name
             FROM `faculty` f
             LEFT JOIN `schools` s ON s.school_id = f.school_id
             ORDER BY f.fac_name ASC"
        );
    }

    /**
     * Return all programs that belong to departments within this faculty.
     */
    public function getProgramsByFaculty(int $facultyId): array
    {
        return $this->db->fetchAll(
            "SELECT p.id, p.name, p.code, p.degree_type, p.duration_years,
                    p.total_credits, p.is_active,
                    d.dep_name AS department_name
             FROM `programs` p
             JOIN `departements` d ON d.dep_id = p.department_id
             WHERE d.fac_id = ? AND p.is_active = 1
             ORDER BY p.name ASC",
            [$facultyId]
        );
    }
}

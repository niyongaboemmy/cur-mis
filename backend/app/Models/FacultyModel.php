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
     * Return all departments that belong to this faculty.
     */
    public function getDepartmentsByFaculty(int $facultyId): array
    {
        return $this->db->fetchAll(
            "SELECT d.dep_id AS id, d.dep_name AS name, d.dep_acronym AS code,
                    d.dep_description AS description, d.fac_id
             FROM `departements` d
             WHERE d.fac_id = ?
             ORDER BY d.dep_name ASC",
            [$facultyId]
        );
    }
}

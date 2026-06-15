<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use Core\Database;
use App\Models\HrEmployeeModel;

/**
 * Faculty Profile Management — qualifications, credentials & teaching subjects.
 *
 * Backs the "Qualifications" tab on the staff detail page. Captures the
 * structured profile data that the basic employee record cannot:
 *   • academic qualifications (degrees, field, institution, year, grade)
 *   • professional certifications (with reference number + expiry)
 *   • teaching subjects / specialisations (with proficiency + experience)
 *
 * Closes Gap 7 of the gap-analysis report.
 */
class StaffProfileController extends BaseController
{
    private function db(): Database
    {
        return (new HrEmployeeModel())->db();
    }

    /**
     * Self-healing table guard so the feature works even on environments
     * where the 071 migration has not been run yet (mirrors the pattern
     * used by EmployeeDeductionController).
     */
    private function ensureTables(): void
    {
        $this->db()->execute("
            CREATE TABLE IF NOT EXISTS `staff_qualifications` (
              `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
              `employee_id`    INT          NOT NULL,
              `qual_type`      ENUM('Degree','Certification','Other') NOT NULL DEFAULT 'Degree',
              `title`          VARCHAR(200) NOT NULL,
              `field_of_study` VARCHAR(200) DEFAULT NULL,
              `institution`    VARCHAR(200) DEFAULT NULL,
              `year_obtained`  SMALLINT     DEFAULT NULL,
              `grade`          VARCHAR(60)  DEFAULT NULL,
              `reference_no`   VARCHAR(120) DEFAULT NULL,
              `expiry_date`    DATE         DEFAULT NULL,
              `document_url`   VARCHAR(500) DEFAULT NULL,
              `notes`          VARCHAR(500) DEFAULT NULL,
              `created_at`     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
              `updated_at`     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (`id`),
              KEY `idx_staff_qual_emp` (`employee_id`, `qual_type`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        ");

        $this->db()->execute("
            CREATE TABLE IF NOT EXISTS `staff_subjects` (
              `id`               INT UNSIGNED NOT NULL AUTO_INCREMENT,
              `employee_id`      INT          NOT NULL,
              `subject_name`     VARCHAR(200) NOT NULL,
              `proficiency`      ENUM('Beginner','Intermediate','Advanced','Expert') NOT NULL DEFAULT 'Advanced',
              `years_experience` SMALLINT     DEFAULT NULL,
              `is_primary`       TINYINT(1)   NOT NULL DEFAULT 0,
              `notes`            VARCHAR(500) DEFAULT NULL,
              `created_at`       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
              `updated_at`       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (`id`),
              KEY `idx_staff_subj_emp` (`employee_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        ");
    }

    /** 404 if the employee does not exist. Returns the emp id otherwise. */
    private function requireEmployee(Request $request, Response $response): int
    {
        $empId = (int)$request->param('emp_id');
        $exists = $this->db()->fetchOne(
            "SELECT employee_id FROM employees WHERE employee_id = ? LIMIT 1",
            [$empId]
        );
        if (!$exists) {
            $this->error($response, 'Employee not found.', 404);
        }
        return $empId;
    }

    private function nullableInt(mixed $v): ?int
    {
        return ($v === null || $v === '' ) ? null : (int)$v;
    }

    private function nullableStr(mixed $v): ?string
    {
        $s = trim((string)($v ?? ''));
        return $s === '' ? null : $s;
    }

    /* ── Qualifications ───────────────────────────────────────────────── */

    /** GET /api/employees/:emp_id/qualifications */
    public function qualifications(Request $request, Response $response): never
    {
        $this->ensureTables();
        $empId = $this->requireEmployee($request, $response);

        $rows = $this->db()->fetchAll(
            "SELECT id, employee_id, qual_type, title, field_of_study, institution,
                    year_obtained, grade, reference_no, expiry_date, document_url, notes,
                    created_at, updated_at
             FROM staff_qualifications
             WHERE employee_id = ?
             ORDER BY FIELD(qual_type, 'Degree', 'Certification', 'Other'),
                      year_obtained DESC, id DESC",
            [$empId]
        ) ?: [];

        $this->success($response, $rows, 'Qualifications fetched.');
    }

    /** POST /api/employees/:emp_id/qualifications */
    public function storeQualification(Request $request, Response $response): never
    {
        $this->ensureTables();
        $empId = $this->requireEmployee($request, $response);
        $data  = $request->body();

        $title = $this->nullableStr($data['title'] ?? '');
        if ($title === null) {
            $this->error($response, 'Title is required.', 422, ['title' => ['The title field is required.']]);
        }

        $type = (string)($data['qual_type'] ?? 'Degree');
        if (!in_array($type, ['Degree', 'Certification', 'Other'], true)) {
            $type = 'Degree';
        }

        $this->db()->execute(
            "INSERT INTO staff_qualifications
               (employee_id, qual_type, title, field_of_study, institution,
                year_obtained, grade, reference_no, expiry_date, document_url, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                $empId,
                $type,
                $title,
                $this->nullableStr($data['field_of_study'] ?? null),
                $this->nullableStr($data['institution']    ?? null),
                $this->nullableInt($data['year_obtained']  ?? null),
                $this->nullableStr($data['grade']          ?? null),
                $this->nullableStr($data['reference_no']   ?? null),
                $this->nullableStr($data['expiry_date']    ?? null),
                $this->nullableStr($data['document_url']   ?? null),
                $this->nullableStr($data['notes']          ?? null),
            ]
        );

        $id  = $this->db()->lastInsertId();
        $row = $this->db()->fetchOne("SELECT * FROM staff_qualifications WHERE id = ?", [$id]);

        $this->success($response, $row, 'Qualification added.', 201);
    }

    /** PUT /api/employees/:emp_id/qualifications/:id */
    public function updateQualification(Request $request, Response $response): never
    {
        $this->ensureTables();
        $empId = $this->requireEmployee($request, $response);
        $id    = (int)$request->param('id');
        $data  = $request->body();

        $existing = $this->db()->fetchOne(
            "SELECT id FROM staff_qualifications WHERE id = ? AND employee_id = ?",
            [$id, $empId]
        );
        if (!$existing) {
            $this->error($response, 'Qualification not found.', 404);
        }

        $title = $this->nullableStr($data['title'] ?? '');
        if ($title === null) {
            $this->error($response, 'Title is required.', 422, ['title' => ['The title field is required.']]);
        }

        $type = (string)($data['qual_type'] ?? 'Degree');
        if (!in_array($type, ['Degree', 'Certification', 'Other'], true)) {
            $type = 'Degree';
        }

        $this->db()->execute(
            "UPDATE staff_qualifications
             SET qual_type = ?, title = ?, field_of_study = ?, institution = ?,
                 year_obtained = ?, grade = ?, reference_no = ?, expiry_date = ?,
                 document_url = ?, notes = ?
             WHERE id = ? AND employee_id = ?",
            [
                $type,
                $title,
                $this->nullableStr($data['field_of_study'] ?? null),
                $this->nullableStr($data['institution']    ?? null),
                $this->nullableInt($data['year_obtained']  ?? null),
                $this->nullableStr($data['grade']          ?? null),
                $this->nullableStr($data['reference_no']   ?? null),
                $this->nullableStr($data['expiry_date']    ?? null),
                $this->nullableStr($data['document_url']   ?? null),
                $this->nullableStr($data['notes']          ?? null),
                $id,
                $empId,
            ]
        );

        $row = $this->db()->fetchOne("SELECT * FROM staff_qualifications WHERE id = ?", [$id]);
        $this->success($response, $row, 'Qualification updated.');
    }

    /** DELETE /api/employees/:emp_id/qualifications/:id */
    public function deleteQualification(Request $request, Response $response): never
    {
        $this->ensureTables();
        $empId = $this->requireEmployee($request, $response);
        $id    = (int)$request->param('id');

        $existing = $this->db()->fetchOne(
            "SELECT id FROM staff_qualifications WHERE id = ? AND employee_id = ?",
            [$id, $empId]
        );
        if (!$existing) {
            $this->error($response, 'Qualification not found.', 404);
        }

        $this->db()->execute(
            "DELETE FROM staff_qualifications WHERE id = ? AND employee_id = ?",
            [$id, $empId]
        );

        $this->success($response, null, 'Qualification removed.');
    }

    /* ── Teaching subjects / specialisations ──────────────────────────── */

    /** GET /api/employees/:emp_id/subjects */
    public function subjects(Request $request, Response $response): never
    {
        $this->ensureTables();
        $empId = $this->requireEmployee($request, $response);

        $rows = $this->db()->fetchAll(
            "SELECT id, employee_id, subject_name, proficiency, years_experience,
                    is_primary, notes, created_at, updated_at
             FROM staff_subjects
             WHERE employee_id = ?
             ORDER BY is_primary DESC, subject_name ASC",
            [$empId]
        ) ?: [];

        $this->success($response, $rows, 'Subjects fetched.');
    }

    /** POST /api/employees/:emp_id/subjects */
    public function storeSubject(Request $request, Response $response): never
    {
        $this->ensureTables();
        $empId = $this->requireEmployee($request, $response);
        $data  = $request->body();

        $name = $this->nullableStr($data['subject_name'] ?? '');
        if ($name === null) {
            $this->error($response, 'Subject name is required.', 422, ['subject_name' => ['The subject name is required.']]);
        }

        $proficiency = (string)($data['proficiency'] ?? 'Advanced');
        if (!in_array($proficiency, ['Beginner', 'Intermediate', 'Advanced', 'Expert'], true)) {
            $proficiency = 'Advanced';
        }

        $this->db()->execute(
            "INSERT INTO staff_subjects
               (employee_id, subject_name, proficiency, years_experience, is_primary, notes)
             VALUES (?, ?, ?, ?, ?, ?)",
            [
                $empId,
                $name,
                $proficiency,
                $this->nullableInt($data['years_experience'] ?? null),
                !empty($data['is_primary']) ? 1 : 0,
                $this->nullableStr($data['notes'] ?? null),
            ]
        );

        $id  = $this->db()->lastInsertId();
        $row = $this->db()->fetchOne("SELECT * FROM staff_subjects WHERE id = ?", [$id]);

        $this->success($response, $row, 'Subject added.', 201);
    }

    /** PUT /api/employees/:emp_id/subjects/:id */
    public function updateSubject(Request $request, Response $response): never
    {
        $this->ensureTables();
        $empId = $this->requireEmployee($request, $response);
        $id    = (int)$request->param('id');
        $data  = $request->body();

        $existing = $this->db()->fetchOne(
            "SELECT id FROM staff_subjects WHERE id = ? AND employee_id = ?",
            [$id, $empId]
        );
        if (!$existing) {
            $this->error($response, 'Subject not found.', 404);
        }

        $name = $this->nullableStr($data['subject_name'] ?? '');
        if ($name === null) {
            $this->error($response, 'Subject name is required.', 422, ['subject_name' => ['The subject name is required.']]);
        }

        $proficiency = (string)($data['proficiency'] ?? 'Advanced');
        if (!in_array($proficiency, ['Beginner', 'Intermediate', 'Advanced', 'Expert'], true)) {
            $proficiency = 'Advanced';
        }

        $this->db()->execute(
            "UPDATE staff_subjects
             SET subject_name = ?, proficiency = ?, years_experience = ?, is_primary = ?, notes = ?
             WHERE id = ? AND employee_id = ?",
            [
                $name,
                $proficiency,
                $this->nullableInt($data['years_experience'] ?? null),
                !empty($data['is_primary']) ? 1 : 0,
                $this->nullableStr($data['notes'] ?? null),
                $id,
                $empId,
            ]
        );

        $row = $this->db()->fetchOne("SELECT * FROM staff_subjects WHERE id = ?", [$id]);
        $this->success($response, $row, 'Subject updated.');
    }

    /** DELETE /api/employees/:emp_id/subjects/:id */
    public function deleteSubject(Request $request, Response $response): never
    {
        $this->ensureTables();
        $empId = $this->requireEmployee($request, $response);
        $id    = (int)$request->param('id');

        $existing = $this->db()->fetchOne(
            "SELECT id FROM staff_subjects WHERE id = ? AND employee_id = ?",
            [$id, $empId]
        );
        if (!$existing) {
            $this->error($response, 'Subject not found.', 404);
        }

        $this->db()->execute(
            "DELETE FROM staff_subjects WHERE id = ? AND employee_id = ?",
            [$id, $empId]
        );

        $this->success($response, null, 'Subject removed.');
    }
}

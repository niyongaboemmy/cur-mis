<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\FileServerClient;
use Core\Database;
use Core\Request;
use Core\Response;

/**
 * Self-service staff profile. The signed-in staff member reads and edits their
 * own details, and uploads their supporting documents.
 *
 * Each field is stored where it already lives:
 *   employees                 names, gender, age, address, phone, post, position,
 *                             faculty, area of specialisation, RSSB, bank
 *   employee_profiles         nationality
 *   employee_identifiers      national ID or passport
 *   employee_qualifications   highest qualification, university, country
 * Fields with no existing home are kept in staff_profile_details. Supporting
 * files are kept in staff_profile_documents, with the file on the file server.
 *
 * Students and applicants are refused; they have their own portals.
 */
class MyStaffProfileController extends BaseController
{
    private const DOC_TYPES      = ['NATIONAL_ID', 'QUALIFICATION', 'RSSB', 'BANK', 'DISABILITY', 'EXPERIENCE'];
    private const REQUIRED_DOCS  = ['NATIONAL_ID', 'QUALIFICATION'];
    private const DOC_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];
    private const ID_TYPES       = ['NATIONAL_ID', 'PASSPORT'];
    private const MAX_REFEREES   = 5;
    private const MAX_EXPERIENCE = 20;

    private function db(): Database
    {
        return Database::getInstance();
    }

    /** GET /api/me/staff-profile */
    public function show(Request $request, Response $response): never
    {
        $this->ensureTables();
        [$userId, $empId] = $this->requireStaff($request, $response);
        $this->success($response, $this->payload($userId, $empId));
    }

    /** PUT /api/me/staff-profile */
    public function update(Request $request, Response $response): never
    {
        $this->ensureTables();
        [$userId, $empId] = $this->requireStaff($request, $response);

        $data   = $request->body();
        $errors = $this->validate($data);
        if ($errors !== []) {
            $this->error($response, 'Please correct the highlighted fields.', 422, $errors);
        }

        $this->save($userId, $empId, $data);
        $this->success($response, $this->payload($userId, $empId), 'Staff profile saved.');
    }

    /** POST /api/me/staff-profile/documents  (multipart: doc_type + document) */
    public function uploadDocument(Request $request, Response $response): never
    {
        $this->ensureTables();
        [$userId, $empId] = $this->requireStaff($request, $response);

        $type = strtoupper(trim((string)($request->body()['doc_type'] ?? '')));
        if (!in_array($type, self::DOC_TYPES, true)) {
            $this->error($response, 'Unknown document type.', 422);
        }

        $file = $request->file('document');
        if (!$file) {
            $this->error($response, 'No document file provided. Please attach a file.', 422);
        }

        $ext = strtolower(pathinfo((string)($file['name'] ?? ''), PATHINFO_EXTENSION));
        if (!in_array($ext, self::DOC_EXTENSIONS, true)) {
            $this->error($response, "Invalid file type '{$ext}'. Allowed: PDF, JPG, PNG, WebP.", 422);
        }

        try {
            $uploaded = (new FileServerClient())->upload($file);
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 422);
        }

        $this->db()->execute(
            "INSERT INTO staff_profile_documents
               (user_id, doc_type, file_server_id, original_name, mime, file_size)
             VALUES (?, ?, ?, ?, ?, ?)",
            [
                $userId,
                $type,
                (string)$uploaded['id'],
                (string)($uploaded['original_name'] ?? ''),
                (string)($uploaded['mime'] ?? ''),
                (int)($uploaded['size'] ?? 0),
            ]
        );

        $this->success($response, $this->payload($userId, $empId), 'Document uploaded.', 201);
    }

    /**
     * Resolves the caller to their employee record. Students and applicants are
     * refused, and an account with no linked employee record gets a clear 404.
     *
     * @return array{0:int,1:int} [user id, employee id]
     */
    private function requireStaff(Request $request, Response $response): array
    {
        $auth   = (array)($request->param('_auth_user') ?? []);
        $userId = (int)($auth['id'] ?? 0);
        $role   = (string)($auth['role'] ?? '');

        if ($userId <= 0) {
            $this->error($response, 'Unauthenticated.', 401);
        }
        if (in_array($role, ['student', 'applicant'], true)) {
            $this->error($response, 'Staff profiles are only available to staff accounts.', 403);
        }

        $row = $this->db()->fetchOne(
            "SELECT employee_id FROM employees WHERE user_id = ? ORDER BY employee_id DESC LIMIT 1",
            [$userId]
        );
        if (!$row) {
            $this->error($response, 'No staff record is linked to your account. Ask HR to link it.', 404);
        }

        return [$userId, (int)$row['employee_id']];
    }

    /** @return array<string,mixed> */
    private function payload(int $userId, int $empId): array
    {
        $emp = $this->db()->fetchOne("SELECT * FROM employees WHERE employee_id = ?", [$empId]) ?? [];
        $profile = $this->db()->fetchOne(
            "SELECT nationality FROM employee_profiles WHERE user_id = ? LIMIT 1",
            [$userId]
        ) ?? [];
        $ident = $this->db()->fetchOne(
            "SELECT identifier_type, identifier_value FROM employee_identifiers
              WHERE user_id = ? AND identifier_type IN ('NATIONAL_ID', 'PASSPORT')
              ORDER BY id DESC LIMIT 1",
            [$userId]
        ) ?? [];
        $qual = $this->db()->fetchOne(
            "SELECT qualification_type, institution_name, country_of_study
               FROM employee_qualifications
              WHERE user_id = ?
              ORDER BY is_primary DESC, id DESC LIMIT 1",
            [$userId]
        ) ?? [];
        $details = $this->db()->fetchOne(
            "SELECT * FROM staff_profile_details WHERE user_id = ? LIMIT 1",
            [$userId]
        ) ?? [];
        $contract = $this->db()->fetchOne(
            "SELECT status FROM employee_contracts WHERE user_id = ? ORDER BY id DESC LIMIT 1",
            [$userId]
        ) ?? [];

        // Latest upload per document type; older uploads stay in the table.
        $latest = [];
        foreach ($this->db()->fetchAll(
            "SELECT id, doc_type, original_name, mime, file_size, uploaded_at
               FROM staff_profile_documents WHERE user_id = ? ORDER BY id DESC",
            [$userId]
        ) as $doc) {
            $latest[$doc['doc_type']] ??= $doc;
        }

        return [
            'employee_id'                => $empId,
            'fields' => [
                'first_name'          => $emp['employee_fname'] ?? null,
                'last_name'           => $emp['employee_lname'] ?? null,
                'father_name'         => $details['father_name'] ?? null,
                'mother_name'         => $details['mother_name'] ?? null,
                'gender'              => $emp['employee_gender'] ?? null,
                'disability_status'   => $details['disability_status'] ?? 'No',
                'disability_category' => $details['disability_category'] ?? null,
                'age'                 => $emp['employee_age'] ?? null,
                'national_id_type'    => $ident['identifier_type'] ?? 'NATIONAL_ID',
                'national_id_number'  => $ident['identifier_value'] ?? null,
                'place_of_birth'      => $details['place_of_birth'] ?? null,
                'address'             => $emp['employee_address'] ?? null,
                'phone'               => $emp['employee_phone'] ?? null,
                'secondary_phone'     => $details['secondary_phone'] ?? null,
                'personal_email'      => $details['personal_email'] ?? null,
                'work_email'          => $details['work_email'] ?? null,
                'nationality'         => $profile['nationality'] ?? null,
                'rssb_number'         => $emp['rssb_number'] ?? null,
                'bank_name'           => $emp['employee_bank'] ?? null,
                'bank_account'        => $emp['employee_account'] ?? null,
                'post'                => $emp['employee_post'] ?? null,
                'position'            => $emp['employee_position'] ?? null,
                'academic_rank'       => $details['academic_rank'] ?? null,
                'institution_name'    => $details['institution_name'] ?? null,
                'faculty'             => $emp['faculty'] ?? null,
                'department_name'     => $details['department_name'] ?? null,
                'program_name'        => $details['program_name'] ?? null,
                'highest_qualification' => $qual['qualification_type'] ?? null,
                'area_specialization' => $emp['area_specialization'] ?? null,
                'university'          => $qual['institution_name'] ?? null,
                'university_country'  => $qual['country_of_study'] ?? null,
                'experience'          => $this->decodeList($details['experience'] ?? null),
                'referees'            => $this->decodeList($details['referees'] ?? null),
            ],
            'contract_status'            => $contract['status'] ?? null,
            'documents'                  => array_values($latest),
            'document_types'             => self::DOC_TYPES,
            'required_documents'         => self::REQUIRED_DOCS,
            'missing_required_documents' => array_values(array_filter(
                self::REQUIRED_DOCS,
                static fn (string $t): bool => !isset($latest[$t])
            )),
        ];
    }

    /** @return array<string,string> field => message; empty when valid */
    private function validate(array $d): array
    {
        $errors = [];

        if ($this->s($d['first_name'] ?? null) === null) {
            $errors['first_name'] = 'First name is required.';
        }
        if ($this->s($d['last_name'] ?? null) === null) {
            $errors['last_name'] = 'Last name is required.';
        }

        $age = $this->s($d['age'] ?? null);
        if ($age !== null && (!ctype_digit($age) || (int)$age < 16 || (int)$age > 100)) {
            $errors['age'] = 'Age must be between 16 and 100.';
        }

        foreach (['personal_email', 'work_email'] as $key) {
            $email = $this->s($d[$key] ?? null);
            if ($email !== null && filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
                $errors[$key] = 'Enter a valid email address.';
            }
        }

        $status = (string)($d['disability_status'] ?? 'No');
        if (!in_array($status, ['No', 'Yes'], true)) {
            $errors['disability_status'] = 'Choose Yes or No.';
        } elseif ($status === 'Yes' && $this->s($d['disability_category'] ?? null) === null) {
            $errors['disability_category'] = 'Describe the disability category.';
        }

        $idType = (string)($d['national_id_type'] ?? 'NATIONAL_ID');
        if (!in_array($idType, self::ID_TYPES, true)) {
            $errors['national_id_type'] = 'Choose National ID or Passport.';
        }

        $referees = is_array($d['referees'] ?? null) ? $d['referees'] : [];
        if (count($referees) > self::MAX_REFEREES) {
            $errors['referees'] = 'You can add at most ' . self::MAX_REFEREES . ' referees.';
        }
        foreach ($referees as $i => $ref) {
            if ($this->s($ref['name'] ?? null) === null) {
                $errors["referees.$i.name"] = 'Referee name is required.';
            }
        }

        $experience = is_array($d['experience'] ?? null) ? $d['experience'] : [];
        if (count($experience) > self::MAX_EXPERIENCE) {
            $errors['experience'] = 'You can add at most ' . self::MAX_EXPERIENCE . ' entries.';
        }
        foreach ($experience as $i => $exp) {
            if ($this->s($exp['organisation'] ?? null) === null) {
                $errors["experience.$i.organisation"] = 'Organisation is required.';
            }
        }

        return $errors;
    }

    private function save(int $userId, int $empId, array $d): void
    {
        $db = $this->db();

        $db->execute(
            "UPDATE employees SET
               employee_fname = ?, employee_lname = ?, employee_gender = ?, employee_age = ?,
               employee_address = ?, employee_phone = ?, employee_post = ?, employee_position = ?,
               faculty = ?, area_specialization = ?, rssb_number = ?,
               employee_bank = ?, employee_account = ?
             WHERE employee_id = ?",
            [
                $this->s($d['first_name'] ?? null),
                $this->s($d['last_name'] ?? null),
                $this->s($d['gender'] ?? null),
                $this->i($d['age'] ?? null),
                $this->s($d['address'] ?? null),
                $this->s($d['phone'] ?? null),
                $this->s($d['post'] ?? null),
                $this->s($d['position'] ?? null),
                $this->s($d['faculty'] ?? null),
                $this->s($d['area_specialization'] ?? null),
                $this->s($d['rssb_number'] ?? null),
                $this->s($d['bank_name'] ?? null),
                $this->s($d['bank_account'] ?? null),
                $empId,
            ]
        );

        $nationality = $this->s($d['nationality'] ?? null);
        $hasProfile  = $db->fetchOne("SELECT id FROM employee_profiles WHERE user_id = ? LIMIT 1", [$userId]);
        if ($hasProfile) {
            $db->execute("UPDATE employee_profiles SET nationality = ? WHERE user_id = ?", [$nationality, $userId]);
        } else {
            $db->execute("INSERT INTO employee_profiles (user_id, nationality) VALUES (?, ?)", [$userId, $nationality]);
        }

        $idNumber = $this->s($d['national_id_number'] ?? null);
        if ($idNumber !== null) {
            $idType = (string)($d['national_id_type'] ?? 'NATIONAL_ID');
            $hasId  = $db->fetchOne(
                "SELECT id FROM employee_identifiers WHERE user_id = ? AND identifier_type = ? LIMIT 1",
                [$userId, $idType]
            );
            if ($hasId) {
                $db->execute(
                    "UPDATE employee_identifiers SET identifier_value = ? WHERE id = ?",
                    [$idNumber, (int)$hasId['id']]
                );
            } else {
                $db->execute(
                    "INSERT INTO employee_identifiers (user_id, identifier_type, identifier_value)
                     VALUES (?, ?, ?)",
                    [$userId, $idType, $idNumber]
                );
            }
        }

        $qualType = $this->s($d['highest_qualification'] ?? null);
        $hasQual  = $db->fetchOne(
            "SELECT id FROM employee_qualifications WHERE user_id = ? AND is_primary = 1 LIMIT 1",
            [$userId]
        );
        if ($hasQual) {
            $db->execute(
                "UPDATE employee_qualifications
                    SET qualification_type = ?, institution_name = ?, country_of_study = ?
                  WHERE id = ?",
                [
                    $qualType,
                    $this->s($d['university'] ?? null),
                    $this->s($d['university_country'] ?? null),
                    (int)$hasQual['id'],
                ]
            );
        } elseif ($qualType !== null) {
            $db->execute(
                "INSERT INTO employee_qualifications
                   (user_id, qualification_type, institution_name, country_of_study, is_primary)
                 VALUES (?, ?, ?, ?, 1)",
                [
                    $userId,
                    $qualType,
                    $this->s($d['university'] ?? null),
                    $this->s($d['university_country'] ?? null),
                ]
            );
        }

        $db->execute(
            "INSERT INTO staff_profile_details
               (user_id, father_name, mother_name, disability_status, disability_category,
                place_of_birth, secondary_phone, personal_email, work_email, academic_rank,
                institution_name, department_name, program_name, referees, experience)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               father_name = VALUES(father_name), mother_name = VALUES(mother_name),
               disability_status = VALUES(disability_status),
               disability_category = VALUES(disability_category),
               place_of_birth = VALUES(place_of_birth), secondary_phone = VALUES(secondary_phone),
               personal_email = VALUES(personal_email), work_email = VALUES(work_email),
               academic_rank = VALUES(academic_rank), institution_name = VALUES(institution_name),
               department_name = VALUES(department_name), program_name = VALUES(program_name),
               referees = VALUES(referees), experience = VALUES(experience)",
            [
                $userId,
                $this->s($d['father_name'] ?? null),
                $this->s($d['mother_name'] ?? null),
                ($d['disability_status'] ?? 'No') === 'Yes' ? 'Yes' : 'No',
                ($d['disability_status'] ?? 'No') === 'Yes' ? $this->s($d['disability_category'] ?? null) : null,
                $this->s($d['place_of_birth'] ?? null),
                $this->s($d['secondary_phone'] ?? null),
                $this->s($d['personal_email'] ?? null),
                $this->s($d['work_email'] ?? null),
                $this->s($d['academic_rank'] ?? null),
                $this->s($d['institution_name'] ?? null),
                $this->s($d['department_name'] ?? null),
                $this->s($d['program_name'] ?? null),
                json_encode($this->cleanList($d['referees'] ?? [], ['name', 'position', 'organisation', 'phone', 'email'], self::MAX_REFEREES), JSON_UNESCAPED_UNICODE),
                json_encode($this->cleanList($d['experience'] ?? [], ['organisation', 'role', 'start_year', 'end_year', 'details'], self::MAX_EXPERIENCE), JSON_UNESCAPED_UNICODE),
            ]
        );
    }

    /**
     * Keeps only the known keys of each row, trimmed, with empty rows dropped.
     *
     * @param  mixed    $rows
     * @param  string[] $keys
     * @return list<array<string,?string>>
     */
    private function cleanList(mixed $rows, array $keys, int $max): array
    {
        $out = [];
        foreach (is_array($rows) ? $rows : [] as $row) {
            if (!is_array($row)) {
                continue;
            }
            $clean = [];
            foreach ($keys as $k) {
                $clean[$k] = $this->s($row[$k] ?? null);
            }
            if (array_filter($clean, static fn ($v) => $v !== null) !== []) {
                $out[] = $clean;
            }
            if (count($out) >= $max) {
                break;
            }
        }
        return $out;
    }

    /** @return list<array<string,mixed>> */
    private function decodeList(?string $json): array
    {
        $decoded = $json !== null ? json_decode($json, true) : null;
        return is_array($decoded) ? array_values($decoded) : [];
    }

    private function s(mixed $v): ?string
    {
        if ($v === null || is_array($v)) {
            return null;
        }
        $t = trim((string)$v);
        return $t === '' ? null : $t;
    }

    private function i(mixed $v): ?int
    {
        $t = $this->s($v);
        return $t === null ? null : (int)$t;
    }

    private function ensureTables(): void
    {
        $this->db()->execute("
            CREATE TABLE IF NOT EXISTS `staff_profile_details` (
              `user_id`             INT UNSIGNED NOT NULL,
              `father_name`         VARCHAR(150) NULL,
              `mother_name`         VARCHAR(150) NULL,
              `disability_status`   ENUM('No','Yes') NOT NULL DEFAULT 'No',
              `disability_category` VARCHAR(150) NULL,
              `place_of_birth`      VARCHAR(255) NULL,
              `secondary_phone`     VARCHAR(40)  NULL,
              `personal_email`      VARCHAR(190) NULL,
              `work_email`          VARCHAR(190) NULL,
              `academic_rank`       VARCHAR(120) NULL,
              `institution_name`    VARCHAR(190) NULL,
              `department_name`     VARCHAR(190) NULL,
              `program_name`        VARCHAR(190) NULL,
              `referees`            LONGTEXT NULL,
              `experience`          LONGTEXT NULL,
              `updated_at`          TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (`user_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ");

        $this->db()->execute("
            CREATE TABLE IF NOT EXISTS `staff_profile_documents` (
              `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
              `user_id`        INT UNSIGNED NOT NULL,
              `doc_type`       VARCHAR(40)  NOT NULL,
              `file_server_id` VARCHAR(120) NOT NULL,
              `original_name`  VARCHAR(255) NULL,
              `mime`           VARCHAR(100) NULL,
              `file_size`      INT UNSIGNED NULL,
              `uploaded_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (`id`),
              KEY `idx_staff_profile_docs_user_type` (`user_id`, `doc_type`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ");
    }
}

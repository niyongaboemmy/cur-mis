<?php

declare(strict_types=1);

namespace App\Models;

class ApplicationDocumentModel extends BaseModel
{
    protected string $table    = 'application_documents';
    protected array  $fillable = [
        'applicant_profile_id', 'application_id', 'document_type_id', 'file_server_id',
        'file_original_name', 'file_size', 'file_mime',
        'verification_status', 'verified_by', 'verified_at', 'verification_comment',
    ];
    protected array $hidden = [];

    public function getForApplication(int $applicationId): array
    {
        return $this->db->fetchAll(
            "SELECT ad.*, dt.name AS type_name, dt.slug AS type_slug,
                    u.full_name AS verifier_name
             FROM `application_documents` ad
             JOIN `document_types` dt ON dt.id = ad.document_type_id
             LEFT JOIN `users` u ON u.id = ad.verified_by
             WHERE ad.application_id = ?
             ORDER BY dt.sort_order ASC, dt.id ASC",
            [$applicationId]
        );
    }

    /**
     * Full requirement checklist for an application: every admission requirement
     * configured for the application's faculty, merged with whatever the applicant
     * has actually uploaded. Requirements with no upload come back with a null `id`
     * and verification_status = 'missing', so the admin UI can still list them
     * (e.g. when requesting changes before anything was attached).
     *
     * Uploaded documents whose type is not part of the faculty checklist are
     * appended at the end so nothing is hidden.
     */
    public function getChecklistForApplication(int $applicationId, ?int $facultyId): array
    {
        $uploaded = $this->getForApplication($applicationId);
        $byType   = [];
        foreach ($uploaded as $doc) {
            $byType[(int)$doc['document_type_id']] = $doc;
        }

        $requirements = [];
        if ($facultyId) {
            $requirements = $this->db->fetchAll(
                "SELECT ar.document_type_id, ar.is_required, ar.notes, ar.sort_order,
                        dt.name AS type_name, dt.slug AS type_slug,
                        dt.description AS type_description, dt.allowed_extensions
                 FROM `admission_requirements` ar
                 JOIN `document_types` dt ON dt.id = ar.document_type_id
                 WHERE ar.faculty_id = ?
                 ORDER BY ar.sort_order ASC, ar.id ASC",
                [$facultyId]
            );
        }

        $checklist = [];
        $seen      = [];

        foreach ($requirements as $req) {
            $typeId  = (int)$req['document_type_id'];
            $seen[$typeId] = true;
            $doc     = $byType[$typeId] ?? null;

            $checklist[] = array_merge($doc ?? [
                'id'                   => null,
                'application_id'       => $applicationId,
                'applicant_profile_id' => null,
                'document_type_id'     => $typeId,
                'file_server_id'       => null,
                'file_original_name'   => null,
                'file_size'            => null,
                'file_mime'            => null,
                'verification_status'  => 'missing',
                'verified_by'          => null,
                'verified_at'          => null,
                'verification_comment' => null,
                'verifier_name'        => null,
                'uploaded_at'          => null,
                'type_name'            => $req['type_name'],
                'type_slug'            => $req['type_slug'],
            ], [
                'is_requirement'    => true,
                'is_required'       => (int)$req['is_required'],
                'requirement_notes' => $req['notes'],
                'type_description'  => $req['type_description'],
                'allowed_extensions' => $req['allowed_extensions'],
                'is_uploaded'       => $doc !== null,
            ]);
        }

        foreach ($uploaded as $doc) {
            if (isset($seen[(int)$doc['document_type_id']])) {
                continue;
            }
            $checklist[] = array_merge($doc, [
                'is_requirement' => false,
                'is_required'    => 0,
                'is_uploaded'    => true,
            ]);
        }

        return $checklist;
    }

    public function countVerified(int $applicationId): int
    {
        $row = $this->db->fetchOne(
            "SELECT COUNT(*) AS cnt FROM `application_documents`
             WHERE application_id = ? AND verification_status = 'verified'",
            [$applicationId]
        );
        return (int)($row['cnt'] ?? 0);
    }

    public function countRejected(int $applicationId): int
    {
        $row = $this->db->fetchOne(
            "SELECT COUNT(*) AS cnt FROM `application_documents`
             WHERE application_id = ? AND verification_status = 'rejected'",
            [$applicationId]
        );
        return (int)($row['cnt'] ?? 0);
    }

    public function upsert(int $applicationId, int $documentTypeId, array $data): string
    {
        $existing = $this->db->fetchOne(
            "SELECT id FROM `application_documents` WHERE application_id = ? AND document_type_id = ?",
            [$applicationId, $documentTypeId]
        );

        if ($existing) {
            $this->update((int)$existing['id'], $data);
            return (string)$existing['id'];
        }

        $data['application_id']   = $applicationId;
        $data['document_type_id'] = $documentTypeId;
        return $this->create($data);
    }

    public function upsertForProfile(int $profileId, int $documentTypeId, array $data, ?int $applicationId = null): string
    {
        // Try to find existing document of this type for the profile
        $existing = $this->db->fetchOne(
            "SELECT id FROM `application_documents` WHERE applicant_profile_id = ? AND document_type_id = ?",
            [$profileId, $documentTypeId]
        );

        if ($existing) {
            $this->update((int)$existing['id'], $data);
            return (string)$existing['id'];
        }

        // If no applicationId provided, try the applicant_profile's linked application.
        if (!$applicationId) {
            $profile = $this->db->fetchOne(
                "SELECT application_id FROM `applicant_profiles` WHERE id = ?",
                [$profileId]
            );
            $applicationId = (int)($profile['application_id'] ?? 0);
        }

        // A student who was never taken through the admissions portal has no
        // application to attach the document to. `application_documents.application_id`
        // is nullable (migration 156) precisely so these self-service uploads
        // (StudentController::meUploadDocument) can still be stored.
        $data['applicant_profile_id'] = $profileId;
        $data['application_id']       = $applicationId ?: null;
        $data['document_type_id']     = $documentTypeId;
        return $this->create($data);
    }

    public function getForProfile(int $profileId): array
    {
        return $this->db->fetchAll(
            "SELECT ad.*, dt.name AS type_name, dt.slug AS type_slug
             FROM `application_documents` ad
             JOIN `document_types` dt ON dt.id = ad.document_type_id
             WHERE ad.applicant_profile_id = ?
             ORDER BY ad.uploaded_at DESC",
            [$profileId]
        );
    }
}

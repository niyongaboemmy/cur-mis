<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\ServiceRequestModel;
use App\Models\ServiceCatalogModel;
use App\Models\ServiceDocumentTypeModel;
use App\Models\StudentModel;

/**
 * Generates the service request document once, on the `paid` transition,
 * and issues the download token — mirrors AdmissionOffer's letter_token
 * pattern (opaque random token, matched by equality, no expiry).
 */
class ServiceRequestDocumentService
{
    private ServiceRequestModel      $requestModel;
    private ServiceCatalogModel      $catalogModel;
    private ServiceDocumentTypeModel $documentTypeModel;
    private StudentModel             $studentModel;

    public function __construct()
    {
        $this->requestModel      = new ServiceRequestModel();
        $this->catalogModel      = new ServiceCatalogModel();
        $this->documentTypeModel = new ServiceDocumentTypeModel();
        $this->studentModel      = new StudentModel();
    }

    public function generateForRequest(int $requestId): void
    {
        $request = $this->requestModel->find($requestId);
        if (!$request || !empty($request['document_generated_at'])) {
            return; // already generated — idempotent
        }

        $token = bin2hex(random_bytes(32));

        $this->requestModel->update($requestId, [
            'document_generated_at' => date('Y-m-d H:i:s'),
            'download_token'        => $token,
        ]);

        SystemLogService::log(
            'GENERATE',
            'SERVICE_REQUESTS',
            "Generated document for service request {$request['request_code']}.",
            $requestId,
            'service_request'
        );
    }

    /**
     * @return array{request:array,service:array,document_type_key:string,student:?array}|null
     */
    public function buildPdfData(int $requestId): ?array
    {
        $request = $this->requestModel->find($requestId);
        if (!$request) {
            return null;
        }
        $service = $this->catalogModel->find((int)$request['service_id']);

        $documentTypeKey = $this->documentTypeModel->findKey(
            isset($service['document_type_id']) ? (int)$service['document_type_id'] : null
        ) ?? 'generic_service_letter';

        // Every specific generator (visa letter, degree certificate, etc.)
        // needs the full academic student record, not just the requester's
        // name/email captured on the request — resolve it the same way
        // submission does. Requests from non-students (no matching profile)
        // silently fall back to the generic letter below.
        $student = null;
        if ($documentTypeKey !== 'generic_service_letter') {
            $userId = (int)($request['requester_user_id'] ?? 0);
            if ($userId > 0) {
                $found = $this->studentModel->findByUserId($userId, $request['email'] ?? null);
                $student = $found ?: null;
            }
        }

        return [
            'request'           => $request,
            'service'           => $service,
            'document_type_key' => $student ? $documentTypeKey : 'generic_service_letter',
            'student'           => $student,
        ];
    }
}

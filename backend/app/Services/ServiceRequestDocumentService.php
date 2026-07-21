<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\ServiceRequestModel;
use App\Models\ServiceCatalogModel;

/**
 * Generates the service request document once, on the `paid` transition,
 * and issues the download token — mirrors AdmissionOffer's letter_token
 * pattern (opaque random token, matched by equality, no expiry).
 */
class ServiceRequestDocumentService
{
    private ServiceRequestModel $requestModel;
    private ServiceCatalogModel $catalogModel;

    public function __construct()
    {
        $this->requestModel = new ServiceRequestModel();
        $this->catalogModel = new ServiceCatalogModel();
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

    public function buildPdfData(int $requestId): ?array
    {
        $request = $this->requestModel->find($requestId);
        if (!$request) {
            return null;
        }
        $service = $this->catalogModel->find((int)$request['service_id']);

        return [
            'request'  => $request,
            'service'  => $service,
        ];
    }
}

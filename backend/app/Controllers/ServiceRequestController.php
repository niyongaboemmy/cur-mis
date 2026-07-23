<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Services\ServiceRequestService;
use App\Models\StudentModel;
use App\Models\ServiceRequestModel;
use App\Models\ServiceRequestAttachmentModel;
use App\Helpers\ValidationHelper;

class ServiceRequestController extends BaseController
{
    private ServiceRequestService         $service;
    private StudentModel                  $studentModel;
    private ServiceRequestModel           $requestModel;
    private ServiceRequestAttachmentModel $attachmentModel;

    public function __construct()
    {
        $this->service         = new ServiceRequestService();
        $this->studentModel    = new StudentModel();
        $this->requestModel    = new ServiceRequestModel();
        $this->attachmentModel = new ServiceRequestAttachmentModel();
    }

    public function submit(Request $request, Response $response): never
    {
        $body = $request->body();

        $errors = ValidationHelper::validate($body, [
            'service_slug' => ['required'],
        ]);
        if (!empty($errors)) {
            $this->error($response, 'Validation failed', 422, $errors);
        }

        $authUser = (array)$request->param('_auth_user');
        $userId   = (int)($authUser['id'] ?? 0);
        $student  = $this->studentModel->findByUserId($userId, $authUser['email'] ?? null);

        $requester = [
            'requester_type'    => 'student',
            'user_id'           => $userId,
            'student_regnumber' => $student['regnumber'] ?? null,
            'national_id'       => $student['id_card'] ?? ($body['national_id'] ?? null),
            'full_name'         => trim(($student['fname'] ?? '') . ' ' . ($student['lname'] ?? '')) ?: ($authUser['full_name'] ?? ''),
            'phone'             => $student['phone'] ?? ($body['phone'] ?? null),
            'email'             => $student['email'] ?? ($authUser['email'] ?? null),
        ];

        $formData = $body;
        unset($formData['service_slug']);

        try {
            $created = $this->service->submit((string)$body['service_slug'], $formData, $request->files(), $requester);
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 422);
        }

        $this->success($response, $created, 'Service request submitted successfully.', 201);
    }

    public function resubmit(Request $request, Response $response): never
    {
        $id       = (int)$request->param('id');
        $body     = $request->body();
        $authUser = (array)$request->param('_auth_user');
        $userId   = (int)($authUser['id'] ?? 0);

        $formData = $body;

        try {
            $updated = $this->service->resubmit($id, $userId, $formData, $request->files());
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 422);
        }

        $this->success($response, $updated, 'Service request resubmitted successfully.');
    }

    /**
     * Every service request stores the submitter's requester_user_id at
     * creation time, regardless of whether they have a linked student
     * profile — so this looks up requests by the authenticated user's own ID
     * directly rather than routing through the (legacy, email-matched)
     * students table, which would silently hide requests for any account
     * without a matching student row.
     */
    public function myRequests(Request $request, Response $response): never
    {
        $authUser = (array)$request->param('_auth_user');
        $userId   = (int)($authUser['id'] ?? 0);

        $this->success($response, $this->service->myRequests($userId), 'Requests fetched successfully.');
    }

    public function progress(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        $serviceRequest = $this->requestModel->find($id);
        if (!$serviceRequest) {
            $this->error($response, 'Service request not found.', 404);
        }

        try {
            $this->assertCanViewRequest($serviceRequest, (array)$request->param('_auth_user'));
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 403);
        }

        $this->success($response, $this->service->getProgress($id), 'Progress fetched successfully.');
    }

    public function getCheckoutLink(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        $serviceRequest = $this->requestModel->find($id);

        if (!$serviceRequest) {
            $this->error($response, 'Service request not found.', 404);
        }
        if ($serviceRequest['status'] !== 'awaiting_payment') {
            $this->error($response, 'This request is not awaiting payment.', 422);
        }

        $urubutoPayService = new \App\Services\UrubutoPayService();
        $checkout = $urubutoPayService->generateServiceRequestCheckoutUrl((int)$serviceRequest['id']);

        $this->success($response, $checkout, 'Checkout link generated successfully.');
    }

    public function download(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        $serviceRequest = $this->requestModel->find($id);

        if (!$serviceRequest) {
            $this->error($response, 'Service request not found.', 404);
        }
        if (!in_array($serviceRequest['status'], ['paid', 'completed'], true)) {
            $this->error($response, 'This document is not available until payment is confirmed.', 402);
        }

        $token = (string)$request->query('token', '');
        if (strlen($token) < 20 || !hash_equals((string)$serviceRequest['download_token'], $token)) {
            $this->error($response, 'Invalid or missing download token.', 403);
        }

        $authUser = (array)$request->param('_auth_user');
        $this->requestModel->update($id, [
            'downloaded_at'  => date('Y-m-d H:i:s'),
            'download_count' => (int)$serviceRequest['download_count'] + 1,
        ]);

        \App\Services\SystemLogService::log(
            'GENERATE',
            'SERVICE_REQUESTS',
            "Downloaded document for service request {$serviceRequest['request_code']}.",
            $id,
            'service_request',
            null,
            $authUser ?: null
        );

        \App\Helpers\ServiceRequestDocumentPdf::streamPdf(
            (new \App\Services\ServiceRequestDocumentService())->buildPdfData($id),
            "{$serviceRequest['request_code']}.pdf"
        );
    }

    /** Owner or any staff holding a review/void permission can list a request's attachments. */
    private function assertCanViewRequest(array $serviceRequest, array $authUser): void
    {
        $userId = (int)($authUser['id'] ?? 0);
        if ($userId !== 0 && $userId === (int)($serviceRequest['requester_user_id'] ?? 0)) {
            return;
        }
        $isSuperadmin = strtolower((string)($authUser['role'] ?? '')) === 'superadmin';
        $perms = (array)($authUser['permissions'] ?? []);
        $canReview = $isSuperadmin || array_intersect($perms, [
            \App\Constants\Permissions::VIEW_SERVICE_REQUESTS,
            \App\Constants\Permissions::APPROVE_SERVICE_REQUEST_L1,
            \App\Constants\Permissions::APPROVE_SERVICE_REQUEST_L2,
            \App\Constants\Permissions::APPROVE_SERVICE_REQUEST_FINAL,
        ]);
        if (!$canReview) {
            throw new \RuntimeException('You do not have access to this request.');
        }
    }

    public function listAttachments(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        $serviceRequest = $this->requestModel->find($id);
        if (!$serviceRequest) {
            $this->error($response, 'Service request not found.', 404);
        }

        try {
            $this->assertCanViewRequest($serviceRequest, (array)$request->param('_auth_user'));
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 403);
        }

        $attachments = array_map(
            static fn(array $a) => [
                'id'            => (int)$a['id'],
                'attachment_key' => $a['attachment_key'],
                'original_name' => $a['original_name'],
                'file_size'     => $a['file_size'],
                'file_mime'     => $a['file_mime'],
            ],
            $this->attachmentModel->findByRequest($id)
        );

        $this->success($response, $attachments, 'Attachments fetched successfully.');
    }

    /** Proxy-download one attachment from the file server — mirrors DocumentVerificationController::downloadDocument(). */
    public function downloadAttachment(Request $request, Response $response): never
    {
        $id           = (int)$request->param('id');
        $attachmentId = (int)$request->param('attachment_id');

        $serviceRequest = $this->requestModel->find($id);
        if (!$serviceRequest) {
            $this->error($response, 'Service request not found.', 404);
        }

        try {
            $this->assertCanViewRequest($serviceRequest, (array)$request->param('_auth_user'));
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 403);
        }

        $attachment = $this->attachmentModel->find($attachmentId);
        if (!$attachment || (int)$attachment['service_request_id'] !== $id) {
            $this->error($response, 'Attachment not found.', 404);
        }

        try {
            $client   = new \App\Helpers\FileServerClient();
            $fileData = $client->download((string)$attachment['file_server_id']);
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 502);
        }

        $mime = $fileData['mime'] ?? 'application/octet-stream';
        $isInlineable = str_starts_with($mime, 'image/') || $mime === 'application/pdf';

        header('Content-Type: ' . $mime);
        header('Content-Disposition: ' . ($isInlineable ? 'inline' : 'attachment') . '; filename="' . addslashes($attachment['original_name']) . '"');
        header('Content-Length: ' . strlen($fileData['content']));
        header('Cache-Control: private, no-store');
        header('X-Content-Type-Options: nosniff');
        echo $fileData['content'];
        exit;
    }

    public function void(Request $request, Response $response): never
    {
        $id       = (int)$request->param('id');
        $body     = $request->body();
        $authUser = (array)$request->param('_auth_user');
        $actorId  = (int)($authUser['id'] ?? 0);

        try {
            $updated = $this->service->void($id, $actorId, (string)($authUser['full_name'] ?? ''), $body['reason'] ?? null);
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 422);
        }

        $this->success($response, $updated, 'Service request voided successfully.');
    }

    public function track(Request $request, Response $response): never
    {
        $code       = (string)$request->query('request_code', '');
        $identifier = (string)$request->query('identifier', '');

        if ($code === '' || $identifier === '') {
            $this->error($response, 'request_code and identifier are required.', 422);
        }

        $result = $this->service->getTrackingStatus($code, $identifier);
        if (!$result) {
            $this->error($response, 'No matching request found. Check your request code and identifier.', 404);
        }

        $this->success($response, $result, 'Request status fetched successfully.');
    }
}

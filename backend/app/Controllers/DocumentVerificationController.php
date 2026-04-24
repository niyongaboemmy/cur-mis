<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Models\StudentApplicationModel;
use App\Models\ApplicationDocumentModel;
use App\Services\ApplicationService;
use App\Helpers\ValidationHelper;
use App\Helpers\FileServerClient;

class DocumentVerificationController extends BaseController
{
    private StudentApplicationModel $appModel;
    private ApplicationDocumentModel $docModel;
    private ApplicationService $service;

    public function __construct()
    {
        $this->appModel = new StudentApplicationModel();
        $this->docModel = new ApplicationDocumentModel();
        $this->service = new ApplicationService();
    }

    /**
     * GET /api/admin/verifications
     * List applications under document review.
     */
    public function getPendingApplications(Request $request, Response $response): never
    {
        $page = (int) ($request->query('page') ?? 1);
        $perPage = (int) ($request->query('per_page') ?? 15);
        $search = $request->query('search') ?? '';

        $filters = ['has_pending_docs' => true];
        if ($search !== '') {
            $filters['search'] = $search;
        }

        $result = $this->appModel->paginateFiltered($page, $perPage, $filters);

        $this->success($response, $result, 'Applications fetched successfully.');
    }

    /**
     * GET /api/admin/verifications/:application_id/documents
     * Full document checklist for an application.
     */
    public function getApplicationDocuments(Request $request, Response $response): never
    {
        $applicationId = (int) $request->param('application_id');
        $application = $this->appModel->find($applicationId);

        if (!$application) {
            $this->error($response, 'Application not found.', 404);
        }

        $documents = $this->docModel->getForApplication($applicationId);

        $this->success($response, [
            'application' => $application,
            'documents' => $documents,
        ], 'Documents fetched successfully.');
    }

    /**
     * PATCH /api/admin/verifications/:application_id/documents/:document_id
     * Verify or reject a single document.
     */
    public function verifyDocument(Request $request, Response $response): never
    {
        $applicationId = (int) $request->param('application_id');
        $documentId = (int) $request->param('document_id');
        $authUser = $request->param('_auth_user');
        $actorId = (int) ($authUser['id'] ?? 0);

        $application = $this->appModel->find($applicationId);
        if (!$application) {
            $this->error($response, 'Application not found.', 404);
        }

        $document = $this->docModel->find($documentId);
        if (!$document || (int) $document['application_id'] !== $applicationId) {
            $this->error($response, 'Document not found.', 404);
        }

        $data = $request->body();
        $errors = ValidationHelper::validate($data, [
            'verification_status' => 'required|in:verified,rejected',
            'comment' => 'optional|string',
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        if ($data['verification_status'] === 'rejected' && empty($data['comment'])) {
            $this->error($response, 'Comments are required when rejecting a document.', 422, [
                'comment' => 'Required when rejecting.',
            ]);
        }

        $comment = $data['comment'] ?? null;
        if ($data['verification_status'] === 'verified' && empty($comment)) {
            $comment = 'Approved';
        }

        $this->docModel->update($documentId, [
            'verification_status' => $data['verification_status'],
            'verified_by' => $actorId,
            'verified_at' => date('Y-m-d H:i:s'),
            'verification_comment' => $comment,
        ]);

        // Recalculate overall document status
        $docStatus = $this->service->checkDocumentCompleteness($applicationId);
        $this->appModel->update($applicationId, ['document_status' => $docStatus]);

        // Auto-transition application status
        $oldAppStatus = $application['status'];
        $newAppStatus = $oldAppStatus;

        if ($docStatus === 'verified' && ($oldAppStatus === 'documents_under_review' || $oldAppStatus === 'requested_changes')) {
            $newAppStatus = 'documents_verified';
            $this->appModel->update($applicationId, [
                'status' => $newAppStatus,
                'reviewed_by' => $actorId,
                'reviewed_at' => date('Y-m-d H:i:s'),
            ]);
            $this->service->logStatusChange($applicationId, $oldAppStatus, $newAppStatus, $actorId, 'admin', 'All required documents verified.');

            $this->service->sendApplicationEmail('documents_verified', [
                'first_name' => $application['first_name'],
                'last_name' => $application['last_name'],
                'email' => $application['email'],
            ], ['application_number' => $application['application_number']]);
        }

        // For rejected documents, we don't auto-transition the application status.
        // The admin must explicitly call the 'requestChanges' endpoint to send the consolidated email.

        $this->success($response, [
            'document_id' => $documentId,
            'verification_status' => $data['verification_status'],
            'document_status' => $docStatus,
            'application_status' => $newAppStatus,
        ], 'Document verification status updated.');
    }

    /**
     * POST /api/admin/verifications/:id/request-changes
     * Consolidation point for rejected documents. Changes status to documents_rejected
     * and sends ONE email to the applicant.
     */
    public function requestChanges(Request $request, Response $response): never
    {
        $applicationId = (int) $request->param('id');
        $authUser      = $request->param('_auth_user');
        $actorId       = (int)($authUser['id'] ?? 0);

        $application = $this->appModel->find($applicationId);
        if (!$application) {
            $this->error($response, 'Application not found.', 404);
        }

        $data = $request->body();
        $message = $data['message'] ?? '';
        $docIds = $data['document_ids'] ?? [];

        // Get documents for the email notification
        $allDocs = $this->docModel->getForApplication($applicationId);
        $selectedDocs = array_filter($allDocs, fn($d) => in_array((int)$d['id'], array_map('intval', $docIds)));

        $oldStatus = $application['status'];
        $newStatus = 'requested_changes';

        $this->appModel->update($applicationId, [
            'status' => $newStatus,
            'reviewed_by' => $actorId,
            'reviewed_at' => date('Y-m-d H:i:s'),
            'rejection_reason' => $message,
        ]);

        $this->service->logStatusChange($applicationId, $oldStatus, $newStatus, $actorId, 'admin', 'Document changes requested by admin: ' . $message);

        // Send consolidated email
        $this->service->sendApplicationEmail('requested_changes', [
            'first_name' => $application['first_name'],
            'last_name' => $application['last_name'],
            'email' => $application['email'],
        ], [
            'application_number' => $application['application_number'],
            'rejected_docs' => array_values($selectedDocs), // These are the docs the admin wants changes for
            'admin_message' => $message,
        ]);

        $this->success($response, [
            'status' => $newStatus
        ], 'Document changes requested successfully. Email sent to applicant.');
    }

    /**
     * GET /api/admin/verifications/:application_id/documents/:document_id/download
     * Proxy-download a document from the file server.
     */
    public function downloadDocument(Request $request, Response $response): never
    {
        $applicationId = (int) $request->param('application_id');
        $documentId = (int) $request->param('document_id');

        $document = $this->docModel->find($documentId);
        if (!$document || (int) $document['application_id'] !== $applicationId) {
            $this->error($response, 'Document not found.', 404);
        }

        if (empty($document['file_server_id'])) {
            $this->error($response, 'No file associated with this document record.', 404);
        }

        try {
            $client = new FileServerClient();
            $fileData = $client->download($document['file_server_id']);
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 502);
        }

        $mime = $fileData['mime'] ?? 'application/octet-stream';

        $isInlineable = str_starts_with($mime, 'image/') || $mime === 'application/pdf';
        $disposition = $isInlineable ? 'inline' : 'attachment';

        header('Content-Type: ' . $mime);
        header('Content-Disposition: ' . $disposition . '; filename="' . addslashes($fileData['original_name']) . '"');
        header('Content-Length: ' . strlen($fileData['content']));
        header('Cache-Control: private, no-store');
        header('X-Content-Type-Options: nosniff');

        echo $fileData['content'];
        exit;
    }
}

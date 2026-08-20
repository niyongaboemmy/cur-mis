<?php

declare(strict_types=1);

namespace App\Services;

use Core\Database;
use App\Models\ServiceRequestModel;
use App\Models\ServiceRequestAttachmentModel;
use App\Models\ServiceRequestApprovalModel;
use App\Models\ServiceCatalogModel;
use App\Models\ServiceCatalogStageModel;
use App\Models\FeeInvoiceModel;
use App\Models\StudentModel;
use App\Helpers\FileServerClient;
use App\Helpers\EmailTemplateHelper;

/**
 * Core state machine for the public service request platform.
 * Mirrors ApplicationService.php: an $allowedTransitions whitelist checked
 * with in_array(..., true) before any transition, every change appended to
 * service_request_approvals (this module's logStatusChange() equivalent).
 */
class ServiceRequestService
{
    private ServiceRequestModel           $requestModel;
    private ServiceRequestAttachmentModel $attachmentModel;
    private ServiceRequestApprovalModel   $approvalModel;
    private ServiceCatalogModel           $catalogModel;
    private ServiceCatalogStageModel      $stageModel;
    private FeeInvoiceModel               $invoiceModel;
    private StudentModel                  $studentModel;
    private Database                      $db;
    private MailService                   $mailService;

    /**
     * Fee-based services now pay upfront: submit() puts the request in
     * 'awaiting_payment' immediately (before any reviewer sees it) instead of
     * routing straight to 'in_review'. Once the UrubutoPay webhook confirms
     * payment, markPaid() carries it into 'submitted'→'in_review' itself.
     * Free services skip payment entirely and go straight to 'in_review'.
     */
    private const ALLOWED_TRANSITIONS = [
        'draft'             => ['submitted', 'awaiting_payment'],
        'awaiting_payment'  => ['paid', 'cancelled', 'expired'],
        'submitted'         => ['in_review', 'cancelled'],
        'in_review'         => ['in_review', 'approved', 'rejected', 'changes_requested', 'cancelled'],
        'changes_requested' => ['submitted', 'cancelled'],
        'approved'          => ['paid', 'cancelled'],
        'paid'              => ['submitted', 'completed'],
    ];

    /** Terminal states — no further transitions are ever allowed once reached. */
    private const TERMINAL_STATUSES = ['completed', 'rejected', 'cancelled', 'expired'];

    public function __construct()
    {
        $this->requestModel    = new ServiceRequestModel();
        $this->attachmentModel = new ServiceRequestAttachmentModel();
        $this->approvalModel   = new ServiceRequestApprovalModel();
        $this->catalogModel    = new ServiceCatalogModel();
        $this->stageModel      = new ServiceCatalogStageModel();
        $this->invoiceModel    = new FeeInvoiceModel();
        $this->studentModel    = new StudentModel();
        $this->db              = Database::getInstance();
        $this->mailService     = new MailService();
    }

    /**
     * Email the applicant a short status update with the request's reference
     * number, at every step of the lifecycle. Mirrors ApplicationService's
     * sendApplicationEmail: never throws, silently no-ops without an email on
     * file, so a broken/slow SMTP server never blocks the underlying transition.
     */
    /**
     * @param array{binary:string,filename:string}|null $attachment Optional PDF to attach (e.g. the finished document).
     */
    private function notifyApplicant(array $request, string $headline, string $message, ?array $attachment = null): void
    {
        try {
            $email = trim((string)($request['email'] ?? ''));
            if ($email === '') {
                return;
            }

            $service = $this->catalogModel->find((int)$request['service_id']);
            $html = EmailTemplateHelper::serviceRequestStatusTemplate(
                $request['full_name'] ?? 'Applicant',
                $request['request_code'],
                $service['name'] ?? 'Service Request',
                $headline,
                $message
            );

            $subject = "{$headline} — {$request['request_code']}";

            if ($attachment !== null) {
                $this->mailService->sendWithAttachment(
                    $email,
                    $subject,
                    $html,
                    strip_tags($html),
                    $attachment['binary'],
                    $attachment['filename']
                );
            } else {
                $this->mailService->send($email, $subject, $html, strip_tags($html));
            }
        } catch (\Throwable $e) {
            error_log('[ServiceRequestService] Email error: ' . $e->getMessage());
        }
    }

    private function transition(int $requestId, string $from, string $to, array $extra = []): void
    {
        $allowed = self::ALLOWED_TRANSITIONS[$from] ?? [];
        if (!in_array($to, $allowed, true)) {
            throw new \RuntimeException("Invalid service request transition from '{$from}' to '{$to}'.");
        }
        $this->requestModel->updateStatus($requestId, $to, $extra);
    }

    private function logDecision(int $requestId, int $stageOrder, string $stageKey, string $decision, ?int $actorId, ?string $actorName, ?string $actorRole, ?string $comment): void
    {
        $this->approvalModel->create([
            'service_request_id' => $requestId,
            'stage_order'        => $stageOrder,
            'stage_key'          => $stageKey,
            'actor_id'           => $actorId,
            'actor_name'         => $actorName,
            'actor_role'         => $actorRole,
            'decision'           => $decision,
            'comment'            => $comment,
        ]);
    }

    private function generateRequestCode(): string
    {
        $year = date('Y');
        $row  = $this->db->fetchOne(
            "SELECT COUNT(*) AS cnt FROM `service_requests` WHERE request_code LIKE ?",
            ["SR-{$year}-%"]
        );
        $seq = str_pad((string)(((int)($row['cnt'] ?? 0)) + 1), 6, '0', STR_PAD_LEFT);
        return "SR-{$year}-{$seq}";
    }

    /**
     * @param array $formData     Free-form fields from the submission form.
     * @param array $files        $_FILES-shaped array keyed by attachment_key.
     * @param array $requester    ['user_id'=>?int, 'full_name', 'email', 'phone', 'student_regnumber'=>?string, 'national_id'=>?string]
     */
    /** @return array<string, array{id:string,original_name:string,size:int,mime:string}> keyed by attachment_key */
    private function uploadAttachments(array $requiredAttachments, array $files, bool $enforceRequired): array
    {
        $uploaded = [];

        foreach ($requiredAttachments as $spec) {
            $key      = $spec['key'];
            $required = !empty($spec['required']);
            $file     = $files[$key] ?? null;

            if (!$file || ($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
                if ($required && $enforceRequired) {
                    throw new \RuntimeException("Missing required attachment: {$spec['label']}.");
                }
                continue;
            }

            // `mime_types` in the catalog is authored inconsistently — some rows
            // hold extensions ("pdf", "jpg"), others real MIME types
            // ("application/pdf"). Normalise both the spec and the uploaded file
            // to canonical extensions before comparing, otherwise an extension
            // list can never match a MIME-derived value and every upload is
            // rejected with a 422 that contradicts its own "Allowed:" hint.
            $allowed = self::normaliseTypeList($spec['mime_types'] ?? []);
            if ($allowed !== []) {
                $ext = strtolower(pathinfo((string)($file['name'] ?? ''), PATHINFO_EXTENSION));
                $candidates = array_filter([
                    self::canonicalExtension($ext),
                    self::canonicalExtension((string)($file['type'] ?? '')),
                ]);
                if (array_intersect($candidates, $allowed) === []) {
                    throw new \RuntimeException(
                        "Invalid file type for '{$spec['label']}'. Allowed: " . implode(', ', $allowed)
                    );
                }
            }

            $client   = new FileServerClient();
            $uploaded[$key] = $client->upload($file);
        }

        return $uploaded;
    }

    /**
     * Canonical extension for a type token that may be either a bare extension
     * ("jpg", ".JPG") or a MIME type ("image/jpeg"). Returns '' when the token
     * is not a type we recognise.
     */
    private static function canonicalExtension(string $token): string
    {
        $token = strtolower(trim($token, " \t\n\r\0\x0B."));
        if ($token === '') {
            return '';
        }

        // MIME types that map onto one of our accepted extensions.
        $mimeToExt = [
            'application/pdf' => 'pdf',
            'image/jpeg'      => 'jpg',
            'image/jpg'       => 'jpg',   // non-standard but emitted by some clients
            'image/pjpeg'     => 'jpg',
            'image/png'       => 'png',
            'image/webp'      => 'webp',
        ];
        if (isset($mimeToExt[$token])) {
            return $mimeToExt[$token];
        }

        // Bare extensions. 'jpeg' folds into 'jpg' so the two spellings compare equal.
        $extAliases = ['pdf' => 'pdf', 'jpg' => 'jpg', 'jpeg' => 'jpg', 'png' => 'png', 'webp' => 'webp'];
        return $extAliases[$token] ?? '';
    }

    /** Normalise a catalog `mime_types` list to unique canonical extensions. */
    private static function normaliseTypeList(mixed $list): array
    {
        if (!is_array($list)) {
            return [];
        }
        $out = [];
        foreach ($list as $token) {
            if (!is_string($token)) {
                continue;
            }
            $ext = self::canonicalExtension($token);
            if ($ext !== '' && !in_array($ext, $out, true)) {
                $out[] = $ext;
            }
        }
        return $out;
    }

    public function submit(string $serviceSlug, array $formData, array $files, array $requester): array
    {
        $service = $this->catalogModel->findActiveBySlug($serviceSlug);
        if (!$service) {
            throw new \RuntimeException('Service not found or is no longer accepting requests.');
        }

        $requiredAttachments = json_decode($service['required_attachments'] ?? '[]', true) ?: [];
        $uploaded = $this->uploadAttachments($requiredAttachments, $files, true);

        $requestCode = $this->generateRequestCode();

        $id = (int)$this->requestModel->create([
            'request_code'         => $requestCode,
            'service_id'           => (int)$service['id'],
            'requester_type'       => $requester['requester_type'] ?? 'student',
            'requester_user_id'    => $requester['user_id'] ?? null,
            'student_regnumber'    => $requester['student_regnumber'] ?? null,
            'national_id'          => $requester['national_id'] ?? null,
            'full_name'            => $requester['full_name'],
            'phone'                => $requester['phone'] ?? null,
            'email'                => $requester['email'] ?? null,
            'form_data'            => json_encode($formData),
            'current_stage_order'  => 1,
            'status'               => 'draft',
            'submitted_at'         => date('Y-m-d H:i:s'),
        ]);

        foreach ($uploaded as $key => $u) {
            $this->attachmentModel->create([
                'service_request_id' => $id,
                'attachment_key'     => $key,
                'file_server_id'     => $u['id'],
                'original_name'      => $u['original_name'],
                'file_size'          => $u['size'],
                'file_mime'          => $u['mime'],
            ]);
        }

        $this->logDecision($id, 1, 'submission', 'submitted', $requester['user_id'] ?? null, $requester['full_name'], $requester['requester_type'] ?? 'student', null);

        $requiresPayment = !empty($service['requires_payment']);

        if ($requiresPayment) {
            // Pay-first: hold the request out of the review queue until
            // UrubutoPay confirms payment (see markPaid()).
            $created   = $this->requestModel->find($id);
            $invoiceId = $this->createInvoiceForRequest($id, $created, $service);
            $this->transition($id, 'draft', 'awaiting_payment', ['invoice_id' => $invoiceId]);
        } else {
            $this->transition($id, 'draft', 'submitted');
            $this->transition($id, 'submitted', 'in_review');
        }

        SystemLogService::log(
            'CREATE',
            'SERVICE_REQUESTS',
            "Submitted service request {$requestCode} for '{$service['name']}'.",
            $id,
            'service_request',
            ['service_id' => $service['id']],
            $requester['user_id'] ? ['id' => $requester['user_id'], 'full_name' => $requester['full_name'], 'email' => $requester['email'] ?? ''] : null
        );

        $created = $this->requestModel->find($id);

        if ($requiresPayment) {
            $this->notifyApplicant(
                $created,
                'Payment Required',
                "We've received your request for \"{$service['name']}\". Please complete payment of {$service['fee_amount']} {$service['fee_currency']} to start processing — your request will enter the review queue as soon as payment is confirmed."
            );
        } else {
            $this->notifyApplicant(
                $created,
                'Request Received',
                "We've received your request for \"{$service['name']}\" and it is now under review. Keep this reference number handy — you'll need it to track progress."
            );
        }

        return $created;
    }

    /**
     * Amend and resend a request stuck in 'changes_requested'. Resumes review
     * at the SAME stage that requested the changes (rather than restarting at
     * stage 1) so the reviewer who flagged the issue sees it again first.
     * New attachments are optional — any key omitted keeps its prior upload.
     */
    public function resubmit(int $requestId, int $requesterUserId, array $formData, array $files): array
    {
        $request = $this->requestModel->find($requestId);
        if (!$request) {
            throw new \RuntimeException('Service request not found.');
        }
        if ((int)$request['requester_user_id'] !== $requesterUserId) {
            throw new \RuntimeException('You do not have access to this request.');
        }
        if ($request['status'] !== 'changes_requested') {
            throw new \RuntimeException("This request is not awaiting changes (current status: {$request['status']}).");
        }

        $service = $this->catalogModel->find((int)$request['service_id']);
        $requiredAttachments = json_decode($service['required_attachments'] ?? '[]', true) ?: [];
        $uploaded = $this->uploadAttachments($requiredAttachments, $files, false);

        foreach ($uploaded as $key => $u) {
            $this->attachmentModel->create([
                'service_request_id' => $requestId,
                'attachment_key'     => $key,
                'file_server_id'     => $u['id'],
                'original_name'      => $u['original_name'],
                'file_size'          => $u['size'],
                'file_mime'          => $u['mime'],
            ]);
        }

        $mergedFormData = array_merge(json_decode($request['form_data'] ?? '{}', true) ?: [], $formData);
        $this->requestModel->update($requestId, ['form_data' => json_encode($mergedFormData)]);

        $this->logDecision($requestId, (int)$request['current_stage_order'], 'resubmission', 'submitted', $requesterUserId, $request['full_name'], $request['requester_type'], null);
        $this->transition($requestId, 'changes_requested', 'submitted');
        $this->transition($requestId, 'submitted', 'in_review');

        SystemLogService::log(
            'CREATE',
            'SERVICE_REQUESTS',
            "Resubmitted service request {$request['request_code']} after requested changes.",
            $requestId,
            'service_request'
        );

        $updated = $this->requestModel->find($requestId);
        $this->notifyApplicant(
            $updated,
            'Updated Request Received',
            "Thanks for the update — we've received your revised submission and it's back under review."
        );

        return $updated;
    }

    /**
     * Supervisory cancellation outside the normal approve/reject flow
     * (VOID_SERVICE_REQUEST permission) — e.g. duplicate submission, fraud,
     * or a request the university decides to withdraw administratively.
     * Allowed from any non-terminal status.
     */
    public function void(int $requestId, int $actorId, string $actorName, ?string $reason): array
    {
        $request = $this->requestModel->find($requestId);
        if (!$request) {
            throw new \RuntimeException('Service request not found.');
        }
        if (in_array($request['status'], self::TERMINAL_STATUSES, true)) {
            throw new \RuntimeException("This request is already in a terminal state ({$request['status']}) and cannot be voided.");
        }

        $this->logDecision($requestId, (int)$request['current_stage_order'], 'void', 'voided', $actorId, $actorName, 'admin', $reason);
        $this->transition($requestId, $request['status'], 'cancelled');

        SystemLogService::log(
            'REJECT',
            'SERVICE_REQUESTS',
            "Voided service request {$request['request_code']}.",
            $requestId,
            'service_request',
            ['reason' => $reason],
            ['id' => $actorId, 'full_name' => $actorName]
        );

        $updated = $this->requestModel->find($requestId);
        $this->notifyApplicant(
            $updated,
            'Request Cancelled',
            'Your request has been cancelled.' . ($reason ? " Reason: {$reason}" : '')
        );

        return $updated;
    }

    public function myRequests(int $userId): array
    {
        return $this->requestModel->findByRequesterUser($userId);
    }

    public function queueForActor(int $stageOrder, string $permissionSlug): array
    {
        return $this->requestModel->queueForStage($stageOrder, $permissionSlug);
    }

    /**
     * @param string $decision 'approved'|'rejected'|'changes_requested'
     */
    public function decide(int $requestId, string $decision, array $actorPermissions, int $actorId, string $actorName, string $actorRole, ?string $comment): array
    {
        $request = $this->requestModel->find($requestId);
        if (!$request) {
            throw new \RuntimeException('Service request not found.');
        }
        if ($request['status'] !== 'in_review') {
            throw new \RuntimeException("This request is not awaiting review (current status: {$request['status']}).");
        }

        $stage = $this->stageModel->findStage((int)$request['service_id'], (int)$request['current_stage_order']);
        if (!$stage) {
            throw new \RuntimeException('No approval stage configured for this request.');
        }

        // Defense-in-depth: route-layer PermissionMiddleware already gated entry
        // to the approvals endpoints, but re-verify the actor actually holds the
        // permission for THIS stage before allowing the decision.
        if (!in_array($stage['required_permission_slug'], $actorPermissions, true)) {
            throw new \RuntimeException('You do not hold the permission required for this request\'s current stage.');
        }

        if (!in_array($decision, ['approved', 'rejected', 'changes_requested'], true)) {
            throw new \RuntimeException('Invalid decision.');
        }

        $this->logDecision(
            $requestId,
            (int)$stage['stage_order'],
            $stage['stage_key'],
            $decision,
            $actorId,
            $actorName,
            $actorRole,
            $comment
        );

        if ($decision === 'rejected') {
            $this->transition($requestId, 'in_review', 'rejected');
            SystemLogService::log('REJECT', 'SERVICE_REQUESTS', "Rejected service request {$request['request_code']} at stage '{$stage['stage_label']}'.", $requestId, 'service_request', ['comment' => $comment], ['id' => $actorId, 'full_name' => $actorName]);
            $updated = $this->requestModel->find($requestId);
            $this->notifyApplicant(
                $updated,
                'Request Rejected',
                "Your request was rejected at the \"{$stage['stage_label']}\" stage." . ($comment ? " Reason: {$comment}" : '')
            );
            return $updated;
        }

        if ($decision === 'changes_requested') {
            $this->transition($requestId, 'in_review', 'changes_requested');
            SystemLogService::log('REJECT', 'SERVICE_REQUESTS', "Requested changes on service request {$request['request_code']} at stage '{$stage['stage_label']}'.", $requestId, 'service_request', ['comment' => $comment], ['id' => $actorId, 'full_name' => $actorName]);
            $updated = $this->requestModel->find($requestId);
            $this->notifyApplicant(
                $updated,
                'Changes Requested',
                "Changes were requested at the \"{$stage['stage_label']}\" stage. Please log in and resubmit." . ($comment ? " Note: {$comment}" : '')
            );
            return $updated;
        }

        // decision === 'approved'
        SystemLogService::log('APPROVE', 'SERVICE_REQUESTS', "Approved service request {$request['request_code']} at stage '{$stage['stage_label']}'.", $requestId, 'service_request', ['comment' => $comment], ['id' => $actorId, 'full_name' => $actorName]);

        if (!$stage['is_final_approval']) {
            $this->requestModel->update($requestId, ['current_stage_order' => (int)$stage['stage_order'] + 1]);
            $updated   = $this->requestModel->find($requestId);
            $nextStage = $this->stageModel->findStage((int)$request['service_id'], (int)$stage['stage_order'] + 1);
            $this->notifyApplicant(
                $updated,
                'Request Approved — Next Stage',
                "Your request passed the \"{$stage['stage_label']}\" stage" . ($nextStage ? " and is now under review at \"{$nextStage['stage_label']}\"." : '.')
            );
            return $updated;
        }

        // Final approval — payment (if this service requires it) was already
        // collected before the request ever entered review (see submit()),
        // so there's nothing left to gate: go straight to document generation.
        $this->transition($requestId, 'in_review', 'approved');
        $this->transition($requestId, 'approved', 'paid');
        $this->completeRequest($requestId);

        return $this->requestModel->find($requestId);
    }

    private function createInvoiceForRequest(int $requestId, array $request, array $service): int
    {
        $invoiceNumber = 'SR-INV-' . date('Y') . '-' . str_pad((string)$requestId, 6, '0', STR_PAD_LEFT);

        $invoiceId = (int)$this->invoiceModel->create([
            'invoice_number'       => $invoiceNumber,
            'student_id'           => $request['student_regnumber'] ?? ('SR-' . $requestId),
            'fee_structure_id'     => null,
            'academic_year_id'     => null,
            'semester'             => null,
            'fee_type'             => 'service_request',
            'description'          => "Service request fee — {$service['name']} ({$request['request_code']})",
            'amount_due'           => (float)$service['fee_amount'],
            'amount_paid'          => 0.00,
            'bursary_applied'      => 0.00,
            'due_date'             => null,
            'status'               => 'unpaid',
            'is_system_generated'  => 1,
            'module_id'            => null,
            'created_by'           => 0,
        ]);

        return $invoiceId;
    }

    /**
     * Webhook entry point — UrubutoPay confirming the upfront, pre-review fee.
     * Clears the payment gate set by submit() and hands the request straight
     * into the normal review queue (submitted → in_review), same as a free
     * service. Idempotent: a request already past 'awaiting_payment' is a no-op,
     * so a duplicate/retried webhook delivery can never double-advance it.
     */
    public function markPaid(int $requestId, array $paymentMeta): void
    {
        $request = $this->requestModel->find($requestId);
        if (!$request) {
            throw new \RuntimeException('Service request not found.');
        }
        if ($request['status'] !== 'awaiting_payment') {
            return; // already paid / not awaiting payment — idempotent no-op
        }

        $this->transition($requestId, 'awaiting_payment', 'paid');

        $this->logDecision(
            $requestId,
            (int)$request['current_stage_order'],
            'payment',
            'payment_confirmed',
            null,
            $paymentMeta['payer_name'] ?? 'UrubutoPay',
            'system',
            $paymentMeta['transaction_id'] ?? null
        );

        SystemLogService::log(
            'APPROVE',
            'SERVICE_REQUESTS',
            "Payment confirmed for service request {$request['request_code']}.",
            $requestId,
            'service_request',
            $paymentMeta
        );

        $this->transition($requestId, 'paid', 'submitted');
        $this->transition($requestId, 'submitted', 'in_review');

        $updated = $this->requestModel->find($requestId);
        $this->notifyApplicant(
            $updated,
            'Payment Confirmed',
            "We've received your payment. Your request is now under review."
        );
    }

    /**
     * Final-approval tail: generate the document and mark the request
     * completed. Called only from decide() once every approval stage has
     * passed — by then, payment (if this service required it) already
     * happened before review began, so there's no payment gate left to check.
     */
    private function completeRequest(int $requestId): void
    {
        $documentService = new ServiceRequestDocumentService();

        // Document generation + download token issuance happens here (Phase 6).
        $documentService->generateForRequest($requestId);

        // The document is ready the instant it's generated — 'paid' and
        // 'completed' aren't independently actionable states in this flow,
        // so auto-advance rather than requiring a separate staff action.
        $this->transition($requestId, 'paid', 'completed', ['completed_at' => date('Y-m-d H:i:s')]);

        $completed = $this->requestModel->find($requestId);

        // Attach the actual document to the email when we can render it —
        // the applicant shouldn't have to log in just to see it landed.
        $attachment = null;
        $pdfData = $documentService->buildPdfData($requestId);
        if ($pdfData) {
            $binary = \App\Helpers\ServiceRequestDocumentPdf::renderPdfBinary($pdfData);
            if ($binary) {
                $attachment = ['binary' => $binary, 'filename' => "{$completed['request_code']}.pdf"];
            }
        }

        $this->notifyApplicant(
            $completed,
            'Document Ready',
            $attachment !== null
                ? "Your document is ready — it's attached to this email. You can also download it anytime from the tracking page or your account."
                : "Your document is ready! Log in to your account to download it.",
            $attachment
        );
    }

    public function getTrackingStatus(string $requestCode, string $identifier): ?array
    {
        $request = $this->requestModel->findByCode($requestCode);
        if (!$request) {
            return null;
        }

        $matches = false;
        foreach (['national_id', 'phone', 'email', 'student_regnumber'] as $field) {
            if (!empty($request[$field]) && strcasecmp((string)$request[$field], $identifier) === 0) {
                $matches = true;
                break;
            }
        }
        if (!$matches) {
            return null;
        }

        $service = $this->catalogModel->find((int)$request['service_id']);
        $steps   = $this->buildStageSteps($request, $service);

        // Only expose enough to download once the document actually exists —
        // the identifier check above already proved this caller is the
        // requester, so the token itself is safe to hand back here.
        $canDownload = in_array($request['status'], ['paid', 'completed'], true) && !empty($request['download_token']);

        return [
            'request_code'   => $request['request_code'],
            'service_name'   => $service['name'] ?? null,
            'status'         => $this->coarseStatusLabel($request['status']),
            'steps'          => $steps,
            'current_step'   => $this->currentStepIndex($steps),
            'total_steps'    => count($steps),
            'submitted_at'   => $request['submitted_at'],
            'completed_at'   => $request['completed_at'],
            'document_id'    => $canDownload ? (int)$request['id'] : null,
            'download_token' => $canDownload ? $request['download_token'] : null,
        ];
    }

    /** Same step breakdown as public tracking, for the authenticated requester/reviewer view. */
    public function getProgress(int $requestId): ?array
    {
        $request = $this->requestModel->find($requestId);
        if (!$request) {
            return null;
        }
        $service = $this->catalogModel->find((int)$request['service_id']);
        $steps   = $this->buildStageSteps($request, $service);

        return [
            'request_code' => $request['request_code'],
            'status'       => $request['status'],
            'steps'        => $steps,
            'current_step' => $this->currentStepIndex($steps),
            'total_steps'  => count($steps),
        ];
    }

    /**
     * Build the ordered, per-service step list for progress display —
     * dynamic per service_catalog_stages, never a static/hardcoded chain.
     * Labels only; required_permission_slug is never exposed here.
     *
     * Payment (when required) now happens BEFORE review, so it's shown
     * right after submission rather than after the approval stages.
     */
    private function buildStageSteps(array $request, array $service): array
    {
        $status          = $request['status'];
        $currentOrder    = (int)$request['current_stage_order'];
        $requiresPayment = !empty($service['requires_payment']);
        $stages          = $this->stageModel->findByServiceOrdered((int)$service['id']);

        $terminalBad      = in_array($status, ['rejected', 'cancelled', 'expired'], true);
        $paymentPending   = in_array($status, ['draft', 'awaiting_payment'], true);
        $reachedCompleted = $status === 'completed';

        $steps = [[
            'key'   => 'submission',
            'label' => 'Request Submitted',
            'state' => 'completed',
        ]];

        if ($requiresPayment) {
            if ($paymentPending) {
                $state = ($status === 'cancelled') ? 'cancelled' : 'current';
            } else {
                // Payment already cleared before review began — every status
                // past 'awaiting_payment' implies it succeeded.
                $state = 'completed';
            }
            $steps[] = ['key' => 'payment', 'label' => 'Payment', 'state' => $state];
        }

        foreach ($stages as $stage) {
            $order = (int)$stage['stage_order'];

            if ($paymentPending) {
                $state = 'pending'; // review hasn't started — waiting on payment
            } elseif ($order < $currentOrder || ($order === $currentOrder && in_array($status, ['approved', 'paid', 'completed'], true))) {
                $state = 'completed';
            } elseif ($order === $currentOrder && $status === 'rejected') {
                $state = 'rejected';
            } elseif ($order === $currentOrder && $status === 'changes_requested') {
                $state = 'changes_requested';
            } elseif ($order === $currentOrder && $status === 'cancelled') {
                $state = 'cancelled';
            } elseif ($order === $currentOrder && in_array($status, ['submitted', 'in_review'], true)) {
                $state = 'current';
            } else {
                $state = $terminalBad ? 'skipped' : 'pending';
            }

            $steps[] = [
                'key'   => $stage['stage_key'],
                'label' => $stage['stage_label'],
                'state' => $state,
            ];
        }

        $steps[] = [
            'key'   => 'ready',
            'label' => 'Document Ready',
            'state' => $reachedCompleted ? 'completed' : ($terminalBad ? 'skipped' : 'pending'),
        ];

        return $steps;
    }

    /** 1-based index of the first non-completed step, or the last step if everything is done/terminal. */
    private function currentStepIndex(array $steps): int
    {
        foreach ($steps as $i => $step) {
            if (!in_array($step['state'], ['completed', 'skipped'], true)) {
                return $i + 1;
            }
        }
        return count($steps);
    }

    private function coarseStatusLabel(string $status): string
    {
        return match ($status) {
            'draft', 'awaiting_payment' => 'Awaiting Payment',
            'submitted', 'in_review', 'changes_requested', 'approved' => 'Processing',
            'paid' => 'Ready',
            'completed' => 'Completed',
            'rejected' => 'Rejected',
            'cancelled' => 'Cancelled',
            'expired' => 'Expired',
            default => 'Unknown',
        };
    }
}

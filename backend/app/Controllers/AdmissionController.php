<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Models\AdmissionOfferModel;
use App\Models\StudentApplicationModel;
use App\Models\MeritListModel;
use App\Services\ApplicationService;
use App\Helpers\ValidationHelper;
use App\Helpers\AdmissionLetterPdf;
use Core\Database;
use App\Services\AdmissionBillingService;

class AdmissionController extends BaseController
{
    private AdmissionOfferModel      $offerModel;
    private StudentApplicationModel  $appModel;
    private MeritListModel           $meritListModel;
    private ApplicationService       $service;

    public function __construct()
    {
        $this->offerModel     = new AdmissionOfferModel();
        $this->appModel       = new StudentApplicationModel();
        $this->meritListModel = new MeritListModel();
        $this->service        = new ApplicationService();
    }

    /**
     * GET /api/admin/admissions/offers
     */
    public function listOffers(Request $request, Response $response): never
    {
        $db = Database::getInstance();
        $db->execute(
            "UPDATE `admission_offers` SET status = 'expired', updated_at = NOW()
             WHERE expires_at < CURDATE() AND status = 'pending'"
        );

        $page         = (int)($request->query('page')          ?? 1);
        $perPage      = (int)($request->query('per_page')      ?? 15);
        $status       = $request->query('status')               ?? '';
        $departmentId = (int)($request->query('department_id') ?? 0);
        $intake       = $request->query('intake')               ?? '';

        $perPage = max(1, min(100, $perPage));
        $offset  = ($page - 1) * $perPage;

        $conditions = [];
        $bindings   = [];

        if ($status !== '') {
            $conditions[] = 'ao.status = ?';
            $bindings[]   = $status;
        }

        if ($departmentId > 0) {
            $conditions[] = 'sa.department_id = ?';
            $bindings[]   = $departmentId;
        }

        if ($intake !== '') {
            $conditions[] = 'sa.intake = ?';
            $bindings[]   = $intake;
        }

        $enrolledOnly = $request->query('enrolled_only') === '1';
        if ($enrolledOnly) {
            $conditions[] = 'ao.enrollment_initiated = 1';
        }

        $where = $conditions ? 'WHERE ' . implode(' AND ', $conditions) : '';

        $total = (int)($db->fetchOne(
            "SELECT COUNT(*) AS cnt
             FROM `admission_offers` ao
             JOIN `student_applications` sa ON sa.id = ao.application_id
             {$where}",
            $bindings
        )['cnt'] ?? 0);

        $rows = $db->fetchAll(
            "SELECT ao.*, sa.first_name, sa.last_name, sa.email,
                    sa.application_number, sa.intake, sa.department_id,
                    d.dep_name AS department_name
             FROM `admission_offers` ao
             JOIN `student_applications` sa ON sa.id    = ao.application_id
             JOIN `departements`         d  ON d.dep_id = sa.department_id
             {$where}
             ORDER BY ao.id DESC
             LIMIT ? OFFSET ?",
            [...$bindings, $perPage, $offset]
        );

        $this->success($response, [
            'data'         => $rows,
            'total'        => $total,
            'per_page'     => $perPage,
            'current_page' => $page,
            'last_page'    => (int)ceil($total / $perPage),
        ], 'Offers fetched successfully.');
    }

    /**
     * POST /api/admin/admissions/offers
     */
    public function createOffer(Request $request, Response $response): never
    {
        $data     = $request->body();
        $authUser = $request->param('_auth_user');
        $actorId  = (int)($authUser['id'] ?? 0);

        $errors = ValidationHelper::validate($data, [
            'application_id' => 'required|numeric',
            'expires_at'     => 'required|regex:/^\d{4}-\d{2}-\d{2}$/',
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        $applicationId = (int)$data['application_id'];
        $application   = $this->appModel->getWithDetails($applicationId);

        if (!$application) {
            $this->error($response, 'Application not found.', 404);
        }

        $allowedAppStatuses = ['documents_verified'];
        if (!in_array($application['status'], $allowedAppStatuses, true)) {
            $this->error($response, "An offer can only be made for applications with 'documents_verified' status.", 422);
        }

        $existing = $this->offerModel->findByApplicationId($applicationId);
        if ($existing && in_array($existing['status'], ['pending', 'accepted'], true)) {
            $this->error($response, 'An active offer already exists for this application.', 409);
        }

        $offerRef = $this->offerModel->generateOfferReference();

        $offerId = (int)$this->offerModel->create([
            'application_id'         => $applicationId,
            'offer_letter_reference' => $offerRef,
            'offered_at'             => date('Y-m-d H:i:s'),
            'offered_by'             => $actorId,
            'expires_at'             => $data['expires_at'],
            'status'                 => 'pending',
        ]);

        $this->appModel->update($applicationId, [
            'status'      => 'offered',
            'reviewed_by' => $actorId,
            'reviewed_at' => date('Y-m-d H:i:s'),
        ]);

        $this->service->logStatusChange($applicationId, $application['status'], 'offered', $actorId, 'admin', 'Admission offer issued.');

        $portalUrl = rtrim((string)(getenv('APP_URL') ?: ''), '/') . '/portal/applications/' . $application['application_number'];

        $this->service->sendApplicationEmail('admission_offer', [
            'first_name' => $application['first_name'],
            'last_name'  => $application['last_name'],
            'email'      => $application['email'],
        ], [
            'application_number' => $application['application_number'],
            'program_name'       => $application['department_name'],
            'offer_reference'    => $offerRef,
            'expires_at'         => $data['expires_at'],
            'portal_url'         => $portalUrl,
        ]);

        // Raise the admission fees straight away (unless finance has switched
        // auto-billing off). Doing it here means the offer email and the bill
        // land together, instead of the applicant accepting a place and then
        // waiting for somebody to remember to charge them.
        $billing = (new AdmissionBillingService())->autoBillForOffer($applicationId, $actorId);

        $this->success($response, [
            'id'                     => $offerId,
            'offer_letter_reference' => $offerRef,
            'application_id'         => $applicationId,
            'expires_at'             => $data['expires_at'],
            'billing'                => $billing,
        ], 'Admission offer created successfully.', 201);
    }

    /**
     * POST /api/admin/admissions/offers/bulk
     */
    public function bulkCreateOffers(Request $request, Response $response): never
    {
        $data     = $request->body();
        $authUser = $request->param('_auth_user');
        $actorId  = (int)($authUser['id'] ?? 0);

        $errors = ValidationHelper::validate($data, [
            'department_id'    => 'required|numeric',
            'intake'           => 'required|string',
            'academic_year_id' => 'required|numeric',
            'expires_at'       => 'required|regex:/^\d{4}-\d{2}-\d{2}$/',
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        $db = Database::getInstance();

        $qualified = $db->fetchAll(
            "SELECT sa.id AS application_id, sa.application_number,
                    sa.first_name, sa.last_name, sa.email, sa.status AS application_status,
                    d.dep_name AS department_name
             FROM `student_applications` sa
             JOIN `departements`         d  ON d.dep_id = sa.department_id
             WHERE sa.department_id = ? AND sa.intake = ? AND sa.academic_year_id = ?
             AND sa.status = 'documents_verified'
             AND sa.id NOT IN (
                 SELECT application_id FROM `admission_offers`
                 WHERE status IN ('pending', 'accepted')
             )",
            [(int)$data['department_id'], $data['intake'], (int)$data['academic_year_id']]
        );

        if (empty($qualified)) {
            $this->success($response, ['created' => 0], 'No eligible applicants found for bulk offer.');
        }

        $created    = 0;
        $portalBase = rtrim((string)(getenv('APP_URL') ?: ''), '/') . '/portal/applications/';

        foreach ($qualified as $app) {
            $offerRef = $this->offerModel->generateOfferReference();

            $this->offerModel->create([
                'application_id'         => (int)$app['application_id'],
                'offer_letter_reference' => $offerRef,
                'offered_at'             => date('Y-m-d H:i:s'),
                'offered_by'             => $actorId,
                'expires_at'             => $data['expires_at'],
                'status'                 => 'pending',
            ]);

            $this->appModel->update((int)$app['application_id'], [
                'status'      => 'offered',
                'reviewed_by' => $actorId,
                'reviewed_at' => date('Y-m-d H:i:s'),
            ]);

            $this->service->logStatusChange((int)$app['application_id'], $app['application_status'], 'offered', $actorId, 'admin', 'Bulk admission offer issued.');

            $this->service->sendApplicationEmail('admission_offer', [
                'first_name' => $app['first_name'],
                'last_name'  => $app['last_name'],
                'email'      => $app['email'],
            ], [
                'application_number' => $app['application_number'],
                'program_name'       => $app['department_name'],
                'offer_reference'    => $offerRef,
                'expires_at'         => $data['expires_at'],
                'portal_url'         => $portalBase . $app['application_number'],
            ]);

            (new AdmissionBillingService())->autoBillForOffer((int)$app['application_id'], $actorId);

            $created++;
        }

        $this->success($response, ['created' => $created], "{$created} offer(s) created successfully.");
    }

    /**
     * GET /api/admin/admissions/offers/:offer_id
     */
    public function getOfferDetails(Request $request, Response $response): never
    {
        $offerId = (int)$request->param('offer_id');
        $offer   = $this->offerModel->getWithApplication($offerId);

        if (!$offer) {
            $this->error($response, 'Offer not found.', 404);
        }

        $this->success($response, $offer, 'Offer details fetched.');
    }

    /**
     * POST /api/admin/admissions/offers/:offer_id/enroll
     */
    public function initiateEnrollment(Request $request, Response $response): never
    {
        $offerId  = (int)$request->param('offer_id');
        $authUser = $request->param('_auth_user');
        $actorId  = (int)($authUser['id'] ?? 0);

        try {
            $result = $this->service->initiateEnrollment($offerId, $actorId);
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 422);
        }

        $this->success($response, $result, 'Enrollment initiated successfully.', 201);
    }

    /**
     * POST /api/admin/applications/:id/enroll
     */
    public function initiateEnrollmentByAppId(Request $request, Response $response): never
    {
        $appId    = (int)$request->param('id');
        $authUser = $request->param('_auth_user');
        $actorId  = (int)($authUser['id'] ?? 0);
        $data     = $request->body();
        $levelId  = isset($data['level_id']) ? (int)$data['level_id'] : 1;

        $offer = $this->offerModel->findByApplicationId($appId);
        if (!$offer) {
            $this->error($response, 'No active admission offer found for this application.', 404);
        }

        try {
            $result = $this->service->initiateEnrollment((int)$offer['id'], $actorId, $levelId);
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 422);
        } catch (\Throwable $e) {
            error_log('[AdmissionController] initiateEnrollment error: ' . $e->getMessage() . ' at ' . $e->getFile() . ':' . $e->getLine());
            $this->error($response, 'An error occurred while generating the registration number: ' . $e->getMessage(), 500);
        }

        $this->success($response, $result, 'Enrollment initiated successfully.', 201);
    }

    /**
     * POST /api/admin/applications/:id/accept-offer
     *
     * Administrative override that records the offer as accepted on the
     * applicant's behalf — for an acceptance that arrived by phone or in person
     * rather than through the portal.
     *
     * It does NOT settle anything: the admission fees are real bills paid
     * through Urubuto Pay (see AdmissionBillingService), and enrollment stays
     * blocked until they are. This endpoint used to be labelled "simulates
     * registration fee payment", which is exactly what it must never be
     * mistaken for now that the fee is actually collected.
     */
    public function acceptOfferByAppId(Request $request, Response $response): never
    {
        $appId    = (int)$request->param('id');
        $authUser = $request->param('_auth_user');
        $actorId  = (int)($authUser['id'] ?? 0);

        $offer = $this->offerModel->findByApplicationId($appId);
        if (!$offer) {
            $this->error($response, 'No admission offer found for this application.', 404);
        }

        if ($offer['status'] === 'accepted') {
            $this->error($response, 'Offer has already been accepted.', 422);
        }

        $db = Database::getInstance();
        $db->execute(
            "UPDATE `admission_offers` SET status = 'accepted', responded_at = NOW(), updated_at = NOW() WHERE id = ?",
            [(int)$offer['id']]
        );
        $db->execute(
            "UPDATE `student_applications` SET status = 'offer_accepted', updated_at = NOW() WHERE id = ?",
            [$appId]
        );

        $this->service->logStatusChange($appId, 'offered', 'offer_accepted', $actorId, 'admin', 'Offer accepted on the applicant\'s behalf by an administrator.');

        $this->success($response, ['offer_id' => (int)$offer['id']], 'Offer accepted. The admission fees still have to be paid before a registration number is issued.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Admission billing — the fees between the offer and the registration number
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * GET /api/admin/applications/:id/bills
     *
     * What the applicant has been billed, what they have paid, and — when
     * nothing has been billed yet — what the published fee structures say they
     * WOULD be billed, so the validator commits to a price they can see first.
     */
    public function listBills(Request $request, Response $response): never
    {
        $appId = (int)$request->param('id');

        try {
            $overview = (new AdmissionBillingService())->overview($appId);
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 404);
        }

        $this->success($response, $overview, 'Admission bills fetched.');
    }

    /**
     * POST /api/admin/applications/:id/bills
     * Body: { fee_types?: ["REGISTRATION", "CURSU"] }
     *
     * Raise the bills. Idempotent — re-running re-prices untouched bills from
     * the current structures and leaves anything already paid alone.
     */
    public function createBills(Request $request, Response $response): never
    {
        $appId    = (int)$request->param('id');
        $authUser = $request->param('_auth_user');
        $actorId  = (int)($authUser['id'] ?? 0);

        $body     = $request->body();
        $feeTypes = null;
        if (!empty($body['fee_types']) && is_array($body['fee_types'])) {
            $feeTypes = array_values(array_filter(array_map('strval', $body['fee_types'])));
        }

        try {
            $result = (new AdmissionBillingService())->bill($appId, $actorId ?: null, $feeTypes);
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 422);
        }

        if (empty($result['billed'])) {
            $reasons = array_column($result['skipped'], 'reason');
            $this->error(
                $response,
                'Nothing could be billed. ' . ($reasons ? implode(' ', array_unique($reasons)) : ''),
                422,
                ['skipped' => $result['skipped']]
            );
        }

        $count = count($result['billed']);
        $this->success(
            $response,
            $result,
            $count . ' admission ' . ($count === 1 ? 'fee has' : 'fees have') . ' been billed. The applicant has been notified.',
            201
        );
    }

    /**
     * POST /api/admin/applications/:id/bills/:bill_id/confirm
     * Body: { amount, reference, notes? }
     *
     * Record a settlement that reached the institution outside the gateway —
     * a bank transfer or a cash payment at the finance desk. Attributed to the
     * validator who confirms it, and refused if the reference has already been
     * booked, so the gateway ledger and this one cannot drift apart.
     */
    public function confirmBillPayment(Request $request, Response $response): never
    {
        $appId    = (int)$request->param('id');
        $billId   = (int)$request->param('bill_id');
        $authUser = $request->param('_auth_user');
        $actorId  = (int)($authUser['id'] ?? 0);

        $body      = $request->body();
        $amount    = (float)($body['amount'] ?? 0);
        $reference = trim((string)($body['reference'] ?? ''));
        $notes     = isset($body['notes']) ? (string)$body['notes'] : null;

        try {
            $result = (new AdmissionBillingService())->recordManualPayment(
                $appId, $billId, $amount, $reference, $actorId, $notes
            );
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 422);
        }

        $this->success(
            $response,
            $result,
            $result['summary']['fully_paid']
                ? 'Payment recorded. All admission fees are settled — the registration number is being issued.'
                : 'Payment recorded. The applicant has been notified.',
            201
        );
    }

    /**
     * GET /api/admin/applications/:id/bills/checkout
     *
     * The applicant's own Urubuto Pay link, so a validator sitting with them at
     * the desk can open, print or send exactly what the applicant would see.
     */
    public function billCheckout(Request $request, Response $response): never
    {
        $appId = (int)$request->param('id');

        $application = (new \App\Models\StudentApplicationModel())->find($appId);
        if (!$application) {
            $this->error($response, 'Application not found.', 404);
        }

        $feeType     = strtoupper(trim((string)($request->query('fee_type') ?? '')));
        $serviceCode = null;
        if ($feeType !== '') {
            $bill = (new \App\Models\ApplicationInvoiceModel())->findByFeeType($appId, $feeType);
            if (!$bill) {
                $this->error($response, 'This applicant has not been billed for ' . $feeType . '.', 404);
            }
            $serviceCode = $bill['service_code'] ?: null;
        }

        $billing = new AdmissionBillingService();

        $this->success($response, [
            'checkout_url'       => $billing->checkoutUrl((string)$application['application_number'], $serviceCode),
            'payer_code'         => (string)$application['application_number'],
            'service_code'       => $serviceCode,
            'application_number' => (string)$application['application_number'],
        ], 'Checkout link generated.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Manual Admission
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * POST /api/admin/admissions/manual-admit
     */
    public function manualAdmit(Request $request, Response $response): never
    {
        $data     = $request->body();
        $authUser = $request->param('_auth_user');
        $actorId  = (int)($authUser['id'] ?? 0);

        $errors = ValidationHelper::validate($data, [
            'application_id' => 'required|numeric',
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        try {
            $result = $this->service->manualAdmit(
                (int)$data['application_id'],
                $actorId,
                (string)($data['reason'] ?? ''),
                (string)($data['notes'] ?? ''),
                !empty($data['expires_at']) ? (string)$data['expires_at'] : null
            );
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 422);
        }

        // Manual admission is the path the admissions desk actually uses to
        // issue an offer, so it must raise the admission bills too — otherwise
        // the applicant reaches the fees stage with nothing billed.
        $result['billing'] = (new AdmissionBillingService())->autoBillForOffer(
            (int)$data['application_id'],
            $actorId
        );

        $this->success($response, $result, 'Application manually admitted.', 201);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Admission Letter
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * GET /api/admin/admissions/offers/:offer_id/letter
     * Stream PDF admission letter to browser.
     */
    public function downloadLetter(Request $request, Response $response): never
    {
        $offerId = (int)$request->param('offer_id');

        $this->assertExemptionLetterConfirmedForOffer($response, $offerId);

        try {
            $data = $this->service->getLetterData($offerId);
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 404);
        }

        $filename = 'admission-letter-' . ($data['application_number'] ?? $offerId) . '.pdf';
        AdmissionLetterPdf::streamPdf($data, $filename);
    }

    /**
     * Block admission-letter issuance for credit-transfer applicants whose
     * exemption letter hasn't been confirmed by both registry and finance.
     * Bails with a 422 error response when blocked.
     */
    private function assertExemptionLetterConfirmedForOffer(Response $response, int $offerId): void
    {
        $row = Database::getInstance()->fetchOne(
            "SELECT sa.is_credit_transfer, sa.exemption_letter_status
             FROM `admission_offers` ao
             JOIN `student_applications` sa ON sa.id = ao.application_id
             WHERE ao.id = ? LIMIT 1",
            [$offerId]
        );
        if (!$row) return;
        if ((int)($row['is_credit_transfer'] ?? 0) !== 1) return;
        $status = (string)($row['exemption_letter_status'] ?? 'not_required');
        if ($status !== 'confirmed') {
            $this->error(
                $response,
                'Admission letter cannot be issued until the exemption letter is confirmed by BOTH registry and finance.',
                422
            );
        }
    }

    /**
     * GET /api/portal/admission-letter
     * Public token-based download (applicant, no JWT required).
     */
    public function downloadLetterByToken(Request $request, Response $response): never
    {
        $token = $request->query('token') ?? '';

        if (strlen($token) < 20) {
            $this->error($response, 'Invalid or missing token.', 400);
        }

        $db    = Database::getInstance();
        $offer = $db->fetchOne(
            "SELECT ao.id FROM `admission_offers` ao WHERE ao.letter_token = ? LIMIT 1",
            [$token]
        );

        if (!$offer) {
            $this->error($response, 'Letter not found or token is invalid.', 404);
        }

        try {
            $data = $this->service->getLetterData((int)$offer['id']);
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 404);
        }

        $filename = 'admission-letter-' . ($data['application_number'] ?? $offer['id']) . '.pdf';
        AdmissionLetterPdf::streamPdf($data, $filename);
    }

    /**
     * POST /api/admin/admissions/offers/:offer_id/send-letter
     */
    public function sendLetter(Request $request, Response $response): never
    {
        $offerId  = (int)$request->param('offer_id');
        $authUser = $request->param('_auth_user');
        $actorId  = (int)($authUser['id'] ?? 0);

        $this->assertExemptionLetterConfirmedForOffer($response, $offerId);

        try {
            $result = $this->service->sendAdmissionLetter($offerId, $actorId);
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 422);
        }

        $this->success($response, $result, 'Admission letter sent successfully.');
    }

    /**
     * POST /api/admin/admissions/letters/bulk-send
     */
    public function bulkSendLetters(Request $request, Response $response): never
    {
        $data     = $request->body();
        $authUser = $request->param('_auth_user');
        $actorId  = (int)($authUser['id'] ?? 0);

        $errors = ValidationHelper::validate($data, [
            'department_id'    => 'required|numeric',
            'intake'           => 'required|string',
            'academic_year_id' => 'required|numeric',
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        try {
            $result = $this->service->bulkSendAdmissionLetters(
                (int)$data['department_id'],
                (string)$data['intake'],
                (int)$data['academic_year_id'],
                $actorId
            );
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 422);
        }

        $this->success($response, $result, "Letters dispatched: {$result['sent']} sent, {$result['total']} total.");
    }
}

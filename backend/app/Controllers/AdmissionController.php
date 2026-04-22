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
use Core\Database;

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

        $allowedAppStatuses = ['documents_verified', 'merit_listed'];
        if (!in_array($application['status'], $allowedAppStatuses, true)) {
            $this->error($response, "An offer can only be made for applications with status 'documents_verified' or 'merit_listed'.", 422);
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

        $this->success($response, [
            'id'                     => $offerId,
            'offer_letter_reference' => $offerRef,
            'application_id'         => $applicationId,
            'expires_at'             => $data['expires_at'],
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
             FROM `merit_lists` ml
             JOIN `student_applications` sa ON sa.id    = ml.application_id
             JOIN `departements`         d  ON d.dep_id = sa.department_id
             WHERE ml.department_id = ? AND ml.intake = ? AND ml.academic_year_id = ?
             AND ml.is_qualified = 1
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
}

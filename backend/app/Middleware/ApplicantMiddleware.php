<?php

declare(strict_types=1);

namespace App\Middleware;

use Core\Request;
use Core\Response;
use App\Models\ApplicantProfileModel;

/**
 * ApplicantMiddleware
 *
 * Must run AFTER AuthMiddleware (which sets _auth_user on the request).
 * 
 * Responsibilities:
 *  1. Assert the authenticated user is an applicant (is_applicant = true in JWT).
 *  2. Load the applicant_profiles record and inject it as _applicant_profile.
 *  3. If the profile doesn't exist yet (race condition), return 404.
 */
class ApplicantMiddleware
{
    private ApplicantProfileModel $profileModel;

    public function __construct()
    {
        $this->profileModel = new ApplicantProfileModel();
    }

    public function handle(Request $request, Response $response): void
    {
        $authUser = $request->param('_auth_user');

        // Guard: ensure caller is an authenticated applicant, not a staff member
        if (!$authUser || !($authUser['is_applicant'] ?? false)) {
            http_response_code(403);
            echo json_encode([
                'success' => false,
                'message' => 'Access denied. This endpoint is for applicants only.',
            ]);
            exit;
        }

        $userId  = (int)($authUser['id'] ?? 0);
        $profile = $this->profileModel->findByUserId($userId);

        if (!$profile) {
            http_response_code(404);
            echo json_encode([
                'success' => false,
                'message' => 'Applicant profile not found. Please contact support.',
            ]);
            exit;
        }

        // Inject for downstream controllers to use
        $request->setRouteParams(['_applicant_profile' => $profile]);
    }
}

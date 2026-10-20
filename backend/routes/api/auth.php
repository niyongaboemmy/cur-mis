<?php

declare(strict_types=1);

use App\Constants\Permissions;
use App\Controllers\AcademicScopeAdminController;
use App\Controllers\AcademicScopeController;
use App\Controllers\AcademicSecretaryController;
use App\Controllers\ModuleAssignmentRequestController;
use App\Controllers\LecturerPlacementController;
use App\Controllers\AuthController;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Middleware\RateLimitMiddleware;

/**
 * Authentication Routes.
 */
$router->post('/api/auth/login',              [AuthController::class, 'login'],              [RateLimitMiddleware::class]);
$router->post('/api/auth/verify-otp',         [AuthController::class, 'verifyOtp'],          [RateLimitMiddleware::class]);
$router->post('/api/auth/resend-otp',         [AuthController::class, 'resendOtp'],          [RateLimitMiddleware::class]);
$router->post('/api/auth/forgot-password',    [AuthController::class, 'forgotPassword'],     [RateLimitMiddleware::class]);
$router->post('/api/auth/verify-reset-otp',   [AuthController::class, 'verifyResetOtp'],     [RateLimitMiddleware::class]);
$router->post('/api/auth/reset-password',     [AuthController::class, 'resetPassword'],      [RateLimitMiddleware::class]);
$router->post('/api/auth/logout',             [AuthController::class, 'logout'],             [AuthMiddleware::class]);
$router->get('/api/auth/me',                  [AuthController::class, 'me'],                 [AuthMiddleware::class]);
$router->post('/api/auth/me',                  [AuthController::class, 'updateMe'],           [AuthMiddleware::class]);
$router->get('/api/academic-scope/me',       [AcademicScopeController::class, 'me'],        [AuthMiddleware::class]);
$router->get('/api/academic-scope/options',  [AcademicScopeController::class, 'options'],   [AuthMiddleware::class]);
$router->post('/api/academic-scope/requests', [AcademicScopeController::class, 'createRequest'], [AuthMiddleware::class]);

// Lecturers: placement (admin anywhere; Dean / HOD inside their scope) and "my students".
// The controller checks who may do what, so these only need a signed-in user.
$router->get('/api/academic-scope/lecturers',                  [LecturerPlacementController::class, 'lecturers'],  [AuthMiddleware::class]);
$router->post('/api/academic-scope/lecturers/:id/placement',   [LecturerPlacementController::class, 'place'],      [AuthMiddleware::class]);
$router->get('/api/academic-scope/my-students',                [LecturerPlacementController::class, 'myStudents'], [AuthMiddleware::class]);
$router->get('/api/academic-scope/lecturers/:id/modules',      [LecturerPlacementController::class, 'modules'],    [AuthMiddleware::class]);
$router->post('/api/academic-scope/lecturers/:id/modules',     [LecturerPlacementController::class, 'setModules'], [AuthMiddleware::class]);

// Lecturers without modules: ask for them. Admin, or the Dean / HOD / secretary of the module's department, approves.
$router->get('/api/module-requests/status',                   [ModuleAssignmentRequestController::class, 'status'],  [AuthMiddleware::class]);
$router->get('/api/module-requests/options',                  [ModuleAssignmentRequestController::class, 'options'], [AuthMiddleware::class]);
$router->post('/api/module-requests',                         [ModuleAssignmentRequestController::class, 'submit'],  [AuthMiddleware::class]);
$router->get('/api/module-requests/pending',                  [ModuleAssignmentRequestController::class, 'pending'], [AuthMiddleware::class]);
$router->post('/api/module-requests/:id/approve',             [ModuleAssignmentRequestController::class, 'approve'], [AuthMiddleware::class]);
$router->post('/api/module-requests/:id/reject',              [ModuleAssignmentRequestController::class, 'reject'],  [AuthMiddleware::class]);

// Academic secretaries: admin anywhere; Dean / HOD inside their own unit.
$router->get('/api/academic-scope/secretaries',                 [AcademicSecretaryController::class, 'list'],   [AuthMiddleware::class]);
$router->post('/api/academic-scope/secretaries',                [AcademicSecretaryController::class, 'assign'], [AuthMiddleware::class]);
$router->post('/api/academic-scope/secretaries/:id/remove',     [AcademicSecretaryController::class, 'remove'], [AuthMiddleware::class]);

// Admin: connect org units to faculties / departments, set Dean / HOD, place staff.
// AuthMiddleware must come first: it sets `_auth_user`, which PermissionMiddleware reads.
// Without it every call returns 401 and the frontend signs the admin out.
$academicScopeAdmin = [AuthMiddleware::class, new PermissionMiddleware(Permissions::MANAGE_USERS)];
$router->get('/api/academic-scope/admin/overview',          [AcademicScopeAdminController::class, 'overview'],   $academicScopeAdmin);
$router->get('/api/academic-scope/admin/units/:id/members', [AcademicScopeAdminController::class, 'members'],    $academicScopeAdmin);
// Writes use POST: the production WAF and the frontend client send PUT as POST.
$router->post('/api/academic-scope/admin/units/:id/link',    [AcademicScopeAdminController::class, 'setLink'],    $academicScopeAdmin);
$router->post('/api/academic-scope/admin/units/:id/head',    [AcademicScopeAdminController::class, 'setHead'],    $academicScopeAdmin);
$router->post('/api/academic-scope/admin/units/:id/members', [AcademicScopeAdminController::class, 'setMembers'], $academicScopeAdmin);
$router->get('/api/academic-scope/admin/requests',           [AcademicScopeAdminController::class, 'listRequests'],   $academicScopeAdmin);
$router->post('/api/academic-scope/admin/requests/:id/approve', [AcademicScopeAdminController::class, 'approveRequest'], $academicScopeAdmin);
$router->post('/api/academic-scope/admin/requests/:id/reject',  [AcademicScopeAdminController::class, 'rejectRequest'],  $academicScopeAdmin);
$router->get('/api/auth/me/photo',            [AuthController::class, 'downloadMyPhoto'],    [AuthMiddleware::class]);
$router->post('/api/auth/me/photo',           [AuthController::class, 'uploadMyPhoto'],      [AuthMiddleware::class]);
$router->delete('/api/auth/me/photo',         [AuthController::class, 'deleteMyPhoto'],      [AuthMiddleware::class]);
$router->post('/api/auth/change-password',    [AuthController::class, 'changePassword'],     [AuthMiddleware::class, RateLimitMiddleware::class]);

// Applicant self-registration — public endpoint, rate-limited
$router->post('/api/auth/applicant/register', [AuthController::class, 'registerApplicant'],  [RateLimitMiddleware::class]);
$router->post('/api/auth/register-applicant-account', [AuthController::class, 'registerApplicantAccount'], [RateLimitMiddleware::class]);

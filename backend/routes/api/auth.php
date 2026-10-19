<?php

declare(strict_types=1);

use App\Constants\Permissions;
use App\Controllers\AcademicScopeAdminController;
use App\Controllers\AcademicScopeController;
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

// Admin: connect org units to faculties / departments, set Dean / HOD, place staff.
$academicScopeAdmin = [new PermissionMiddleware(Permissions::MANAGE_USERS)];
$router->get('/api/academic-scope/admin/overview',          [AcademicScopeAdminController::class, 'overview'],   $academicScopeAdmin);
$router->get('/api/academic-scope/admin/units/:id/members', [AcademicScopeAdminController::class, 'members'],    $academicScopeAdmin);
// Writes use POST: the production WAF and the frontend client send PUT as POST.
$router->post('/api/academic-scope/admin/units/:id/link',    [AcademicScopeAdminController::class, 'setLink'],    $academicScopeAdmin);
$router->post('/api/academic-scope/admin/units/:id/head',    [AcademicScopeAdminController::class, 'setHead'],    $academicScopeAdmin);
$router->post('/api/academic-scope/admin/units/:id/members', [AcademicScopeAdminController::class, 'setMembers'], $academicScopeAdmin);
$router->get('/api/auth/me/photo',            [AuthController::class, 'downloadMyPhoto'],    [AuthMiddleware::class]);
$router->post('/api/auth/me/photo',           [AuthController::class, 'uploadMyPhoto'],      [AuthMiddleware::class]);
$router->delete('/api/auth/me/photo',         [AuthController::class, 'deleteMyPhoto'],      [AuthMiddleware::class]);
$router->post('/api/auth/change-password',    [AuthController::class, 'changePassword'],     [AuthMiddleware::class, RateLimitMiddleware::class]);

// Applicant self-registration — public endpoint, rate-limited
$router->post('/api/auth/applicant/register', [AuthController::class, 'registerApplicant'],  [RateLimitMiddleware::class]);
$router->post('/api/auth/register-applicant-account', [AuthController::class, 'registerApplicantAccount'], [RateLimitMiddleware::class]);

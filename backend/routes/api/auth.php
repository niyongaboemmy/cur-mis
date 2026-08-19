<?php

declare(strict_types=1);

use App\Controllers\AuthController;
use App\Middleware\AuthMiddleware;
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
$router->get('/api/auth/me/photo',            [AuthController::class, 'downloadMyPhoto'],    [AuthMiddleware::class]);
$router->post('/api/auth/me/photo',           [AuthController::class, 'uploadMyPhoto'],      [AuthMiddleware::class]);
$router->delete('/api/auth/me/photo',         [AuthController::class, 'deleteMyPhoto'],      [AuthMiddleware::class]);
$router->post('/api/auth/change-password',    [AuthController::class, 'changePassword'],     [AuthMiddleware::class, RateLimitMiddleware::class]);

// Applicant self-registration — public endpoint, rate-limited
$router->post('/api/auth/applicant/register', [AuthController::class, 'registerApplicant'],  [RateLimitMiddleware::class]);
$router->post('/api/auth/register-applicant-account', [AuthController::class, 'registerApplicantAccount'], [RateLimitMiddleware::class]);

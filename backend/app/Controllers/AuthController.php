<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Services\AuthService;
use App\Helpers\ValidationHelper;

class AuthController extends BaseController
{
    private AuthService $authService;

    public function __construct()
    {
        $this->authService = new AuthService();
    }

    public function login(Request $request, Response $response): never
    {
        $data = array_map(fn($v) => is_string($v) ? trim($v) : $v, $request->body());

        $errors = ValidationHelper::validate($data, [
            'email'    => ['required', 'email'],
            'password' => ['required', 'min:6'],
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        $result = $this->authService->login($data['email'], $data['password']);

        if (!$result['success']) {
            $this->error($response, $result['message'], 401);
        }

        // If OTP is required, return 200 with the specific data and message
        if ($result['otp_required'] ?? false) {
            $this->success($response, $result['data'], $result['message'], 200, ['otp_required' => true]);
        }

        $this->success($response, $result['data'], 'Login successful.');
    }

    public function verifyOtp(Request $request, Response $response): never
    {
        $data = array_map(fn($v) => is_string($v) ? trim($v) : $v, $request->body());

        $errors = ValidationHelper::validate($data, [
            'email' => ['required', 'email'],
            'otp'   => ['required', 'min:6', 'max:6'],
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        $result = $this->authService->verifyOtp($data['email'], $data['otp']);

        if (!$result['success']) {
            $this->error($response, $result['message'], 401);
        }

        $this->success($response, $result['data'], 'Verification successful.');
    }

    public function resendOtp(Request $request, Response $response): never
    {
        $data = array_map(fn($v) => is_string($v) ? trim($v) : $v, $request->body());

        $errors = ValidationHelper::validate($data, [
            'email' => ['required', 'email'],
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        $result = $this->authService->resendOtp($data['email']);

        if (!$result['success']) {
            $this->error($response, $result['message'], 500);
        }

        $this->success($response, null, $result['message']);
    }

    public function register(Request $request, Response $response): never
    {
        $data = $request->body();

        $errors = ValidationHelper::validate($data, [
            'name'     => ['required', 'min:2', 'max:100'],
            'email'    => ['required', 'email'],
            'password' => ['required', 'min:6'],
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        $result = $this->authService->register($data);

        if (!$result['success']) {
            $this->error($response, $result['message'], 409);
        }

        $this->success($response, $result['data'], 'Registration successful.', 201);
    }

    public function forgotPassword(Request $request, Response $response): never
    {
        $data = $request->body();

        $errors = ValidationHelper::validate($data, [
            'email' => ['required', 'email'],
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        $result = $this->authService->forgotPassword($data['email']);

        if (!$result['success']) {
            $this->error($response, $result['message'], 500);
        }

        $this->success($response, $result['data'], $result['message']);
    }

    public function verifyResetOtp(Request $request, Response $response): never
    {
        $data = array_map(fn($v) => is_string($v) ? trim($v) : $v, $request->body());

        $errors = ValidationHelper::validate($data, [
            'email' => ['required', 'email'],
            'otp'   => ['required', 'min:6', 'max:6'],
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        $result = $this->authService->verifyResetOtp($data['email'], $data['otp']);

        if (!$result['success']) {
            $this->error($response, $result['message'], 401);
        }

        $this->success($response, $result['data'], $result['message']);
    }

    public function resetPassword(Request $request, Response $response): never
    {
        $data = array_map(fn($v) => is_string($v) ? trim($v) : $v, $request->body());

        $errors = ValidationHelper::validate($data, [
            'token'    => ['required'],
            'password' => ['required', 'min:6'],
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        $result = $this->authService->resetPassword($data['token'], $data['password']);

        if (!$result['success']) {
            $this->error($response, $result['message'], 400);
        }

        $this->success($response, null, $result['message']);
    }

    public function logout(Request $request, Response $response): never
    {
        $this->success($response, null, 'Logged out successfully.');
    }

    /**
     * POST /api/auth/change-password
     * Authenticated self-service password change. Requires the caller's
     * current password so a leaked JWT alone can't be used to take over the
     * account.
     */
    public function changePassword(Request $request, Response $response): never
    {
        $authUser = $request->param('_auth_user') ?? [];
        $userId   = (int)($authUser['id'] ?? 0);
        if ($userId <= 0) {
            $this->error($response, 'Unauthorized.', 401);
        }

        $data = array_map(fn($v) => is_string($v) ? trim($v) : $v, $request->body());

        $errors = ValidationHelper::validate($data, [
            'current_password' => ['required'],
            'new_password'     => ['required', 'min:8'],
        ]);
        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        $result = $this->authService->changePassword(
            $userId,
            (string)$data['current_password'],
            (string)$data['new_password'],
        );

        if (!$result['success']) {
            $this->error($response, $result['message'], $result['code'] ?? 400);
        }

        $this->success($response, null, $result['message']);
    }

    public function me(Request $request, Response $response): never
    {
        $user = $request->param('_auth_user');
        $this->success($response, $user, 'Authenticated user.');
    }

    /**
     * POST /api/auth/applicant/register
     *
     * Allows a prospective student to claim an account by verifying their
     * application_number + email combination against student_applications.
     * On success, creates a users row (is_applicant = 1), a stub
     * applicant_profiles row, and triggers the OTP flow.
     */
    /**
     * POST /api/auth/register-applicant-account
     */
    public function registerApplicantAccount(Request $request, Response $response): never
    {
        $data = array_map(fn($v) => is_string($v) ? trim($v) : $v, $request->body());

        $errors = ValidationHelper::validate($data, [
            'first_name' => ['required', 'string'],
            'last_name'  => ['required', 'string'],
            'email'      => ['required', 'email'],
            'password'   => ['required', 'min:8'],
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        $result = $this->authService->registerApplicantAccount(
            $data['first_name'],
            $data['last_name'],
            $data['email'],
            $data['password']
        );

        if (!$result['success']) {
            $statusCode = $result['code'] ?? 409;
            $this->error($response, $result['message'], $statusCode);
        }

        $this->success($response, $result['data'], $result['message'], 201);
    }

    public function registerApplicant(Request $request, Response $response): never
    {
        $data = array_map(fn($v) => is_string($v) ? trim($v) : $v, $request->body());

        $errors = ValidationHelper::validate($data, [
            'application_number' => ['required', 'string'],
            'email'              => ['required', 'email'],
            'password'           => ['required', 'min:8'],
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        $result = $this->authService->registerApplicant(
            $data['application_number'],
            $data['email'],
            $data['password']
        );

        if (!$result['success']) {
            $statusCode = $result['code'] ?? 409;
            $this->error($response, $result['message'], $statusCode);
        }

        $this->success($response, $result['data'], $result['message'], 201);
    }
}

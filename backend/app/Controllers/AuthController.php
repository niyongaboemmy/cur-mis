<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Services\AuthService;
use App\Services\SystemLogService;
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
            SystemLogService::log('LOGIN', 'AUTH', "Login initiated for {$data['email']} — OTP sent.", null, 'user', ['email' => $data['email']]);
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

        $user = $result['data']['user'] ?? [];
        SystemLogService::log('LOGIN', 'AUTH', "Successful login: {$data['email']}.", isset($user['id']) ? (int) $user['id'] : null, 'user', null, $user ?: null);
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

        SystemLogService::log('UPDATE', 'AUTH', "OTP resent to {$data['email']}.", null, 'user', ['email' => $data['email']]);
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

        SystemLogService::log('CREATE', 'AUTH', "New staff account registered: {$data['email']}.", null, 'user', ['email' => $data['email']]);
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

        SystemLogService::log('UPDATE', 'AUTH', "Password reset requested for {$data['email']}.", null, 'user', ['email' => $data['email']]);
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

        SystemLogService::log('UPDATE', 'AUTH', "Password reset OTP verified for {$data['email']}.", null, 'user', ['email' => $data['email']]);
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

        SystemLogService::log('UPDATE', 'AUTH', "Password was reset via reset token.", null, 'user', null);
        $this->success($response, null, $result['message']);
    }

    public function logout(Request $request, Response $response): never
    {
        $actor = (array) $request->param('_auth_user');
        SystemLogService::log('LOGOUT', 'AUTH', "User logged out: " . ($actor['email'] ?? 'unknown') . ".", isset($actor['id']) ? (int) $actor['id'] : null, 'user', null, $actor ?: null);
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
        // Hydrate phone (and any other column not in the JWT) so the
        // self-service profile form can show the latest persisted values.
        $userId = (int)($user['id'] ?? 0);
        if ($userId > 0) {
            $row = (new \App\Models\UserModel())->find($userId);
            if ($row) {
                $user['phone']    = $row['phone']    ?? null;
                $user['username'] = $row['username'] ?? ($user['username'] ?? '');
            }
        }
        $this->success($response, $user, 'Authenticated user.');
    }

    /**
     * PUT /api/auth/me
     * Self-service profile update for the authenticated user. Lets a user
     * change their own full_name / email / username / phone without
     * needing MANAGE_USERS. Email and username must remain unique.
     */
    public function updateMe(Request $request, Response $response): never
    {
        $authUser = $request->param('_auth_user') ?? [];
        $userId   = (int)($authUser['id'] ?? 0);
        if ($userId <= 0) {
            $this->error($response, 'Unauthorized.', 401);
        }

        $data = array_map(fn($v) => is_string($v) ? trim($v) : $v, $request->body());

        $errors = ValidationHelper::validate($data, [
            'full_name' => ['required', 'string'],
            'email'     => ['required', 'email'],
            'username'  => ['required', 'string'],
        ]);
        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        $model = new \App\Models\UserModel();
        $current = $model->find($userId);
        if (!$current) {
            $this->error($response, 'User not found.', 404);
        }

        // Uniqueness checks — only when the value actually changed.
        $emailNorm = strtolower((string)$data['email']);
        if ($emailNorm !== strtolower((string)($current['email'] ?? ''))) {
            $existing = $model->findBy('email', $emailNorm);
            if ($existing && (int)$existing['id'] !== $userId) {
                $this->error($response, 'Email is already in use.', 422, ['email' => ['Email is already in use.']]);
            }
        }
        $usernameNorm = (string)$data['username'];
        if ($usernameNorm !== (string)($current['username'] ?? '')) {
            $existing = $model->findBy('username', $usernameNorm);
            if ($existing && (int)$existing['id'] !== $userId) {
                $this->error($response, 'Username is already in use.', 422, ['username' => ['Username is already in use.']]);
            }
        }

        $model->update($userId, [
            'full_name' => (string)$data['full_name'],
            'email'     => $emailNorm,
            'username'  => $usernameNorm,
            'phone'     => isset($data['phone']) ? (string)$data['phone'] : null,
        ]);

        // Return the updated user shape the frontend's auth store expects.
        $fresh = $model->find($userId);
        $payload = [
            'id'        => (int)($fresh['id'] ?? $userId),
            'email'     => $fresh['email']    ?? '',
            'username'  => $fresh['username'] ?? '',
            'full_name' => $fresh['full_name']?? '',
            'phone'     => $fresh['phone']    ?? null,
            'role_id'   => $fresh['role_id']  ?? null,
            'role'      => $authUser['role'] ?? null,
            'role_name' => $authUser['role_name'] ?? null,
            'permissions'  => $authUser['permissions']  ?? [],
            'is_applicant' => $authUser['is_applicant'] ?? false,
        ];
        $this->success($response, $payload, 'Profile updated.');
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

        SystemLogService::log('CREATE', 'AUTH', "Applicant account self-registered: {$data['email']}.", null, 'user', ['email' => $data['email']]);
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

        SystemLogService::log('CREATE', 'AUTH', "Applicant portal account claimed for application {$data['application_number']} by {$data['email']}.", null, 'user', ['email' => $data['email'], 'application_number' => $data['application_number']]);
        $this->success($response, $result['data'], $result['message'], 201);
    }
}

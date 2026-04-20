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
            'password' => ['required', 'min:8'],
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
            'password' => ['required', 'min:8'],
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
            'password' => ['required', 'min:8'],
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        $result = $this->authService->resetPassword($data['token'], $data['password']);

        if (!$result['success']) {
            $this->error($response, $result['message'], 400); // Bad Request for invalid token
        }

        $this->success($response, null, $result['message']);
    }

    public function logout(Request $request, Response $response): never
    {
        $this->success($response, null, 'Logged out successfully.');
    }

    public function me(Request $request, Response $response): never
    {
        $user = $request->param('_auth_user');
        $this->success($response, $user, 'Authenticated user.');
    }
}

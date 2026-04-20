<?php

declare(strict_types=1);

namespace App\Services;

use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use App\Services\MailService;
use App\Models\UserModel;
use App\Helpers\EmailTemplateHelper;

class AuthService
{
    private string $jwtSecret;
    private int    $jwtExpiry;
    private MailService $mailService;

    public function __construct()
    {
        $this->jwtSecret = $_ENV['JWT_SECRET'];
        $this->jwtExpiry = (int)($_ENV['JWT_EXPIRY'] ?? 3600);
        $this->mailService = new MailService();
    }

    public function login(string $email, string $password): array
    {
        $model = new UserModel();
        $user  = $model->findBy('email', $email);

        if (!$user || !password_verify($password, $user['password'])) {
            return ['success' => false, 'message' => 'Invalid credentials.', 'data' => null];
        }

        // Generate 6-digit OTP
        $otp       = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        $expiresAt = date('Y-m-d H:i:s', time() + 600); // 10 minutes

        $model->saveOtp($user['id'], $otp, $expiresAt);

        // Send OTP via modern email template
        $htmlBody = EmailTemplateHelper::otpTemplate($user['full_name'] ?? 'User', $otp, '10 minutes');
        $altBody  = "Your verification code is: $otp. It expires in 10 minutes.";
        
        $emailSent = $this->mailService->send($email, 'Verification Code', $htmlBody, $altBody);

        if (!$emailSent) {
            return [
                'success' => false,
                'message' => 'Failed to send verification code. Please try again later.',
                'data'    => null,
            ];
        }

        return [
            'success'      => true,
            'message'      => 'Verification code sent to your email.',
            'otp_required' => true,
            'data'         => ['email' => $email],
        ];
    }

    public function verifyOtp(string $email, string $otp): array
    {
        $model = new UserModel();
        $user  = $model->findForOtp($email);

        if (!$user || $user['otp_code'] !== $otp || strtotime($user['otp_expires_at']) < time()) {
            return ['success' => false, 'message' => 'Invalid or expired verification code.', 'data' => null];
        }

        // OTP is valid, clear it
        $model->clearOtp($user['id']);

        $userData = $model->find($user['id']);
        $token    = $this->generateToken($user);

        return [
            'success' => true,
            'message' => 'Login successful.',
            'data'    => ['token' => $token, 'user' => $userData],
        ];
    }

    public function resendOtp(string $email): array
    {
        $model = new UserModel();
        $user  = $model->findBy('email', $email);

        if (!$user) {
            return ['success' => false, 'message' => 'User not found.', 'data' => null];
        }

        $otp       = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        $expiresAt = date('Y-m-d H:i:s', time() + 600);

        $model->saveOtp($user['id'], $otp, $expiresAt);

        $htmlBody = EmailTemplateHelper::otpTemplate($user['full_name'] ?? 'User', $otp, '10 minutes');
        $emailSent = $this->mailService->send($email, 'New Verification Code', $htmlBody, $htmlBody);

        if (!$emailSent) {
            return [
                'success' => false,
                'message' => 'Failed to resend verification code.',
                'data'    => null,
            ];
        }

        return ['success' => true, 'message' => 'New verification code sent.', 'data' => null];
    }

    public function register(array $data): array
    {
        $model = new UserModel();

        if ($model->exists('email', $data['email'])) {
            return ['success' => false, 'message' => 'Email already in use.', 'data' => null];
        }

        $id = $model->create([
            'name'     => $data['name'],
            'email'    => $data['email'],
            'password' => password_hash($data['password'], PASSWORD_BCRYPT),
        ]);

        $user = $model->find($id);

        return [
            'success' => true,
            'message' => 'Registration successful.',
            'data'    => $user,
        ];
    }

    public function forgotPassword(string $email): array
    {
        $model = new UserModel();
        $user  = $model->findBy('email', $email);

        if (!$user) {
            // Return success anyway to prevent email enumeration
            return ['success' => true, 'message' => 'If an account exists, a reset code has been sent.', 'data' => null];
        }

        // Use OTP for reset step
        $otp       = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        $expiresAt = date('Y-m-d H:i:s', time() + 600); // 10 minutes

        $model->saveOtp($user['id'], $otp, $expiresAt);

        $htmlBody  = EmailTemplateHelper::otpTemplate($user['full_name'] ?? 'User', $otp, '10 minutes');
        $altBody   = "Your password reset code is: $otp. It expires in 10 minutes.";
        
        $emailSent = $this->mailService->send($email, 'Password Reset Code', $htmlBody, $altBody);

        if (!$emailSent) {
            return [
                'success' => false,
                'message' => 'Failed to send reset code. Please try again later.',
                'data'    => null,
            ];
        }

        return [
            'success' => true,
            'message' => 'A password reset code has been sent to your email.',
            'data'    => ['email' => $email],
        ];
    }

    public function verifyResetOtp(string $email, string $otp): array
    {
        $model = new UserModel();
        $user  = $model->findForOtp($email);

        if (!$user || $user['otp_code'] !== $otp || strtotime($user['otp_expires_at']) < time()) {
            return ['success' => false, 'message' => 'Invalid or expired reset code.', 'data' => null];
        }

        // Logic valid, clear OTP and generate a temporary reset token for the final step
        $model->clearOtp($user['id']);
        
        $token     = bin2hex(random_bytes(32));
        $expiresAt = date('Y-m-d H:i:s', time() + 1800); // 30 minutes to change password

        $model->saveResetToken($user['id'], $token, $expiresAt);

        return [
            'success' => true,
            'message' => 'Code verified. You can now set a new password.',
            'data'    => ['token' => $token],
        ];
    }

    public function resetPassword(string $token, string $newPassword): array
    {
        $model = new UserModel();
        $user  = $model->findByResetToken($token);

        if (!$user || strtotime($user['reset_token_expires_at']) < time()) {
            return ['success' => false, 'message' => 'Invalid or expired reset token.', 'data' => null];
        }

        $model->update($user['id'], [
            'password'               => password_hash($newPassword, PASSWORD_BCRYPT),
            'reset_token'            => null,
            'reset_token_expires_at' => null,
        ]);

        return [
            'success' => true,
            'message' => 'Password reset successfully.',
            'data'    => null,
        ];
    }

    public function generateToken(array $user): string
    {
        $now     = time();
        $payload = [
            'iss'  => $_ENV['APP_URL'] ?? 'localhost',
            'iat'  => $now,
            'exp'  => $now + $this->jwtExpiry,
            'sub'  => $user['id'],
            'user' => [
                'id'         => $user['id'],
                'email'      => $user['email'],
                'username'   => $user['username'] ?? '',
                'full_name'  => $user['full_name'] ?? '',
                'role'       => $user['role'] ?? 'Member',
                'created_at' => $user['created_at'] ?? null,
            ],
        ];

        return JWT::encode($payload, $this->jwtSecret, 'HS256');
    }

    public function decodeToken(string $token): array|false
    {
        try {
            $decoded = JWT::decode($token, new Key($this->jwtSecret, 'HS256'));
            return (array) $decoded;
        } catch (\Exception) {
            return false;
        }
    }
}

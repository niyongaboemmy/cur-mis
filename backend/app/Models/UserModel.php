<?php

declare(strict_types=1);

namespace App\Models;

/**
 * User model.
 *
 * Handles database interactions for the 'users' table.
 */
class UserModel extends BaseModel
{
    protected string $table = 'users';

    protected array $fillable = [
        'username',
        'full_name',
        'email',
        'phone',
        'photo',
        'password',
        'role_id',
        'is_active',
        'is_applicant',
        'reset_token',
        'reset_token_expires_at',
        'otp_code',
        'otp_expires_at',
    ];

    /**
     * Columns to strip from every returned row when using hideFields().
     */
    protected array $hidden = [
        'password',
        'reset_token',
        'reset_token_expires_at',
        'otp_code',
        'otp_expires_at',
    ];

    /**
     * Save a password reset token for a user.
     */
    public function saveResetToken(int|string $userId, string $token, string $expiresAt): bool
    {
        return $this->update($userId, [
            'reset_token'            => $token,
            'reset_token_expires_at' => $expiresAt,
        ]) > 0;
    }

    /**
     * Find a user by their reset token.
     * Returns the raw row including hidden fields.
     */
    public function findByResetToken(string $token): array|false
    {
        return $this->findBy('reset_token', $token);
    }

    /**
     * Clear the reset token for a user (e.g., after successful reset).
     */
    public function clearResetToken(int|string $userId): bool
    {
        return $this->update($userId, [
            'reset_token'            => null,
            'reset_token_expires_at' => null,
        ]) > 0;
    }

    /**
     * Save an OTP for a user.
     */
    public function saveOtp(int|string $userId, string $code, string $expiresAt): bool
    {
        return $this->update($userId, [
            'otp_code'       => $code,
            'otp_expires_at' => $expiresAt,
        ]) > 0;
    }

    /**
     * Find a user by their email for OTP verification.
     * Returns raw row.
     */
    public function findForOtp(string $email): array|false
    {
        return $this->findBy('email', $email);
    }

    /**
     * Clear OTP for a user.
     */
    public function clearOtp(int|string $userId): bool
    {
        return $this->update($userId, [
            'otp_code'       => null,
            'otp_expires_at' => null,
        ]) > 0;
    }
}

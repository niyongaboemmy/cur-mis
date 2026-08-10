<?php

declare(strict_types=1);

namespace App\Services;

use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use App\Services\MailService;
use App\Models\UserModel;
use App\Models\RoleModel;
use App\Models\RolePermissionModel;
use App\Models\StudentApplicationModel;
use App\Models\ApplicantProfileModel;
use App\Helpers\EmailTemplateHelper;

class AuthService
{
    private string $jwtSecret;
    private int    $jwtExpiry;
    private MailService $mailService;

    public function __construct()
    {
        $this->jwtSecret = $_ENV['JWT_SECRET'];
        $this->jwtExpiry = (int)($_ENV['JWT_EXPIRY'] ?? 86400);
        $this->mailService = new MailService();
    }

    public function login(string $email, string $password): array
    {
        $model = new UserModel();
        $user  = $model->findBy('email', $email);

        if (!$user || !password_verify($password, $user['password'])) {
            return ['success' => false, 'message' => 'Invalid credentials.', 'data' => null];
        }

        if (!(int)$user['is_active']) {
            return ['success' => false, 'message' => 'Your account is currently disabled. Please contact the administrator.', 'data' => null];
        }

        // Generate 6-digit OTP
        $otp       = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        $expiresAt = date('Y-m-d H:i:s', time() + 600); // 10 minutes

        $model->saveOtp($user['id'], $otp, $expiresAt);

        // Send OTP via modern email template
        $htmlBody = EmailTemplateHelper::otpTemplate($user['full_name'] ?? 'User', $otp, '10 minutes');
        $altBody  = "Your verification code is: $otp. It expires in 10 minutes.";
        
        $emailSent = $this->mailService->send($email, 'Verification Code', $htmlBody, $altBody);

        // DEV fallback — if SMTP is unreachable but we're running locally with APP_DEBUG=true,
        // log the OTP to the PHP error log so developers can still complete login.
        $debug = filter_var($_ENV['APP_DEBUG'] ?? false, FILTER_VALIDATE_BOOLEAN);

        if (!$emailSent) {
            if ($debug) {
                error_log("[DEV OTP] Login OTP for {$email}: {$otp}");
                return [
                    'success'      => true,
                    'message'      => 'Mailer unavailable — OTP logged to PHP error log (dev mode).',
                    'otp_required' => true,
                    'data'         => ['email' => $email, 'dev_otp' => $otp],
                ];
            }

            return [
                'success' => false,
                'message' => 'Failed to send verification code. Please try again later.',
                'data'    => null,
            ];
        }

        $debug = filter_var($_ENV['APP_DEBUG'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $responseData = ['email' => $email];
        if ($debug) {
            $responseData['dev_otp'] = $otp;
        }

        return [
            'success'      => true,
            'message'      => 'Verification code sent to your email.',
            'otp_required' => true,
            'data'         => $responseData,
        ];
    }

    public function verifyOtp(string $email, string $otp): array
    {
        $model = new UserModel();
        $user  = $model->findForOtp($email);

        if (!$user || $user['otp_code'] !== $otp || strtotime($user['otp_expires_at']) < time()) {
            return ['success' => false, 'message' => 'Invalid or expired verification code.', 'data' => null];
        }

        if (!(int)$user['is_active']) {
            return ['success' => false, 'message' => 'This account is disabled.', 'data' => null];
        }

        // OTP is valid, clear it
        $model->clearOtp($user['id']);

        $userData = $model->find($user['id']);

        $roleModel = new RoleModel();
        $role = $roleModel->find($userData['role_id'] ?? 0);
        $userData['role_name'] = $role ? $role['name'] : 'guest';
        $userData['enforce_campus_scope'] = $role ? (int)($role['enforce_campus_scope'] ?? 0) : 0;

        $rolePermModel = new RolePermissionModel();
        $userData['permissions'] = $rolePermModel->getSlugsForRole((int)($userData['role_id'] ?? 0));
        $userData['assigned_campuses'] = $this->loadAssignedCampuses((int)$userData['id']);

        // Include is_applicant from raw user row
        $userData['is_applicant'] = (bool)(int)($user['is_applicant'] ?? 0);

        $token = $this->generateToken($userData);

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

        if (!(int)$user['is_active']) {
            return ['success' => false, 'message' => 'Your account is disabled.', 'data' => null];
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

        $debug = filter_var($_ENV['APP_DEBUG'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $responseData = ['email' => $email];
        if ($debug) {
            $responseData['dev_otp'] = $otp;
        }

        return ['success' => true, 'message' => 'New verification code sent.', 'data' => $responseData];
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

        $roleModel = new RoleModel();
        $role = $roleModel->find($user['role_id'] ?? 0);
        $user['role_name'] = $role ? $role['name'] : 'guest';
        $user['enforce_campus_scope'] = $role ? (int)($role['enforce_campus_scope'] ?? 0) : 0;

        $rolePermModel = new RolePermissionModel();
        $user['permissions'] = $rolePermModel->getSlugsForRole((int)($user['role_id'] ?? 0));
        $user['assigned_campuses'] = $this->loadAssignedCampuses((int)$user['id']);

        return [
            'success' => true,
            'message' => 'Registration successful.',
            'data'    => $user,
        ];
    }

    /** Lightweight read of the campuses assigned to a user. Returns
     *  [{id,name,code,location}, ...] — empty array when nothing assigned
     *  or when the user_campus_assignments table doesn't exist yet.
     *
     *  Public so AuthController::me() can refresh stale JWT payloads
     *  (users whose tokens pre-date this field still get current data). */
    public function loadAssignedCampuses(int $userId): array
    {
        if ($userId <= 0) return [];
        try {
            return \Core\Database::getInstance()->fetchAll(
                "SELECT c.id, c.name, c.code, c.location
                 FROM `user_campus_assignments` uca
                 JOIN `campuses` c ON c.id = uca.campus_id
                 WHERE uca.user_id = ?
                 ORDER BY c.name ASC",
                [$userId]
            );
        } catch (\Throwable $e) {
            return [];
        }
    }

    /**
     * Applicant self-registration (Before Application)
     */
    public function registerApplicantAccount(string $firstName, string $lastName, string $email, string $password): array
    {
        $userModel = new UserModel();
        $email = strtolower(trim($email));

        // 1. Check no account already registered for this email
        if ($userModel->exists('email', $email)) {
            return [
                'success' => false,
                'code'    => 409,
                'message' => 'An account already exists for this email. Please log in instead.',
                'data'    => null,
            ];
        }

        // 2. Resolve applicant role
        $roleModel = new RoleModel();
        $roleRow   = $roleModel->findBy('name', 'applicant');
        $roleId    = $roleRow ? (int)$roleRow['id'] : null;

        // 3. Create user account
        $fullName = trim($firstName . ' ' . $lastName);
        $userId   = (int)$userModel->create([
            'full_name'    => $fullName,
            'email'        => $email,
            'username'     => strtolower(str_replace(' ', '.', $fullName)) . '.' . rand(100, 999),
            'password'     => password_hash($password, PASSWORD_BCRYPT),
            'role_id'      => $roleId,
            'is_active'    => 1,
            'is_applicant' => 1,
        ]);

        // 4. Create stub applicant_profiles row
        $profileModel = new ApplicantProfileModel();
        $profileModel->create([
            'user_id' => $userId,
        ]);

        // 5. Trigger the OTP flow for email verification
        $otp       = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        $expiresAt = date('Y-m-d H:i:s', time() + 600);
        $userModel->saveOtp($userId, $otp, $expiresAt);

        $htmlBody  = EmailTemplateHelper::otpTemplate($fullName, $otp, '10 minutes');
        $altBody   = "Your verification code is: $otp. It expires in 10 minutes.";
        $emailSent = $this->mailService->send($email, 'Verify Your Account', $htmlBody, $altBody);

        $debug = filter_var($_ENV['APP_DEBUG'] ?? false, FILTER_VALIDATE_BOOLEAN);

        if (!$emailSent) {
            if ($debug) {
                error_log("[DEV OTP] Registration OTP for {$email}: {$otp}");
                return [
                    'success' => true,
                    'message' => 'Account created. OTP logged to error log (dev mode).',
                    'data'    => ['email' => $email, 'dev_otp' => $otp],
                ];
            }
            return [
                'success' => false,
                'code'    => 500,
                'message' => 'Account created but failed to send verification email. Please try logging in.',
                'data'    => null,
            ];
        }

        $responseData = ['email' => $email];
        if ($debug) {
            $responseData['dev_otp'] = $otp;
        }

        return [
            'success' => true,
            'message' => 'Account created. A verification code has been sent to your email.',
            'data'    => $responseData,
        ];
    }

    /**
     * Applicant self-registration.
     *
     * Flow:
     *  1. Validate that application_number + email match a row in student_applications.
     *  2. Ensure no users account already exists for the email.
     *  3. Resolve the "applicant" role ID.
     *  4. Create a users row tagged is_applicant = 1.
     *  5. Create a stub applicant_profiles row.
     *  6. Trigger the OTP flow for email verification.
     */
    public function registerApplicant(string $appNumber, string $email, string $password): array
    {
        $appModel = new StudentApplicationModel();
        $email    = strtolower(trim($email));
        $appNumber = strtoupper(trim($appNumber));

        // 1. Verify application_number + email match
        $application = $appModel->findByApplicationNumber($appNumber);
        if (!$application || strtolower((string)$application['email']) !== $email) {
            return [
                'success' => false,
                'code'    => 422,
                'message' => 'Application number and email do not match. Please check your details.',
                'data'    => null,
            ];
        }

        $userModel = new UserModel();

        // 2. Check no account already registered for this email
        if ($userModel->exists('email', $email)) {
            return [
                'success' => false,
                'code'    => 409,
                'message' => 'An account already exists for this email. Please log in instead.',
                'data'    => null,
            ];
        }

        // 3. Resolve applicant role
        $roleModel = new RoleModel();
        $roleRow   = $roleModel->findBy('name', 'applicant');
        $roleId    = $roleRow ? (int)$roleRow['id'] : null;

        // 4. Create user account
        $fullName = trim($application['first_name'] . ' ' . $application['last_name']);
        $userId   = (int)$userModel->create([
            'full_name'    => $fullName,
            'email'        => $email,
            'username'     => strtolower(str_replace(' ', '.', $fullName)) . '.' . rand(100, 999),
            'password'     => password_hash($password, PASSWORD_BCRYPT),
            'role_id'      => $roleId,
            'is_active'    => 1,
            'is_applicant' => 1,
        ]);

        // 5. Create stub applicant_profiles row
        $profileModel = new ApplicantProfileModel();
        $profileModel->create([
            'user_id'        => $userId,
            'application_id' => (int)$application['id'],
        ]);

        // 6. Trigger the OTP flow for email verification (reuse existing login OTP logic)
        $otp       = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        $expiresAt = date('Y-m-d H:i:s', time() + 600);
        $userModel->saveOtp($userId, $otp, $expiresAt);

        $htmlBody  = EmailTemplateHelper::otpTemplate($fullName, $otp, '10 minutes');
        $altBody   = "Your verification code is: $otp. It expires in 10 minutes.";
        $emailSent = $this->mailService->send($email, 'Verify Your Account', $htmlBody, $altBody);

        $debug = filter_var($_ENV['APP_DEBUG'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $responseData = ['email' => $email];
        
        if (!$emailSent) {
            if ($debug) {
                error_log("[DEV OTP] Application Registration OTP for {$email}: {$otp}");
                $responseData['dev_otp'] = $otp;
                return [
                    'success' => true,
                    'message' => 'Account created. OTP logged (dev mode).',
                    'data'    => $responseData,
                ];
            }
            return [
                'success' => false,
                'code'    => 500,
                'message' => 'Account created but failed to send verification email. Please try logging in.',
                'data'    => null,
            ];
        }

        if ($debug) {
            $responseData['dev_otp'] = $otp;
        }

        return [
            'success' => true,
            'message' => 'Account created. A verification code has been sent to your email.',
            'data'    => $responseData,
        ];
    }

    public function forgotPassword(string $email): array
    {
        $model = new UserModel();
        $user  = $model->findBy('email', $email);

        if (!$user) {
            return ['success' => false, 'message' => 'No account found with this email address.', 'data' => null];
        }

        if (!(int)$user['is_active']) {
            return ['success' => false, 'message' => 'This account is disabled. Password reset is not available.', 'data' => null];
        }

        // Use OTP for reset step
        $otp       = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        $expiresAt = date('Y-m-d H:i:s', time() + 600); // 10 minutes

        $model->saveOtp($user['id'], $otp, $expiresAt);

        $htmlBody  = EmailTemplateHelper::otpTemplate($user['full_name'] ?? 'User', $otp, '10 minutes');
        $altBody   = "Your password reset code is: $otp. It expires in 10 minutes.";

        $emailSent = $this->mailService->send($email, 'Password Reset Code', $htmlBody, $altBody);

        $debug = filter_var($_ENV['APP_DEBUG'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $responseData = ['email' => $email];

        if (!$emailSent) {
            if ($debug) {
                error_log("[DEV OTP] Reset OTP for {$email}: {$otp}");
                $responseData['dev_otp'] = $otp;
                return [
                    'success' => true,
                    'message' => 'OTP logged to error log (dev mode).',
                    'data'    => $responseData,
                ];
            }
            return [
                'success' => false,
                'message' => 'Failed to send reset code. Please try again later.',
                'data'    => null,
            ];
        }

        if ($debug) {
            $responseData['dev_otp'] = $otp;
        }

        return [
            'success' => true,
            'message' => 'A password reset code has been sent to your email.',
            'data'    => $responseData,
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

    /**
     * Authenticated self-service password change. Verifies the current
     * password before persisting the new hash, so a stolen JWT alone can't
     * lock the legitimate owner out of their account.
     */
    public function changePassword(int $userId, string $currentPassword, string $newPassword): array
    {
        $model = new UserModel();
        $user  = $model->find($userId);

        if (!$user) {
            return ['success' => false, 'message' => 'User not found.', 'code' => 404];
        }

        if (!password_verify($currentPassword, $user['password'])) {
            return ['success' => false, 'message' => 'Current password is incorrect.', 'code' => 400];
        }

        if (password_verify($newPassword, $user['password'])) {
            return ['success' => false, 'message' => 'New password must be different from the current one.', 'code' => 400];
        }

        $model->update($userId, [
            'password' => password_hash($newPassword, PASSWORD_BCRYPT),
        ]);

        return ['success' => true, 'message' => 'Password updated successfully.'];
    }

    /**
     * The only blanket permission bypass. Deliberately excludes 'admin' —
     * that role's near-full access comes from its actual role_permissions
     * grants, not a name-string special case (see RBAC_PERMISSIONS_AUDIT.md
     * Finding A: a role renamed to 'admin' must not inherit a bypass).
     */
    public static function isSuperadmin(array $user): bool
    {
        return ($user['role'] ?? $user['role_name'] ?? '') === 'superadmin';
    }

    /**
     * Does this account hold any module assignment?
     *
     * Used to open the teaching workspace to anyone actually teaching, without
     * requiring the `lecturer`/`HOD` role or an explicit ACCESS_TEACHER_PORTAL
     * grant. Resolved through LecturerScope so it agrees exactly with what the
     * /api/teacher/* endpoints will return.
     */
    public static function resolveIsTeaching(int $userId): bool
    {
        if ($userId <= 0) {
            return false;
        }
        try {
            return \App\Helpers\LecturerScope::moduleIds(\Core\Database::getInstance(), $userId) !== [];
        } catch (\Throwable) {
            return false;
        }
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
                'id'                   => $user['id'],
                'email'                => $user['email'],
                'username'             => $user['username'] ?? '',
                'full_name'            => $user['full_name'] ?? '',
                'role'                 => $user['role_name'] ?? 'guest',
                'role_id'              => $user['role_id'] ?? null,
                'permissions'          => $user['permissions'] ?? [],
                'enforce_campus_scope' => (int)($user['enforce_campus_scope'] ?? 0) === 1,
                'assigned_campuses'    => $user['assigned_campuses'] ?? [],
                'is_applicant'         => ($user['role_name'] ?? '') === 'applicant',
                // True when this account is assigned to at least one module.
                // Teaching access follows the ASSIGNMENT, not the role: whoever
                // is put in front of a class needs the teaching workspace, even
                // if their role is registrar/HR/whatever and carries no
                // ACCESS_TEACHER_PORTAL grant.
                'is_teaching'          => self::resolveIsTeaching((int)($user['id'] ?? 0)),
                'created_at'           => $user['created_at'] ?? null,
            ],
        ];

        return JWT::encode($payload, $this->jwtSecret, 'HS256');
    }

    public function decodeToken(string $token): array|false
    {
        try {
            $decoded = JWT::decode($token, new Key($this->jwtSecret, 'HS256'));
            // Recursively convert to array to avoid stdClass vs array errors
            return json_decode(json_encode($decoded), true);
        } catch (\Exception) {
            return false;
        }
    }
}

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
        $this->jwtExpiry = (int)($_ENV['JWT_EXPIRY'] ?? 604800);
        $this->mailService = new MailService();
    }

    public function login(string $email, string $password): array
    {
        $model = new UserModel();
        $user  = $model->findBy('email', $email);

        // A row can carry a NULL/empty password (imported or invite-pending
        // accounts) — password_verify() would fatal on a null hash, so treat
        // those as simply not having a usable credential.
        $hash = $user['password'] ?? null;
        if (!$user || !is_string($hash) || $hash === '' || !password_verify($password, $hash)) {
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

        $debug = filter_var($_ENV['APP_DEBUG'] ?? false, FILTER_VALIDATE_BOOLEAN);

        // DEV fallback — mirrors login(). The OTP above has already replaced the
        // one in `users.otp_code`, so bailing out here would leave the client
        // holding a code the database no longer accepts.
        if (!$emailSent) {
            if ($debug) {
                error_log("[DEV OTP] Resent OTP for {$email}: {$otp}");
                return [
                    'success' => true,
                    'message' => 'Mailer unavailable — OTP logged to PHP error log (dev mode).',
                    'data'    => ['email' => $email, 'dev_otp' => $otp],
                ];
            }

            return [
                'success' => false,
                'message' => 'Failed to resend verification code.',
                'data'    => null,
            ];
        }

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
        // findBy() — not find(). find() runs the row through hideFields(), which
        // strips `password`, so the verify below would receive null and fatal.
        $user  = $model->findBy('id', $userId);

        if (!$user) {
            return ['success' => false, 'message' => 'User not found.', 'code' => 404];
        }

        $hash = $user['password'] ?? null;
        if (!is_string($hash) || $hash === '') {
            return ['success' => false, 'message' => 'This account has no password set. Use the password reset flow instead.', 'code' => 400];
        }

        if (!password_verify($currentPassword, $hash)) {
            return ['success' => false, 'message' => 'Current password is incorrect.', 'code' => 400];
        }

        if (password_verify($newPassword, $hash)) {
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


    /**
     * Re-resolve a token payload's AUTHORISATION fields against the database.
     *
     * The JWT carries `role` and `permissions[]` as claims stamped at OTP
     * login. Every gate in the app — PermissionMiddleware,
     * MaybePermissionMiddleware, TeacherPortalMiddleware, ApplicantMiddleware
     * and the ~15 controllers that read `$authUser['permissions']` inline —
     * used to trust those claims verbatim, which made them a snapshot of the
     * role's grants at the moment the user last typed an OTP.
     *
     * That broke grants in a way that looked like a backend bug: the frontend
     * gates its menus and routes off `GET /api/auth/me`, which has always
     * re-read permissions from the DB, so a newly granted permission lit the
     * feature up in the UI immediately — while the API behind it kept
     * answering 403 from the frozen claim, for the whole JWT_EXPIRY window
     * (a week by default). There is no refresh endpoint; the only cure was to
     * log out and back in through a fresh OTP email.
     *
     * Authorisation is therefore resolved here, per request, from
     * `users → roles → role_permissions`, which is the same source `/me`
     * reads. Grant or revoke a permission and it takes effect on the next
     * request, on both sides of the wire.
     *
     * Identity claims (id, email, names) still come from the signed token —
     * only the fields that decide ACCESS are re-read. Returns null when the
     * account has since been deleted or disabled, so a stale token stops
     * outliving the account it was issued for.
     *
     * @param  array $tokenUser  the `user` object decoded from the JWT
     * @return array|null        the payload with live role/permissions, or null
     */
    public static function hydrateAuthUser(array $tokenUser): ?array
    {
        $userId = (int)($tokenUser['id'] ?? 0);
        if ($userId <= 0) {
            return $tokenUser;
        }

        // A single request can pass through several middleware and helpers
        // that each want the actor; resolve once per request, not per read.
        static $cache = [];
        if (array_key_exists($userId, $cache)) {
            return $cache[$userId];
        }

        try {
            $db  = \Core\Database::getInstance();
            $row = $db->fetchOne(
                'SELECT u.id, u.role_id, u.is_active, r.name AS role_name, r.enforce_campus_scope
                   FROM users u
                   LEFT JOIN roles r ON r.id = u.role_id
                  WHERE u.id = ?
                  LIMIT 1',
                [$userId]
            );

            if (!$row || !(int)($row['is_active'] ?? 0)) {
                return $cache[$userId] = null;
            }

            $roleId = (int)($row['role_id'] ?? 0);
            $slugs  = $roleId > 0
                ? $db->fetchAll(
                    'SELECT p.slug
                       FROM role_permissions rp
                       JOIN permissions p ON p.id = rp.permission_id
                      WHERE rp.role_id = ?',
                    [$roleId]
                  )
                : [];

            $user = $tokenUser;
            $user['role_id']              = $roleId ?: null;
            $user['role']                 = $row['role_name'] ?? 'guest';
            $user['role_name']            = $row['role_name'] ?? 'guest';
            $user['enforce_campus_scope'] = (int)($row['enforce_campus_scope'] ?? 0) === 1;
            $user['permissions']          = array_values(array_column($slugs, 'slug'));
            $user['is_applicant']         = ($row['role_name'] ?? '') === 'applicant';

            return $cache[$userId] = $user;
        } catch (\Throwable $e) {
            // A DB hiccup must not lock the whole API out. Fall back to the
            // signed claims — no worse than the behaviour this replaces.
            error_log('[auth] permission hydration failed for user ' . $userId . ': ' . $e->getMessage());
            return $tokenUser;
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

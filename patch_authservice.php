<?php
$file = 'temp_authservice.php';
$content = file_get_contents($file);

$newMethod = <<<PHP
    /**
     * Applicant self-registration (Before Application)
     */
    public function registerApplicantAccount(string \$firstName, string \$lastName, string \$email, string \$password): array
    {
        \$userModel = new UserModel();
        \$email = strtolower(trim(\$email));

        // 1. Check no account already registered for this email
        if (\$userModel->exists('email', \$email)) {
            return [
                'success' => false,
                'code'    => 409,
                'message' => 'An account already exists for this email. Please log in instead.',
                'data'    => null,
            ];
        }

        // 2. Resolve applicant role
        \$roleModel = new RoleModel();
        \$roleRow   = \$roleModel->findBy('name', 'applicant');
        \$roleId    = \$roleRow ? (int)\$roleRow['id'] : null;

        // 3. Create user account
        \$fullName = trim(\$firstName . ' ' . \$lastName);
        \$userId   = (int)\$userModel->create([
            'full_name'    => \$fullName,
            'email'        => \$email,
            'username'     => strtolower(str_replace(' ', '.', \$fullName)) . '.' . rand(100, 999),
            'password'     => password_hash(\$password, PASSWORD_BCRYPT),
            'role_id'      => \$roleId,
            'is_active'    => 1,
            'is_applicant' => 1,
        ]);

        // 4. Create stub applicant_profiles row
        \$profileModel = new ApplicantProfileModel();
        \$profileModel->create([
            'user_id' => \$userId,
        ]);

        // 5. Generate token to auto-login
        \$userData = \$userModel->find(\$userId);
        \$userData['role_name'] = 'applicant';
        \$userData['permissions'] = [];
        \$userData['is_applicant'] = true;

        \$token = \$this->generateToken(\$userData);

        return [
            'success' => true,
            'message' => 'Account created successfully.',
            'data'    => ['token' => \$token, 'user' => \$userData],
        ];
    }
PHP;

// Insert new method before registerApplicant
$content = str_replace("    /**\n     * Applicant self-registration.", $newMethod . "\n\n    /**\n     * Applicant self-registration.", $content);

file_put_contents($file, $content);

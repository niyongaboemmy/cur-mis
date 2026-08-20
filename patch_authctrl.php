<?php
$file = 'temp_authctrl.php';
$content = file_get_contents($file);

$newMethod = <<<PHP
    /**
     * POST /api/auth/register-applicant-account
     */
    public function registerApplicantAccount(Request \$request, Response \$response): never
    {
        \$data = array_map(fn(\$v) => is_string(\$v) ? trim(\$v) : \$v, \$request->body());

        \$errors = ValidationHelper::validate(\$data, [
            'first_name' => ['required', 'string'],
            'last_name'  => ['required', 'string'],
            'email'      => ['required', 'email'],
            'password'   => ['required', 'min:8'],
        ]);

        if (!empty(\$errors)) {
            \$this->error(\$response, 'Validation failed.', 422, \$errors);
        }

        \$result = \$this->authService->registerApplicantAccount(
            \$data['first_name'],
            \$data['last_name'],
            \$data['email'],
            \$data['password']
        );

        if (!\$result['success']) {
            \$statusCode = \$result['code'] ?? 409;
            \$this->error(\$response, \$result['message'], \$statusCode);
        }

        \$this->success(\$response, \$result['data'], \$result['message'], 201);
    }
PHP;

$content = str_replace("    public function registerApplicant(Request \$request, Response \$response): never", $newMethod . "\n\n    public function registerApplicant(Request \$request, Response \$response): never", $content);

file_put_contents($file, $content);

<?php
$file = 'temp_auth_routes.php';
$content = file_get_contents($file);

$newRoute = "\$router->post('/api/auth/register-applicant-account', [AuthController::class, 'registerApplicantAccount']);\n\$router->post('/api/auth/applicant/register', [AuthController::class, 'registerApplicant']);";

$content = str_replace("\$router->post('/api/auth/applicant/register', [AuthController::class, 'registerApplicant']);", $newRoute, $content);

file_put_contents($file, $content);

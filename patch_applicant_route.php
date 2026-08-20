<?php
$file = 'temp_applicant_route.php';
$content = file_get_contents($file);

$newRoutes = <<<PHP
    // ── Application creation & verification ──────────────────────────────────
    \$router->post('/application/draft',  [ApplicantProfileController::class, 'draftApplication']);
    \$router->post('/application/submit', [ApplicantProfileController::class, 'submitApplication']);
    \$router->post('/application/verify', [ApplicantProfileController::class, 'verifyApplication']);
PHP;

$content = str_replace("    // ── Application status & checklist ────────────────────────────────────────", $newRoutes . "\n\n    // ── Application status & checklist ────────────────────────────────────────", $content);

file_put_contents($file, $content);

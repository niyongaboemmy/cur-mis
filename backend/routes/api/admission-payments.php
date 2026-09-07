<?php

declare(strict_types=1);

/**
 * Admission Payment History API
 *
 * GET /api/admissions/applications/:id/payments?student_id=...
 * Fetch confirmed payment history for staff validation.
 *
 * NOTE: every file in routes/api/ is require()d at bootstrap by routes/api.php,
 * so this file must ONLY register routes. It previously ran its logic at include
 * time and called exit() on a missing ?id — which aborted EVERY API request with
 * {"error":"Application ID and Student ID are required"}.
 */

use Core\Request;
use Core\Response;
use Core\Database;
use App\Middleware\AuthMiddleware;

$router->get('/api/admissions/applications/:id/payments', function (Request $request, Response $response): never {
    $db        = Database::getInstance();
    $appId     = (int) $request->param('id');
    $studentId = trim((string) $request->query('student_id', ''));

    if (!$appId || $studentId === '') {
        $response->error('Application ID and Student ID are required', 400);
    }

    $app = $db->fetchOne(
        "SELECT a.id, a.student_id FROM applications a WHERE a.id = ? LIMIT 1",
        [$appId]
    );

    if (!$app) {
        $response->error('Application not found', 404);
    }

    $payments = $db->fetchAll(
        "SELECT
            id,
            trans_code,
            student,
            amount,
            date,
            payment_chanel,
            payment_notifi,
            status,
            external_transaction_id
         FROM `payment`
         WHERE student COLLATE utf8mb4_unicode_ci = ?
           AND payment_notifi = 'Debit'
           AND status = 1
         ORDER BY date DESC",
        [$studentId]
    );

    $totalPaid = 0.0;
    foreach ($payments as $payment) {
        $totalPaid += (float) $payment['amount'];
    }

    $response->success([
        'student_id'     => $studentId,
        'application_id' => $appId,
        'payments'       => $payments,
        'payment_count'  => count($payments),
        'total_paid'     => $totalPaid,
    ], 'Payment history fetched');
}, [AuthMiddleware::class]);

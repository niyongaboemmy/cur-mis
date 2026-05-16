<?php
header('Content-Type: application/json; charset=utf-8');
echo json_encode([
    'name'      => 'CUR Payment API',
    'version'   => '1.0',
    'timestamp' => date('Y-m-d H:i:s'),
    'status'    => 'running',
    'endpoints' => [
        'POST /api/token.php'              => 'Claim bearer token',
        'POST /api/getstudent.php'         => 'Verify student by regnumber',
        'POST /api/payment.php'            => 'Record bank payment',
        'POST /api/cancel_transaction.php' => 'Reverse a payment',
        'POST /api/update.php'             => 'Update slip / confirm payment',
    ],
]);
<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use Core\Database;
use App\Services\UrubutoPayService;

class UrubutoPayController extends BaseController
{
    private UrubutoPayService $service;
    private Database          $db;

    public function __construct()
    {
        $this->service = new UrubutoPayService();
        $this->db      = Database::getInstance();
    }

    // ── Webhook: Issue token ──────────────────────────────────────────────────

    /**
     * POST /api/payment/webhook/token
     * UrubutoPay calls this to obtain a Bearer token before any other webhook call.
     * No auth required — this IS the auth endpoint.
     */
    public function issueToken(Request $request, Response $response): never
    {
        $body     = $request->body();
        $username = trim((string)($body['user_name'] ?? ''));
        $password = trim((string)($body['password'] ?? ''));

        $result = $this->service->authenticateApiUser($username, $password);
        if (!$result) {
            http_response_code(401);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode([
                'timestamp' => date('Y-m-d\TH:i:s\Z'),
                'status'    => 401,
                'message'   => 'Wrong Authentication',
            ]);
            exit;
        }

        http_response_code(200);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([
            'timestamp' => date('Y-m-d\TH:i:s\Z'),
            'status'    => 200,
            'data'      => ['token' => $result['token']],
        ]);
        exit;
    }

    // ── Webhook: Verify payer ─────────────────────────────────────────────────

    /**
     * POST /api/payment/webhook/verify
     * UrubutoPay calls this when a student dials *775# and enters a reg number.
     * Protected by UrubutoPayWebhookMiddleware.
     */
    public function verifyPayer(Request $request, Response $response): never
    {
        $body         = $request->body();
        $payerCode    = trim((string)($body['payer_code'] ?? ''));
        $merchantCode = trim((string)($body['merchant_code'] ?? ''));

        $payer = $this->service->validatePayer($payerCode, $merchantCode);
        if (!$payer) {
            http_response_code(404);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode([
                'timestamp' => date('Y-m-d\TH:i:s\Z'),
                'status'    => 404,
                'message'   => 'Payer not found',
            ]);
            exit;
        }

        http_response_code(200);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([
            'timestamp' => date('Y-m-d\TH:i:s\Z'),
            'status'    => 200,
            'data'      => $payer,
        ]);
        exit;
    }

    // ── Webhook: Payment callback ─────────────────────────────────────────────

    /**
     * POST /api/payment/webhook/callback
     * UrubutoPay calls this after a payment is confirmed.
     * Protected by UrubutoPayWebhookMiddleware.
     */
    public function paymentCallback(Request $request, Response $response): never
    {
        $cb     = $request->body();
        $result = $this->service->recordMobilePayment($cb);

        if ($result['status'] === 'error') {
            http_response_code(400);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode([
                'timestamp' => date('Y-m-d\TH:i:s\Z'),
                'status'    => 400,
                'message'   => $result['message'],
            ]);
            exit;
        }

        http_response_code(200);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([
            'timestamp' => date('Y-m-d\TH:i:s\Z'),
            'status'    => 200,
            'message'   => $result['message'],
        ]);
        exit;
    }

    // ── Student: Get checkout link ────────────────────────────────────────────

    /**
     * GET /api/payment/checkout-link
     * Returns the UrubutoPay hosted checkout URL and outstanding balance
     * for the authenticated student.
     */
    public function getCheckoutLink(Request $request, Response $response): never
    {
        $user      = $request->input('_auth_user', []);
        $regNumber = $user['regnumber'] ?? $user['username'] ?? '';

        if (!$regNumber) {
            // Try fetching from student table using user_id
            $userId = (int)($user['id'] ?? 0);
            if ($userId) {
                $student = $this->db->fetchOne(
                    'SELECT regnumber FROM student WHERE user_id = ? LIMIT 1',
                    [$userId]
                );
                $regNumber = $student['regnumber'] ?? '';
            }
        }

        if (!$regNumber) {
            http_response_code(404);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['success' => false, 'message' => 'Student record not found.']);
            exit;
        }

        $data = $this->service->generateCheckoutUrl($regNumber);

        http_response_code(200);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data);
        exit;
    }

    // ── Student: Get mobile payment history ───────────────────────────────────

    /**
     * GET /api/payment/history
     * Returns the last 20 confirmed MOBILE_MONEY payments for the authenticated student.
     */
    public function getMobileHistory(Request $request, Response $response): never
    {
        $user      = $request->input('_auth_user', []);
        $regNumber = $user['regnumber'] ?? $user['username'] ?? '';

        if (!$regNumber) {
            $userId = (int)($user['id'] ?? 0);
            if ($userId) {
                $student = $this->db->fetchOne(
                    'SELECT regnumber FROM student WHERE user_id = ? LIMIT 1',
                    [$userId]
                );
                $regNumber = $student['regnumber'] ?? '';
            }
        }

        if (!$regNumber) {
            http_response_code(404);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['success' => false, 'message' => 'Student record not found.']);
            exit;
        }

        $history = $this->service->getMobilePaymentHistory($regNumber, 20);

        http_response_code(200);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($history);
        exit;
    }
}

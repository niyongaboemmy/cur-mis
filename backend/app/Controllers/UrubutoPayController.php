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

        if ($username === '' || $password === '') {
            http_response_code(400);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode([
                'timestamp' => date('Y-m-d\TH:i:s\Z'),
                'status'    => 400,
                'message'   => 'user_name and password are required',
            ]);
            exit;
        }

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

        if ($payerCode === '' || $merchantCode === '') {
            http_response_code(400);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode([
                'timestamp' => date('Y-m-d\TH:i:s\Z'),
                'status'    => 400,
                'message'   => 'payer_code and merchant_code are required',
            ]);
            exit;
        }

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
     * UrubutoPay calls this after a payment completes.
     * Auto-records payment, reconciles invoices, and updates clearance.
     * Protected by UrubutoPayWebhookMiddleware.
     */
    public function paymentCallback(Request $request, Response $response): never
    {
        $body = $request->body();

        if (empty($body)) {
            http_response_code(400);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode([
                'timestamp' => date('Y-m-d\TH:i:s\Z'),
                'status'    => 400,
                'message'   => 'Empty request body',
            ]);
            exit;
        }

        $result = $this->service->recordMobilePayment($body);

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

    // ── Webhook: Payment reversal ─────────────────────────────────────────────

    /**
     * POST /api/payment/webhook/reversal
     * UrubutoPay calls this to reverse a previously completed payment.
     * Marks fee_payments as reversed, rolls back fee_invoices.amount_paid,
     * and recomputes financial clearance for the student.
     * Protected by UrubutoPayWebhookMiddleware.
     */
    public function handleReversal(Request $request, Response $response): never
    {
        $body = $request->body();

        $txCode = trim((string)($body['transaction_code'] ?? $body['transaction_id'] ?? ''));
        if ($txCode === '') {
            http_response_code(400);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode([
                'timestamp' => date('Y-m-d\TH:i:s\Z'),
                'status'    => 400,
                'message'   => 'transaction_code is required',
            ]);
            exit;
        }

        $result = $this->service->reversePayment($body);

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

        if ($result['status'] === 'not_found') {
            http_response_code(404);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode([
                'timestamp' => date('Y-m-d\TH:i:s\Z'),
                'status'    => 404,
                'message'   => $result['message'],
            ]);
            exit;
        }

        http_response_code(200);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([
            'timestamp'       => date('Y-m-d\TH:i:s\Z'),
            'status'          => 200,
            'message'         => $result['message'],
            'data'            => [
                'transaction_code' => $txCode,
                'amount_reversed'  => $result['amount_reversed'],
            ],
        ]);
        exit;
    }

    // ── Student portal: Checkout link ─────────────────────────────────────────

    /**
     * GET /api/payment/checkout-link
     * Student portal calls this to get the UrubutoPay hosted checkout URL.
     * Protected by AuthMiddleware (student JWT).
     */
    public function getCheckoutLink(Request $request, Response $response): never
    {
        $regNumber = $this->authStudentRegnumber($request);
        if (!$regNumber) {
            $this->error($response, 'Student profile not found.', 403);
        }

        $data = $this->service->generateCheckoutUrl($regNumber);
        $this->success($response, $data, 'Checkout link generated.');
    }

    // ── Student portal: Mobile payment history ────────────────────────────────

    /**
     * GET /api/payment/history
     * Returns recent MOBILE_MONEY payments for the authenticated student.
     * Protected by AuthMiddleware (student JWT).
     */
    public function getMobileHistory(Request $request, Response $response): never
    {
        $regNumber = $this->authStudentRegnumber($request);
        if (!$regNumber) {
            $this->error($response, 'Student profile not found.', 403);
        }

        $history = $this->service->getMobilePaymentHistory($regNumber, 20);
        $this->success($response, $history);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private function authStudentRegnumber(Request $request): ?string
    {
        $user = (array)($request->param('_auth_user') ?? []);
        if (!empty($user['regnumber'])) {
            return (string)$user['regnumber'];
        }

        $username = trim((string)($user['username'] ?? ''));
        if ($username !== '') {
            $row = $this->db->fetchOne(
                'SELECT regnumber FROM student WHERE regnumber = ? LIMIT 1',
                [$username]
            );
            if ($row && !empty($row['regnumber'])) {
                return (string)$row['regnumber'];
            }
        }

        $email = trim((string)($user['email'] ?? ''));
        if ($email !== '') {
            $row = $this->db->fetchOne(
                'SELECT regnumber FROM student WHERE email = ? LIMIT 1',
                [$email]
            );
            if ($row && !empty($row['regnumber'])) {
                return (string)$row['regnumber'];
            }
        }

        return null;
    }
}

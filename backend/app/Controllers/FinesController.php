<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Models\FineModel;
use App\Models\OverdueAlertModel;
use App\Models\FeeInvoiceModel;
use App\Services\SystemLogService;
use App\Services\MailService;
use App\Helpers\ValidationHelper;
use Core\Database;

class FinesController extends BaseController
{
    private FineModel         $fineModel;
    private OverdueAlertModel $alertModel;
    private FeeInvoiceModel   $invoiceModel;
    private Database          $db;

    public function __construct()
    {
        $this->fineModel    = new FineModel();
        $this->alertModel   = new OverdueAlertModel();
        $this->invoiceModel = new FeeInvoiceModel();
        $this->db           = Database::getInstance();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Fines — CRUD
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * GET /api/fines
     */
    public function listFines(Request $request, Response $response): never
    {
        $page    = max(1, (int)($request->query('page') ?? 1));
        $perPage = min(100, max(10, (int)($request->query('per_page') ?? 50)));

        $filters = array_filter([
            'student_id' => $request->query('student_id') ?? '',
            'status'     => $request->query('status')     ?? '',
            'fine_type'  => $request->query('fine_type')  ?? '',
            'search'     => $request->query('search')     ?? '',
        ]);

        $result  = $this->fineModel->listWithDetails($filters, $page, $perPage);
        $summary = $this->fineModel->getSummary();

        $this->success($response, array_merge($result, ['summary' => $summary]));
    }

    /**
     * POST /api/fines
     * Issue a new fine and auto-create a FINE invoice.
     */
    public function createFine(Request $request, Response $response): never
    {
        $actor = (array)($request->param('_auth_user') ?? []);
        $data  = (array)($request->body() ?? []);

        $errors = ValidationHelper::validate($data, [
            'student_id' => 'required|string|max:30',
            'fine_type'  => 'required|string',
            'reason'     => 'required|string|max:500',
            'amount'     => 'required|numeric',
        ]);
        if ($errors) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        $amount = (float)$data['amount'];
        if ($amount <= 0) {
            $this->error($response, 'Amount must be greater than zero.', 422);
        }

        $validTypes = ['LATE_SUBMISSION', 'LOST_ID_CARD', 'LIBRARY_FINE', 'LATE_REGISTRATION', 'ACADEMIC_DOCUMENT', 'OTHER'];
        if (!in_array($data['fine_type'], $validTypes, true)) {
            $this->error($response, 'Invalid fine type.', 422);
        }

        $student = $this->db->fetchOne(
            "SELECT regnumber, fname, lname, email FROM `student` WHERE regnumber = ? LIMIT 1",
            [$data['student_id']]
        );
        if (!$student) {
            $this->error($response, 'Student not found.', 404);
        }

        // Create FINE invoice automatically
        $invoiceNumber = 'FINE-' . strtoupper(substr(md5(uniqid()), 0, 8));
        // Must be the year flagged is_current, not the highest id. Rows like the
        // catch-all "Legacy" year sort last by id, so `ORDER BY id DESC` filed
        // every fine invoice under a year the student's My Finance page never
        // queries — the fine raised their balance but was invisible and unpayable.
        $currentYear = $this->db->fetchOne(
            "SELECT id FROM `academic_years` WHERE is_current = 1 ORDER BY id DESC LIMIT 1"
        ) ?: $this->db->fetchOne(
            "SELECT id FROM `academic_years` ORDER BY start_date DESC LIMIT 1"
        );
        $academicYearId = $currentYear ? (int)$currentYear['id'] : null;

        $invoiceId = $this->db->execute(
            "INSERT INTO `fee_invoices`
               (invoice_number, student_id, academic_year_id, fee_type, description,
                amount_due, amount_paid, bursary_applied, status, is_system_generated, created_by, created_at)
             VALUES (?, ?, ?, 'FINE', ?, ?, 0, 0, 'unpaid', 0, ?, NOW())",
            [
                $invoiceNumber,
                $data['student_id'],
                $academicYearId,
                trim($data['reason']),
                $amount,
                $actor['id'] ?? null,
            ]
        );

        $fineId = $this->fineModel->create([
            'student_id' => $data['student_id'],
            'fine_type'  => $data['fine_type'],
            'reason'     => trim($data['reason']),
            'amount'     => $amount,
            'status'     => 'invoiced',
            'invoice_id' => (int)$invoiceId,
            'notes'      => trim((string)($data['notes'] ?? '')),
            'issued_by'  => $actor['id'] ?? null,
        ]);

        SystemLogService::log(
            'CREATE', 'FINANCE',
            "Fine issued to {$student['fname']} {$student['lname']} ({$data['student_id']}): {$data['fine_type']} — {$amount}",
            (int)$fineId, 'fee_fine',
            ['invoice_number' => $invoiceNumber],
            $actor
        );

        $this->success($response, ['id' => $fineId, 'invoice_id' => $invoiceId, 'invoice_number' => $invoiceNumber], 'Fine issued successfully.', 201);
    }

    /**
     * PUT /api/fines/:id
     */
    public function updateFine(Request $request, Response $response): never
    {
        $actor  = (array)($request->param('_auth_user') ?? []);
        $id     = (int)$request->param('id');
        $data   = (array)($request->body() ?? []);

        $fine = $this->fineModel->find($id);
        if (!$fine) {
            $this->error($response, 'Fine not found.', 404);
        }
        if (!in_array($fine['status'], ['pending', 'invoiced'], true)) {
            $this->error($response, 'Only pending or invoiced fines can be updated.', 422);
        }

        $updates = [];
        if (isset($data['reason']))   $updates['reason']    = trim((string)$data['reason']);
        if (isset($data['notes']))    $updates['notes']     = trim((string)$data['notes']);
        if (isset($data['fine_type'])) {
            $validTypes = ['LATE_SUBMISSION', 'LOST_ID_CARD', 'LIBRARY_FINE', 'LATE_REGISTRATION', 'ACADEMIC_DOCUMENT', 'OTHER'];
            if (in_array($data['fine_type'], $validTypes, true)) {
                $updates['fine_type'] = $data['fine_type'];
            }
        }
        if (isset($data['amount']) && $fine['status'] === 'pending') {
            $amount = (float)$data['amount'];
            if ($amount > 0) {
                $updates['amount'] = $amount;
            }
        }

        if ($updates) {
            $this->fineModel->update($id, $updates);
        }

        SystemLogService::log('UPDATE', 'FINANCE', "Fine #{$id} updated.", $id, 'fee_fine', $updates, $actor);

        $this->success($response, null, 'Fine updated.');
    }

    /**
     * DELETE /api/fines/:id
     */
    public function deleteFine(Request $request, Response $response): never
    {
        $actor = (array)($request->param('_auth_user') ?? []);
        $id    = (int)$request->param('id');

        $fine = $this->fineModel->find($id);
        if (!$fine) {
            $this->error($response, 'Fine not found.', 404);
        }
        if ($fine['status'] !== 'pending') {
            $this->error($response, 'Only pending fines can be deleted.', 422);
        }

        $this->fineModel->delete($id);

        SystemLogService::log('DELETE', 'FINANCE', "Fine #{$id} deleted.", $id, 'fee_fine', null, $actor);

        $this->success($response, null, 'Fine deleted.');
    }

    /**
     * PATCH /api/fines/:id/waive
     */
    public function waiveFine(Request $request, Response $response): never
    {
        $actor = (array)($request->param('_auth_user') ?? []);
        $id    = (int)$request->param('id');
        $data  = (array)($request->body() ?? []);

        $fine = $this->fineModel->find($id);
        if (!$fine) {
            $this->error($response, 'Fine not found.', 404);
        }
        if (in_array($fine['status'], ['waived', 'paid'], true)) {
            $this->error($response, 'Fine is already waived or paid.', 422);
        }

        $this->fineModel->update($id, [
            'status'    => 'waived',
            'waived_by' => $actor['id'] ?? null,
            'waived_at' => date('Y-m-d H:i:s'),
            'notes'     => trim((string)($data['reason'] ?? $fine['notes'] ?? '')),
        ]);

        // If there's a linked invoice, mark it waived too
        if ($fine['invoice_id']) {
            $this->db->execute(
                "UPDATE `fee_invoices` SET status = 'waived', updated_at = NOW() WHERE id = ?",
                [$fine['invoice_id']]
            );
        }

        SystemLogService::log('UPDATE', 'FINANCE', "Fine #{$id} waived.", $id, 'fee_fine', ['reason' => $data['reason'] ?? null], $actor);

        $this->success($response, null, 'Fine waived successfully.');
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Overdue Alerts
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * GET /api/fines/alerts
     */
    public function listAlerts(Request $request, Response $response): never
    {
        $page    = max(1, (int)($request->query('page') ?? 1));
        $perPage = min(100, max(10, (int)($request->query('per_page') ?? 50)));

        $filters = array_filter([
            'student_id'  => $request->query('student_id')  ?? '',
            'alert_level' => $request->query('alert_level') ?? '',
            'date_from'   => $request->query('date_from')   ?? '',
            'date_to'     => $request->query('date_to')     ?? '',
        ]);

        $result = $this->alertModel->listWithDetails($filters, $page, $perPage);
        $this->success($response, $result);
    }

    /**
     * GET /api/fines/alerts/overdue
     * List all currently overdue invoices (for dashboard + batch alert preparation).
     */
    public function getOverdueInvoices(Request $request, Response $response): never
    {
        $limit = min(500, max(10, (int)($request->query('limit') ?? 200)));

        $rows = $this->db->fetchAll(
            "SELECT fi.id, fi.invoice_number, fi.student_id, fi.fee_type,
                    fi.description, fi.amount_due, fi.amount_paid, fi.bursary_applied,
                    (fi.amount_due - fi.amount_paid - fi.bursary_applied) AS balance,
                    fi.due_date, fi.status, fi.academic_year_id,
                    CONCAT(s.fname, ' ', s.lname) AS student_name,
                    s.email AS student_email,
                    ay.label AS academic_year_label,
                    DATEDIFF(CURDATE(), fi.due_date) AS days_overdue,
                    (SELECT COUNT(*) FROM `fee_overdue_alerts` oa WHERE oa.invoice_id = fi.id) AS alert_count,
                    (SELECT MAX(oa.sent_at) FROM `fee_overdue_alerts` oa WHERE oa.invoice_id = fi.id) AS last_alert_at
             FROM `fee_invoices` fi
             LEFT JOIN `student` s       ON s.regnumber COLLATE utf8mb4_unicode_ci = fi.student_id COLLATE utf8mb4_unicode_ci
             LEFT JOIN `academic_years` ay ON ay.id = fi.academic_year_id
             WHERE fi.due_date < CURDATE()
               AND fi.status IN ('unpaid', 'partial')
               AND fi.fee_type != 'BURSARY_CREDIT'
             ORDER BY days_overdue DESC
             LIMIT ?",
            [$limit]
        );

        $stats = $this->db->fetchOne(
            "SELECT COUNT(*) AS total_overdue,
                    SUM(amount_due - amount_paid - bursary_applied) AS total_balance,
                    SUM(CASE WHEN DATEDIFF(CURDATE(), due_date) <= 7   THEN 1 ELSE 0 END) AS due_0_7d,
                    SUM(CASE WHEN DATEDIFF(CURDATE(), due_date) BETWEEN 8 AND 30 THEN 1 ELSE 0 END) AS due_8_30d,
                    SUM(CASE WHEN DATEDIFF(CURDATE(), due_date) > 30   THEN 1 ELSE 0 END) AS due_30d_plus
             FROM `fee_invoices`
             WHERE due_date < CURDATE()
               AND status IN ('unpaid', 'partial')
               AND fee_type != 'BURSARY_CREDIT'"
        );

        $this->success($response, ['invoices' => $rows, 'stats' => $stats]);
    }

    /**
     * POST /api/fines/alerts/send
     * Batch send overdue alerts to students with overdue invoices.
     * Respects a 24-hour cooldown per invoice per alert_level.
     */
    public function sendOverdueAlerts(Request $request, Response $response): never
    {
        $actor = (array)($request->param('_auth_user') ?? []);
        $data  = (array)($request->body() ?? []);

        $alertLevel  = in_array($data['alert_level'] ?? '', ['reminder', 'warning', 'final'], true)
            ? $data['alert_level']
            : 'reminder';
        $channel     = in_array($data['channel'] ?? '', ['email', 'system', 'both'], true)
            ? $data['channel']
            : 'both';
        $invoiceIds  = !empty($data['invoice_ids']) && is_array($data['invoice_ids'])
            ? array_map('intval', $data['invoice_ids'])
            : [];

        // Load overdue invoices (targeted or all)
        if ($invoiceIds) {
            $placeholders = implode(',', array_fill(0, count($invoiceIds), '?'));
            $invoices = $this->db->fetchAll(
                "SELECT fi.id, fi.invoice_number, fi.student_id, fi.fee_type,
                        fi.description, fi.amount_due, fi.amount_paid, fi.bursary_applied,
                        fi.due_date,
                        CONCAT(s.fname, ' ', s.lname) AS student_name,
                        s.email AS student_email
                 FROM `fee_invoices` fi
                 LEFT JOIN `student` s ON s.regnumber COLLATE utf8mb4_unicode_ci = fi.student_id COLLATE utf8mb4_unicode_ci
                 WHERE fi.id IN ({$placeholders})
                   AND fi.status IN ('unpaid', 'partial')
                   AND fi.due_date < CURDATE()",
                $invoiceIds
            );
        } else {
            $invoices = $this->db->fetchAll(
                "SELECT fi.id, fi.invoice_number, fi.student_id, fi.fee_type,
                        fi.description, fi.amount_due, fi.amount_paid, fi.bursary_applied,
                        fi.due_date,
                        CONCAT(s.fname, ' ', s.lname) AS student_name,
                        s.email AS student_email
                 FROM `fee_invoices` fi
                 LEFT JOIN `student` s ON s.regnumber COLLATE utf8mb4_unicode_ci = fi.student_id COLLATE utf8mb4_unicode_ci
                 WHERE fi.status IN ('unpaid', 'partial')
                   AND fi.due_date < CURDATE()
                   AND fi.fee_type != 'BURSARY_CREDIT'
                 ORDER BY fi.due_date ASC
                 LIMIT 300"
            );
        }

        $sent       = 0;
        $skipped    = 0;
        $emailsSent = 0;

        $mailer         = in_array($channel, ['email', 'both'], true) ? new MailService() : null;
        $actorUserId    = isset($actor['id']) ? (int)$actor['id'] : null;
        $institutionName = $_ENV['INSTITUTION_NAME'] ?? 'Catholic University of Rwanda';

        foreach ($invoices as $invoice) {
            // Skip if alert already sent within 24h
            if ($this->alertModel->wasRecentlySent((int)$invoice['id'], $alertLevel, 24)) {
                $skipped++;
                continue;
            }

            $balance    = (float)$invoice['amount_due'] - (float)$invoice['amount_paid'] - (float)$invoice['bursary_applied'];
            $daysLate   = (int)floor((time() - strtotime($invoice['due_date'])) / 86400);
            $emailSent  = false;

            // Send email
            if ($mailer && !empty($invoice['student_email'])) {
                $subject = $this->buildAlertSubject($alertLevel, $institutionName);
                $body    = $this->buildAlertEmailBody(
                    $alertLevel,
                    $invoice['student_name'],
                    $invoice['invoice_number'],
                    $balance,
                    $invoice['due_date'],
                    $daysLate,
                    $institutionName
                );
                $emailSent = $mailer->send($invoice['student_email'], $subject, $body);
                if ($emailSent) $emailsSent++;
            }

            // Push system notification (look up user by student email/regnumber)
            if (in_array($channel, ['system', 'both'], true)) {
                $user = $this->db->fetchOne(
                    "SELECT id FROM `users` WHERE email = ? LIMIT 1",
                    [$invoice['student_email'] ?? '']
                );
                if ($user) {
                    $this->db->execute(
                        "INSERT INTO `notifications` (user_id, type, message, link, is_read, created_at)
                         VALUES (?, 'FEE_OVERDUE', ?, '/my-finance', 0, NOW())",
                        [
                            (int)$user['id'],
                            "Fee overdue: Invoice {$invoice['invoice_number']} — balance " . number_format($balance, 0) . " RWF",
                        ]
                    );
                }
            }

            // Record alert
            $this->alertModel->create([
                'invoice_id'  => (int)$invoice['id'],
                'student_id'  => $invoice['student_id'],
                'alert_level' => $alertLevel,
                'channel'     => $channel,
                'sent_at'     => date('Y-m-d H:i:s'),
                'sent_by'     => $actorUserId,
                'email_sent'  => $emailSent ? 1 : 0,
            ]);

            $sent++;
        }

        SystemLogService::log(
            'CREATE', 'FINANCE',
            "Overdue alerts sent: {$sent} alerts dispatched ({$emailsSent} emails), {$skipped} skipped (cooldown).",
            null, 'fee_overdue_alert',
            ['level' => $alertLevel, 'channel' => $channel, 'sent' => $sent, 'skipped' => $skipped],
            $actor
        );

        $this->success($response, [
            'sent'        => $sent,
            'skipped'     => $skipped,
            'emails_sent' => $emailsSent,
            'alert_level' => $alertLevel,
            'channel'     => $channel,
        ], "{$sent} alert(s) dispatched, {$skipped} skipped.");
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Email template helpers
    // ──────────────────────────────────────────────────────────────────────────

    private function buildAlertSubject(string $level, string $institution): string
    {
        return match ($level) {
            'warning' => "[{$institution}] Fee Payment Warning — Overdue Balance",
            'final'   => "[{$institution}] FINAL NOTICE — Fee Balance Due",
            default   => "[{$institution}] Fee Payment Reminder",
        };
    }

    private function buildAlertEmailBody(
        string $level,
        string $studentName,
        string $invoiceNumber,
        float  $balance,
        string $dueDate,
        int    $daysLate,
        string $institution
    ): string {
        $levelLabel = match ($level) {
            'warning' => 'Payment Warning',
            'final'   => 'FINAL NOTICE',
            default   => 'Payment Reminder',
        };
        $color = match ($level) {
            'warning' => '#d97706',
            'final'   => '#dc2626',
            default   => '#2563eb',
        };
        $formatted = number_format($balance, 0) . ' RWF';

        return <<<HTML
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><title>Fee {$levelLabel}</title></head>
        <body style="font-family:Arial,sans-serif;background:#f5f5f5;padding:20px;">
          <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1)">
            <div style="background:{$color};padding:24px 32px;">
              <h1 style="color:#fff;margin:0;font-size:20px;">{$institution}</h1>
              <p style="color:rgba(255,255,255,.85);margin:4px 0 0;font-size:13px;">Finance Office — {$levelLabel}</p>
            </div>
            <div style="padding:32px;">
              <p style="font-size:15px;color:#1f2937;">Dear <strong>{$studentName}</strong>,</p>
              <p style="color:#374151;line-height:1.6;">
                This is a <strong>{$levelLabel}</strong> regarding an outstanding fee balance on your account.
              </p>
              <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px;">
                <tr style="background:#f9fafb;">
                  <td style="padding:10px 14px;border:1px solid #e5e7eb;color:#6b7280;font-weight:600;">Invoice</td>
                  <td style="padding:10px 14px;border:1px solid #e5e7eb;color:#111827;">{$invoiceNumber}</td>
                </tr>
                <tr>
                  <td style="padding:10px 14px;border:1px solid #e5e7eb;color:#6b7280;font-weight:600;">Outstanding Balance</td>
                  <td style="padding:10px 14px;border:1px solid #e5e7eb;color:{$color};font-weight:700;font-size:16px;">{$formatted}</td>
                </tr>
                <tr style="background:#f9fafb;">
                  <td style="padding:10px 14px;border:1px solid #e5e7eb;color:#6b7280;font-weight:600;">Due Date</td>
                  <td style="padding:10px 14px;border:1px solid #e5e7eb;color:#111827;">{$dueDate} <span style="color:{$color};font-weight:600;">({$daysLate} days overdue)</span></td>
                </tr>
              </table>
              <p style="color:#374151;line-height:1.6;">
                Please log in to the student portal to clear this balance or contact the Finance Office immediately.
              </p>
              <p style="color:#6b7280;font-size:12px;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px;">
                This is an automated message from {$institution} Finance System. Do not reply to this email.
              </p>
            </div>
          </div>
        </body>
        </html>
        HTML;
    }
}

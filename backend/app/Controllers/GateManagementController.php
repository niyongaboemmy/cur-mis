<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Models\GateLogModel;
use App\Services\ClearanceService;
use App\Services\SystemLogService;
use App\Helpers\ValidationHelper;
use Core\Database;

/**
 * GateManagementController
 *
 * Provides fast student verification (payment clearance + registration status)
 * for gate officers, plus audit log management.
 */
class GateManagementController extends BaseController
{
    private GateLogModel     $logModel;
    private ClearanceService $clearanceService;
    private Database         $db;

    public function __construct()
    {
        $this->logModel         = new GateLogModel();
        $this->clearanceService = new ClearanceService();
        $this->db               = Database::getInstance();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Verification — core gate operation
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * POST /api/gate/verify
     *
     * Accepts: { query, scan_type, gate, log_entry }
     *   query     — registration number, barcode, or name fragment
     *   scan_type — 'student_id' | 'receipt' | 'registration' (default: 'student_id')
     *   gate      — gate label (default: 'Main Gate')
     *   log_entry — true to write a gate_log row (default: true)
     *
     * Returns the student profile + payment clearance + registration status
     * and (if log_entry) the ID of the newly created log row.
     */
    public function verify(Request $request, Response $response): never
    {
        $actor = (array)($request->param('_auth_user') ?? []);
        $data  = (array)($request->body() ?? []);

        $query    = trim((string)($data['query'] ?? ''));
        $scanType = in_array($data['scan_type'] ?? '', ['student_id', 'receipt', 'registration'], true)
            ? $data['scan_type']
            : 'student_id';
        $gate     = trim((string)($data['gate'] ?? 'Main Gate')) ?: 'Main Gate';
        $logEntry = ($data['log_entry'] ?? true) !== false;

        if (!$query) {
            $this->error($response, 'Search query is required.', 422);
        }

        // ── Student lookup ────────────────────────────────────────────────────
        $student = $this->db->fetchOne(
            "SELECT s.regnumber, s.fname, s.lname, s.email, s.phone,
                    s.photo_url, s.status AS student_status,
                    o.name   AS program_name,
                    l.name   AS level_name,
                    ay.label AS academic_year_label, ay.id AS academic_year_id,
                    t.id     AS term_id, t.name AS term_name
             FROM `student` s
             LEFT JOIN `options`        o  ON o.id = s.option_id
             LEFT JOIN `levels`         l  ON l.id = s.level_id
             LEFT JOIN `academic_years` ay ON ay.is_active = 1
             LEFT JOIN `academic_terms` t  ON t.academic_year_id = ay.id AND t.is_current = 1
             WHERE s.regnumber = ?
                OR s.regnumber LIKE ?
                OR CONCAT(s.fname, ' ', s.lname) LIKE ?
             LIMIT 1",
            [$query, "%{$query}%", "%{$query}%"]
        );

        if (!$student) {
            // Log denied if logging enabled
            if ($logEntry) {
                $this->logModel->create([
                    'student_id'  => null,
                    'scan_type'   => $scanType,
                    'barcode'     => strlen($query) <= 80 ? $query : null,
                    'gate'        => $gate,
                    'result'      => 'denied',
                    'reason'      => 'Student not found',
                    'verified_by' => $actor['id'] ?? null,
                ]);
            }
            $this->error($response, 'Student not found.', 404, ['query' => $query]);
        }

        $regNumber      = $student['regnumber'];
        $academicYearId = (int)($student['academic_year_id'] ?? 0);
        $termId         = isset($student['term_id']) ? (int)$student['term_id'] : null;

        // ── Payment clearance ─────────────────────────────────────────────────
        $clearance = ['status' => 'unknown', 'balance' => 0.0, 'threshold' => 0, 'record' => null];
        if ($academicYearId) {
            try {
                $clearance = $this->clearanceService->getStatus($regNumber, $academicYearId, $termId);
            } catch (\Throwable $e) {
                // Non-fatal — return unknown clearance rather than crashing
            }
        }

        $paymentCleared = $clearance['status'] === 'cleared';

        // ── Registration status ───────────────────────────────────────────────
        $registration = null;
        if ($academicYearId) {
            $registration = $this->db->fetchOne(
                "SELECT mr.id, mr.status, mr.registered_at,
                        COUNT(mr2.id) AS modules_registered
                 FROM `module_registrations` mr
                 LEFT JOIN `module_registrations` mr2
                       ON mr2.student_id = mr.student_id
                      AND mr2.academic_year_id = mr.academic_year_id
                      AND mr2.status IN ('registered', 'confirmed')
                 WHERE mr.student_id        = ?
                   AND mr.academic_year_id  = ?
                   AND mr.status IN ('registered', 'confirmed')
                 GROUP BY mr.id
                 ORDER BY mr.registered_at DESC
                 LIMIT 1",
                [$regNumber, $academicYearId]
            );
        }

        $isRegistered = !empty($registration);

        // ── Build overall access result ───────────────────────────────────────
        $accessResult = match ($scanType) {
            'receipt'      => $paymentCleared   ? 'granted' : 'denied',
            'registration' => $isRegistered     ? 'granted' : 'denied',
            default        => ($paymentCleared || $isRegistered) ? 'granted' : 'denied',
        };

        $denyReason = null;
        if ($accessResult === 'denied') {
            if (!$paymentCleared && !$isRegistered) {
                $denyReason = 'Outstanding fees and not registered for current year';
            } elseif (!$paymentCleared) {
                $denyReason = 'Outstanding fee balance';
            } else {
                $denyReason = 'Not registered for current academic year';
            }
        }

        // ── Write gate log ────────────────────────────────────────────────────
        $logId = null;
        if ($logEntry) {
            $logId = (int)$this->logModel->create([
                'student_id'  => $regNumber,
                'scan_type'   => $scanType,
                'barcode'     => strlen($query) <= 80 ? $query : null,
                'gate'        => $gate,
                'result'      => $accessResult,
                'reason'      => $denyReason,
                'verified_by' => $actor['id'] ?? null,
            ]);

            SystemLogService::log(
                'CREATE', 'GATE',
                "Gate {$accessResult}: {$student['fname']} {$student['lname']} ({$regNumber}) via {$scanType} at {$gate}",
                $logId, 'gate_log',
                ['payment_cleared' => $paymentCleared, 'registered' => $isRegistered],
                $actor
            );
        }

        $this->success($response, [
            'student'         => [
                'regnumber'    => $regNumber,
                'name'         => "{$student['fname']} {$student['lname']}",
                'email'        => $student['email'],
                'phone'        => $student['phone'],
                'photo_url'    => $student['photo_url'],
                'status'       => $student['student_status'],
                'program'      => $student['program_name'],
                'level'        => $student['level_name'],
                'academic_year'=> $student['academic_year_label'],
            ],
            'payment_cleared' => $paymentCleared,
            'payment_balance' => (float)($clearance['balance'] ?? 0),
            'registered'      => $isRegistered,
            'modules_count'   => (int)($registration['modules_registered'] ?? 0),
            'access_result'   => $accessResult,
            'deny_reason'     => $denyReason,
            'scan_type'       => $scanType,
            'gate'            => $gate,
            'log_id'          => $logId,
            'verified_at'     => date('Y-m-d H:i:s'),
        ]);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Log management
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * GET /api/gate/logs
     */
    public function listLogs(Request $request, Response $response): never
    {
        $page    = max(1, (int)($request->query('page') ?? 1));
        $perPage = min(100, max(10, (int)($request->query('per_page') ?? 50)));

        $filters = array_filter([
            'student_id' => $request->query('student_id') ?? '',
            'result'     => $request->query('result')     ?? '',
            'scan_type'  => $request->query('scan_type')  ?? '',
            'gate'       => $request->query('gate')       ?? '',
            'date_from'  => $request->query('date_from')  ?? '',
            'date_to'    => $request->query('date_to')    ?? '',
            'search'     => $request->query('search')     ?? '',
        ]);

        $result = $this->logModel->listWithDetails($filters, $page, $perPage);
        $this->success($response, $result);
    }

    /**
     * GET /api/gate/logs/recent
     * Returns the latest N gate log entries for the live feed.
     */
    public function recentLogs(Request $request, Response $response): never
    {
        $limit = min(50, max(5, (int)($request->query('limit') ?? 20)));
        $gate  = $request->query('gate') ?? null;

        $rows = $this->logModel->getRecentLogs($limit, $gate ?: null);
        $this->success($response, $rows);
    }

    /**
     * GET /api/gate/stats
     */
    public function getStats(Request $request, Response $response): never
    {
        $gate = $request->query('gate') ?? null;

        $todayStats = $this->logModel->getTodayStats($gate ?: null);

        // Weekly breakdown (last 7 days)
        $weekly = $this->db->fetchAll(
            "SELECT DATE(created_at) AS day,
                    SUM(result = 'granted') AS granted,
                    SUM(result = 'denied')  AS denied,
                    COUNT(*) AS total
             FROM `gate_logs`
             WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
             GROUP BY DATE(created_at)
             ORDER BY day ASC"
        );

        // Active gates (gates that have had activity today)
        $gates = $this->db->fetchAll(
            "SELECT gate, COUNT(*) AS checks,
                    SUM(result = 'granted') AS granted,
                    SUM(result = 'denied') AS denied
             FROM `gate_logs`
             WHERE DATE(created_at) = CURDATE()
             GROUP BY gate
             ORDER BY checks DESC"
        );

        $this->success($response, [
            'today'  => $todayStats,
            'weekly' => $weekly,
            'gates'  => $gates,
        ]);
    }

    /**
     * GET /api/gate/student/:regnumber
     * Quick read-only status check (no log written).
     */
    public function studentStatus(Request $request, Response $response): never
    {
        $regNumber = trim((string)$request->param('regnumber'));

        $student = $this->db->fetchOne(
            "SELECT s.regnumber, s.fname, s.lname, s.email, s.photo_url, s.status AS student_status,
                    o.name AS program_name, l.name AS level_name,
                    ay.label AS academic_year_label, ay.id AS academic_year_id,
                    t.id AS term_id
             FROM `student` s
             LEFT JOIN `options`        o  ON o.id = s.option_id
             LEFT JOIN `levels`         l  ON l.id = s.level_id
             LEFT JOIN `academic_years` ay ON ay.is_active = 1
             LEFT JOIN `academic_terms` t  ON t.academic_year_id = ay.id AND t.is_current = 1
             WHERE s.regnumber = ?
             LIMIT 1",
            [$regNumber]
        );

        if (!$student) {
            $this->error($response, 'Student not found.', 404);
        }

        $academicYearId = (int)($student['academic_year_id'] ?? 0);
        $termId         = isset($student['term_id']) ? (int)$student['term_id'] : null;

        $clearance = ['status' => 'unknown', 'balance' => 0.0];
        if ($academicYearId) {
            try {
                $clearance = $this->clearanceService->getStatus($regNumber, $academicYearId, $termId);
            } catch (\Throwable) {}
        }

        $registration = $academicYearId ? $this->db->fetchOne(
            "SELECT status, registered_at FROM `module_registrations`
             WHERE student_id = ? AND academic_year_id = ?
               AND status IN ('registered', 'confirmed')
             ORDER BY registered_at DESC LIMIT 1",
            [$regNumber, $academicYearId]
        ) : null;

        $this->success($response, [
            'student'         => [
                'regnumber' => $regNumber,
                'name'      => "{$student['fname']} {$student['lname']}",
                'program'   => $student['program_name'],
                'level'     => $student['level_name'],
                'photo_url' => $student['photo_url'],
                'status'    => $student['student_status'],
            ],
            'payment_cleared' => $clearance['status'] === 'cleared',
            'payment_balance' => (float)($clearance['balance'] ?? 0),
            'registered'      => !empty($registration),
            'academic_year'   => $student['academic_year_label'],
        ]);
    }
}

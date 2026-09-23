<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use Core\Database;
use App\Constants\Permissions;
use App\Services\AuthService;
use App\Services\SystemLogService;

/**
 * Service Request Platform — Reporting Dashboard.
 *
 * Single aggregated endpoint (overview) so the dashboard page renders from
 * one round trip: KPI totals, status breakdown, per-service breakdown,
 * submission trend, average turnaround, current stage workload, and a
 * recent-activity feed.
 *
 * Requires VIEW_SERVICE_REQUESTS permission. Superadmins bypass via
 * hasPerm() — same shape as AcademicAnalyticsController.
 */
class ServiceRequestReportController extends BaseController
{
    private Database $db;

    /** Maps a KPI card's click-through filter to the status(es) it represents. */
    private const FILTER_STATUSES = [
        'pending_review'     => ['submitted', 'in_review', 'changes_requested'],
        'awaiting_payment'   => ['awaiting_payment'],
        'completed'          => ['completed'],
        'rejected_cancelled' => ['rejected', 'cancelled', 'expired'],
        'in_review'          => ['in_review'],
        'paid_or_completed'  => ['paid', 'completed'],
    ];

    public function __construct()
    {
        $this->db = Database::getInstance();
    }

    private function hasPerm(Request $request, string $slug): bool
    {
        $user = (array)($request->param('_auth_user') ?? []);
        if (AuthService::isSuperadmin($user)) {
            return true;
        }
        return in_array($slug, (array)($user['permissions'] ?? []), true);
    }

    private function gate(Request $request, Response $response): void
    {
        if (!$this->hasPerm($request, Permissions::VIEW_SERVICE_REQUESTS)) {
            $this->error($response, 'Forbidden', 403);
        }
    }

    public function overview(Request $request, Response $response): never
    {
        $this->gate($request, $response);

        $days = (int)($request->query('days') ?: 30);
        $days = max(7, min(180, $days));

        $this->success($response, [
            'totals'          => $this->totals(),
            'status_breakdown'=> $this->statusBreakdown(),
            'by_service'      => $this->byService(),
            'trend'           => $this->submissionTrend($days),
            'turnaround'      => $this->turnaround(),
            'stage_workload'  => $this->stageWorkload(),
            'recent'          => $this->recentRequests(),
        ], 'Service request report fetched successfully.');
    }

    private function totals(): array
    {
        $row = $this->db->fetchOne(
            "SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN status IN ('submitted','in_review','changes_requested') THEN 1 ELSE 0 END) AS pending_review,
                SUM(CASE WHEN status = 'awaiting_payment' THEN 1 ELSE 0 END) AS awaiting_payment,
                SUM(CASE WHEN status IN ('paid','completed') THEN 1 ELSE 0 END) AS paid_or_completed,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
                SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
                SUM(CASE WHEN status IN ('cancelled','expired') THEN 1 ELSE 0 END) AS cancelled
             FROM service_requests"
        ) ?: [];

        $revenueRow = $this->db->fetchOne(
            "SELECT COALESCE(SUM(fi.amount_paid), 0) AS revenue
               FROM service_requests sr
               JOIN fee_invoices fi ON fi.id = sr.invoice_id
              WHERE sr.status IN ('paid', 'completed')"
        ) ?: [];

        return [
            'total'             => (int)($row['total'] ?? 0),
            'pending_review'    => (int)($row['pending_review'] ?? 0),
            'awaiting_payment'  => (int)($row['awaiting_payment'] ?? 0),
            'paid_or_completed' => (int)($row['paid_or_completed'] ?? 0),
            'completed'         => (int)($row['completed'] ?? 0),
            'rejected'          => (int)($row['rejected'] ?? 0),
            'cancelled'         => (int)($row['cancelled'] ?? 0),
            'revenue'           => (float)($revenueRow['revenue'] ?? 0),
        ];
    }

    private function statusBreakdown(): array
    {
        return $this->db->fetchAll(
            "SELECT status, COUNT(*) AS count FROM service_requests GROUP BY status ORDER BY count DESC"
        );
    }

    private function byService(): array
    {
        return $this->db->fetchAll(
            "SELECT sc.id, sc.name,
                    COUNT(sr.id) AS total,
                    SUM(CASE WHEN sr.status = 'completed' THEN 1 ELSE 0 END) AS completed,
                    SUM(CASE WHEN sr.status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
                    COALESCE(SUM(CASE WHEN sr.status IN ('paid','completed') THEN fi.amount_paid ELSE 0 END), 0) AS revenue
               FROM service_catalog sc
               LEFT JOIN service_requests sr ON sr.service_id = sc.id
               LEFT JOIN fee_invoices fi ON fi.id = sr.invoice_id
              GROUP BY sc.id, sc.name
              HAVING total > 0
              ORDER BY total DESC"
        );
    }

    private function submissionTrend(int $days): array
    {
        $rows = $this->db->fetchAll(
            "SELECT DATE(submitted_at) AS day, COUNT(*) AS count
               FROM service_requests
              WHERE submitted_at >= (CURDATE() - INTERVAL ? DAY)
              GROUP BY DATE(submitted_at)
              ORDER BY day ASC",
            [$days]
        );

        $byDay = [];
        foreach ($rows as $r) {
            $byDay[$r['day']] = (int)$r['count'];
        }

        $trend = [];
        for ($i = $days - 1; $i >= 0; $i--) {
            $date = date('Y-m-d', strtotime("-{$i} days"));
            $trend[] = ['day' => $date, 'count' => $byDay[$date] ?? 0];
        }

        return $trend;
    }

    private function turnaround(): array
    {
        $row = $this->db->fetchOne(
            "SELECT AVG(TIMESTAMPDIFF(HOUR, submitted_at, completed_at)) AS avg_hours,
                    COUNT(*) AS sample_size
               FROM service_requests
              WHERE status = 'completed' AND completed_at IS NOT NULL AND submitted_at IS NOT NULL"
        ) ?: [];

        return [
            'avg_hours'   => $row['avg_hours'] !== null ? round((float)$row['avg_hours'], 1) : null,
            'sample_size' => (int)($row['sample_size'] ?? 0),
        ];
    }

    private function stageWorkload(): array
    {
        return $this->db->fetchAll(
            "SELECT scs.stage_label, sc.name AS service_name, COUNT(*) AS count
               FROM service_requests sr
               JOIN service_catalog_stages scs ON scs.service_id = sr.service_id AND scs.stage_order = sr.current_stage_order
               JOIN service_catalog sc ON sc.id = sr.service_id
              WHERE sr.status = 'in_review'
              GROUP BY scs.stage_label, sc.name
              ORDER BY count DESC"
        );
    }

    private function recentRequests(): array
    {
        return $this->db->fetchAll(
            "SELECT sr.id, sr.request_code, sr.full_name, sr.status, sr.submitted_at, sc.name AS service_name
               FROM service_requests sr
               JOIN service_catalog sc ON sc.id = sr.service_id
              ORDER BY sr.created_at DESC
              LIMIT 10"
        );
    }

    /** @return array{0: string, 1: array} [WHERE clause (possibly empty string), bindings] */
    private function filterWhere(?string $filter): array
    {
        if ($filter === null || $filter === '' || $filter === 'total') {
            return ['', []];
        }
        $statuses = self::FILTER_STATUSES[$filter] ?? null;
        if ($statuses === null) {
            return ['', []];
        }
        $placeholders = implode(',', array_fill(0, count($statuses), '?'));
        return ["WHERE sr.status IN ({$placeholders})", $statuses];
    }

    /**
     * GET /api/service-requests/reports/list?filter=&page=&per_page=
     * Paginated, filterable list backing the "click a KPI to drill in" flow.
     */
    public function list(Request $request, Response $response): never
    {
        $this->gate($request, $response);

        $filter  = (string)($request->query('filter') ?? 'total');
        $page    = max(1, (int)($request->query('page') ?? 1));
        $perPage = max(1, min(100, (int)($request->query('per_page') ?? 15)));
        $offset  = ($page - 1) * $perPage;

        [$where, $bindings] = $this->filterWhere($filter);

        $total = (int)($this->db->fetchOne(
            "SELECT COUNT(*) AS cnt FROM service_requests sr {$where}",
            $bindings
        )['cnt'] ?? 0);

        $rows = $this->db->fetchAll(
            "SELECT sr.id, sr.request_code, sr.full_name, sr.email, sr.phone, sr.status,
                    sr.submitted_at, sr.completed_at, sc.name AS service_name,
                    fi.amount_due, fi.amount_paid, fi.status AS invoice_status
               FROM service_requests sr
               JOIN service_catalog sc ON sc.id = sr.service_id
               LEFT JOIN fee_invoices fi ON fi.id = sr.invoice_id
               {$where}
              ORDER BY sr.created_at DESC
              LIMIT {$perPage} OFFSET {$offset}",
            $bindings
        );

        $this->success($response, [
            'data'         => $rows,
            'total'        => $total,
            'per_page'     => $perPage,
            'current_page' => $page,
            'last_page'    => (int)max(1, ceil($total / $perPage)),
            'filter'       => $filter,
        ], 'Service requests fetched successfully.');
    }

    /**
     * GET /api/service-requests/reports/export?filter=
     * CSV export (this codebase's established "Excel export" convention —
     * see BudgetController::export — rather than adding a PhpSpreadsheet
     * dependency for a plain tabular report).
     */
    public function export(Request $request, Response $response): never
    {
        $this->gate($request, $response);

        $filter = (string)($request->query('filter') ?? 'total');
        [$where, $bindings] = $this->filterWhere($filter);

        $rows = $this->db->fetchAll(
            "SELECT sr.request_code, sr.full_name, sr.email, sr.phone, sr.status,
                    sr.submitted_at, sr.completed_at, sc.name AS service_name,
                    fi.amount_due, fi.amount_paid, fi.status AS invoice_status
               FROM service_requests sr
               JOIN service_catalog sc ON sc.id = sr.service_id
               LEFT JOIN fee_invoices fi ON fi.id = sr.invoice_id
               {$where}
              ORDER BY sr.created_at DESC
              LIMIT 5000",
            $bindings
        );

        $actor = (array)$request->param('_auth_user');
        SystemLogService::log('EXPORT', 'SERVICE_REQUESTS', "Exported service requests report (filter={$filter}, " . count($rows) . " rows).", null, 'service_request', ['filter' => $filter], $actor ?: null);

        $headers  = ['Request Code', 'Requester', 'Email', 'Phone', 'Service', 'Status', 'Submitted At', 'Completed At', 'Amount Due', 'Amount Paid', 'Invoice Status'];
        $filename = 'service-requests-' . $filter . '-' . date('Y-m-d') . '.csv';

        ob_start();
        $out = fopen('php://output', 'w');
        fputcsv($out, $headers);
        foreach ($rows as $r) {
            fputcsv($out, [
                $r['request_code'],
                $r['full_name'],
                $r['email'],
                $r['phone'],
                $r['service_name'],
                $r['status'],
                $r['submitted_at'],
                $r['completed_at'],
                $r['amount_due'],
                $r['amount_paid'],
                $r['invoice_status'],
            ]);
        }
        fclose($out);
        $csv = ob_get_clean();

        header('Content-Type: text/csv; charset=utf-8');
        header("Content-Disposition: attachment; filename=\"{$filename}\"");
        header('Cache-Control: no-cache');
        echo $csv;
        exit;
    }
}

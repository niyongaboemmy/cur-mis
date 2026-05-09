<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Models\SystemLogModel;

class SystemLogController extends BaseController
{
    private SystemLogModel $model;

    public function __construct()
    {
        $this->model = new SystemLogModel();
    }

    /** GET /api/logs — paginated, filtered list */
    public function index(Request $request, Response $response): never
    {
        $page    = max(1, (int) ($request->query('page')     ?? 1));
        $perPage = min(100, max(1, (int) ($request->query('per_page') ?? 25)));

        $filters = array_filter([
            'module'    => $request->query('module')    ?? '',
            'action'    => $request->query('action')    ?? '',
            'user_id'   => $request->query('user_id')   ?? '',
            'date_from' => $request->query('date_from') ?? '',
            'date_to'   => $request->query('date_to')   ?? '',
            'search'    => $request->query('search')    ?? '',
        ], fn($v) => $v !== '');

        $result = $this->model->paginateFiltered($filters, $page, $perPage);
        $this->success($response, $result, 'System logs retrieved.');
    }

    /** GET /api/logs/stats — dashboard summary */
    public function stats(Request $request, Response $response): never
    {
        $this->success($response, $this->model->getDashboardStats(), 'Stats retrieved.');
    }

    /** GET /api/logs/modules — distinct module values for filter dropdown */
    public function modules(Request $request, Response $response): never
    {
        $rows = $this->model->distinctModules();
        $this->success($response, array_column($rows, 'module'), 'Modules retrieved.');
    }

    /** GET /api/logs/export — streams CSV download */
    public function export(Request $request, Response $response): never
    {
        $filters = array_filter([
            'module'    => $request->query('module')    ?? '',
            'action'    => $request->query('action')    ?? '',
            'user_id'   => $request->query('user_id')   ?? '',
            'date_from' => $request->query('date_from') ?? '',
            'date_to'   => $request->query('date_to')   ?? '',
            'search'    => $request->query('search')    ?? '',
        ], fn($v) => $v !== '');

        $rows     = $this->model->forExport($filters);
        $filename = 'system-logs-' . date('Y-m-d_His') . '.csv';

        ob_start();
        $out = fopen('php://output', 'w');
        fputcsv($out, ['ID', 'Timestamp', 'User ID', 'User Name', 'Email', 'Action', 'Module', 'Entity Type', 'Entity ID', 'Description', 'IP Address']);
        foreach ($rows as $row) {
            fputcsv($out, [
                $row['id'],
                $row['created_at'],
                $row['user_id']     ?? '',
                $row['user_name'],
                $row['user_email'],
                $row['action'],
                $row['module'],
                $row['entity_type'] ?? '',
                $row['entity_id']   ?? '',
                $row['description'],
                $row['ip_address'],
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

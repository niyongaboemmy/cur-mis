<?php

declare(strict_types=1);

namespace App\Models;

class SystemLogModel extends BaseModel
{
    protected string $table    = 'system_logs';
    protected array  $hidden   = [];
    protected array  $fillable = [
        'user_id', 'user_name', 'user_email',
        'action', 'module', 'entity_type', 'entity_id',
        'description', 'ip_address', 'metadata',
    ];

    public function paginateFiltered(array $filters, int $page, int $perPage): array
    {
        [$where, $bindings] = $this->buildWhere($filters);
        return $this->paginate($page, $perPage, $where, $bindings, 'created_at', 'DESC');
    }

    public function getDashboardStats(): array
    {
        $db = $this->db();

        $total = (int) ($db->fetchOne("SELECT COUNT(*) AS cnt FROM `system_logs`")['cnt'] ?? 0);

        $today = (int) ($db->fetchOne(
            "SELECT COUNT(*) AS cnt FROM `system_logs` WHERE DATE(`created_at`) = CURDATE()"
        )['cnt'] ?? 0);

        $yesterday = (int) ($db->fetchOne(
            "SELECT COUNT(*) AS cnt FROM `system_logs` WHERE DATE(`created_at`) = CURDATE() - INTERVAL 1 DAY"
        )['cnt'] ?? 0);

        $byModule = $db->fetchAll(
            "SELECT `module`, COUNT(*) AS `count` FROM `system_logs`
             GROUP BY `module` ORDER BY `count` DESC"
        );

        $byAction = $db->fetchAll(
            "SELECT `action`, COUNT(*) AS `count` FROM `system_logs`
             GROUP BY `action` ORDER BY `count` DESC"
        );

        $trend7d = $db->fetchAll(
            "SELECT DATE(`created_at`) AS `date`, COUNT(*) AS `count`
             FROM `system_logs`
             WHERE `created_at` >= CURDATE() - INTERVAL 6 DAY
             GROUP BY DATE(`created_at`)
             ORDER BY `date` ASC"
        );

        $topUsers = $db->fetchAll(
            "SELECT `user_name`, `user_email`, COUNT(*) AS `count`
             FROM `system_logs`
             WHERE `user_id` IS NOT NULL AND `user_name` != ''
             GROUP BY `user_id`, `user_name`, `user_email`
             ORDER BY `count` DESC
             LIMIT 5"
        );

        $lastEntry = $db->fetchOne(
            "SELECT `created_at` FROM `system_logs` ORDER BY `id` DESC LIMIT 1"
        );

        return [
            'total'      => $total,
            'today'      => $today,
            'yesterday'  => $yesterday,
            'by_module'  => $byModule,
            'by_action'  => $byAction,
            'trend_7d'   => $trend7d,
            'top_users'  => $topUsers,
            'last_entry' => $lastEntry['created_at'] ?? null,
        ];
    }

    public function distinctModules(): array
    {
        return $this->db()->fetchAll(
            "SELECT DISTINCT `module` FROM `system_logs` ORDER BY `module` ASC"
        );
    }

    public function forExport(array $filters): array
    {
        [$where, $bindings] = $this->buildWhere($filters);
        $whereSql = $where !== '' ? "WHERE {$where}" : '';
        return $this->db()->fetchAll(
            "SELECT * FROM `system_logs` {$whereSql} ORDER BY `created_at` DESC LIMIT 10000",
            $bindings
        );
    }

    private function buildWhere(array $filters): array
    {
        $clauses  = [];
        $bindings = [];

        if (!empty($filters['module'])) {
            $clauses[]  = '`module` = ?';
            $bindings[] = $filters['module'];
        }
        if (!empty($filters['action'])) {
            $clauses[]  = '`action` = ?';
            $bindings[] = $filters['action'];
        }
        if (!empty($filters['user_id'])) {
            $clauses[]  = '`user_id` = ?';
            $bindings[] = (int) $filters['user_id'];
        }
        if (!empty($filters['date_from'])) {
            $clauses[]  = 'DATE(`created_at`) >= ?';
            $bindings[] = $filters['date_from'];
        }
        if (!empty($filters['date_to'])) {
            $clauses[]  = 'DATE(`created_at`) <= ?';
            $bindings[] = $filters['date_to'];
        }
        if (!empty($filters['search'])) {
            $term       = '%' . $filters['search'] . '%';
            $clauses[]  = '(`description` LIKE ? OR `user_name` LIKE ? OR `user_email` LIKE ?)';
            $bindings   = [...$bindings, $term, $term, $term];
        }

        return [implode(' AND ', $clauses), $bindings];
    }
}

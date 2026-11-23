<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Database;
use Core\Request;
use Core\Response;
use App\Services\UserActivityService;

/**
 * User activity monitoring: who logged in, when, for how long, and what they
 * opened or did. Sessions and page views are recorded by the browser through
 * the heartbeat and page-view endpoints; the admin endpoints read them back.
 */
class UserActivityController extends BaseController
{
    /** Seconds of silence after which an open session is treated as ended. */
    private const ACTIVE_SECONDS = UserActivityService::ACTIVE_WINDOW_SECONDS;

    /** Per-user aggregate of sessions, one row per user_id. */
    private const SESSION_AGG = "
        SELECT user_id,
               COUNT(*)                                            AS login_count,
               MAX(login_at)                                       AS last_login,
               MAX(last_seen_at)                                   AS last_seen,
               SUM(TIMESTAMPDIFF(SECOND, login_at, COALESCE(logout_at, last_seen_at))) AS total_seconds,
               MAX(CASE WHEN logout_at IS NULL AND last_seen_at >= NOW() - INTERVAL %d SECOND
                        THEN 1 ELSE 0 END)                         AS is_online
          FROM user_sessions
         GROUP BY user_id";

    // ── Browser-side tracking (any authenticated user) ───────────────────────

    /** POST /api/activity/heartbeat — keeps the current session alive. */
    public function heartbeat(Request $request, Response $response): never
    {
        $userId = $this->actorId($request, $response);
        UserActivityService::heartbeat($userId);
        $this->success($response, null, 'Heartbeat recorded.');
    }

    /** POST /api/activity/page-view — body: { path } */
    public function pageView(Request $request, Response $response): never
    {
        $userId = $this->actorId($request, $response);
        $body   = $request->body();
        $path   = is_string($body['path'] ?? null) ? trim($body['path']) : '';

        // Only app paths. Anything else (full URLs, empty values) is ignored.
        if ($path !== '' && $path[0] === '/' && !str_starts_with($path, '//')) {
            UserActivityService::recordPageView($userId, $path);
        }
        $this->success($response, null, 'Page view recorded.');
    }

    // ── Admin: consolidated user list ────────────────────────────────────────

    /** GET /api/user-activity/users — one row per user with totals. */
    public function listUsers(Request $request, Response $response): never
    {
        $page    = max(1, (int) ($request->query('page') ?? 1));
        $perPage = min(100, max(1, (int) ($request->query('per_page') ?? 25)));
        $search  = trim((string) ($request->query('search') ?? ''));
        $roleId  = (int) ($request->query('role_id') ?? 0);
        $online  = (string) ($request->query('online') ?? '') === '1';

        [$where, $bindings] = $this->userFilters($search, $roleId, $online);
        $db = Database::getInstance();
        $agg = sprintf(self::SESSION_AGG, self::ACTIVE_SECONDS);

        $from = "FROM `users` u
                 LEFT JOIN `roles` r ON r.id = u.role_id
                 LEFT JOIN ({$agg}) s ON s.user_id = u.id
                 WHERE {$where}";

        $total = (int) ($db->fetchOne("SELECT COUNT(*) AS c {$from}", $bindings)['c'] ?? 0);

        $rows = $db->fetchAll(
            "SELECT u.id, u.full_name, u.email, u.is_active,
                    r.name AS role_name,
                    COALESCE(s.login_count, 0)   AS login_count,
                    COALESCE(s.total_seconds, 0) AS total_seconds,
                    s.last_login, s.last_seen,
                    COALESCE(s.is_online, 0)     AS is_online,
                    (SELECT MAX(pv.created_at) FROM `user_page_views` pv WHERE pv.user_id = u.id) AS last_page_at
             {$from}
             ORDER BY (s.last_login IS NULL), s.last_login DESC, u.full_name ASC
             LIMIT " . (int) $perPage . " OFFSET " . (int) (($page - 1) * $perPage),
            $bindings
        );

        $this->success($response, [
            'data' => array_map(fn(array $r) => $this->userRow($r), $rows),
            'pagination' => [
                'page'        => $page,
                'per_page'    => $perPage,
                'total'       => $total,
                'total_pages' => max(1, (int) ceil($total / $perPage)),
            ],
        ], 'User activity retrieved.');
    }

    /** GET /api/user-activity/stats — headline numbers for the dashboard. */
    public function stats(Request $request, Response $response): never
    {
        $db  = Database::getInstance();
        $one = fn(string $sql) => (int) ($db->fetchOne($sql)['v'] ?? 0);
        $active = self::ACTIVE_SECONDS;

        $this->success($response, [
            'total_users'     => $one("SELECT COUNT(*) AS v FROM `users`"),
            'ever_logged_in'  => $one("SELECT COUNT(DISTINCT user_id) AS v FROM `user_sessions`"),
            'online_now'      => $one("SELECT COUNT(DISTINCT user_id) AS v FROM `user_sessions`
                                        WHERE logout_at IS NULL AND last_seen_at >= NOW() - INTERVAL {$active} SECOND"),
            'logins_today'    => $one("SELECT COUNT(*) AS v FROM `user_sessions` WHERE DATE(login_at) = CURDATE()"),
            'logins_7_days'   => $one("SELECT COUNT(*) AS v FROM `user_sessions` WHERE login_at >= NOW() - INTERVAL 7 DAY"),
            'hours_7_days'    => round($one("SELECT COALESCE(SUM(TIMESTAMPDIFF(SECOND, login_at, COALESCE(logout_at, last_seen_at))), 0) AS v
                                             FROM `user_sessions` WHERE login_at >= NOW() - INTERVAL 7 DAY") / 3600, 1),
            'page_views_7_days' => $one("SELECT COUNT(*) AS v FROM `user_page_views` WHERE created_at >= NOW() - INTERVAL 7 DAY"),
        ], 'Activity stats retrieved.');
    }

    // ── Admin: one user's full history ───────────────────────────────────────

    /** GET /api/user-activity/users/:id — profile, sessions, activity timeline. */
    public function showUser(Request $request, Response $response): never
    {
        $id = (int) $request->param('id');
        $db = Database::getInstance();

        $user = $db->fetchOne(
            "SELECT u.id, u.full_name, u.email, u.is_active, r.name AS role_name
               FROM `users` u LEFT JOIN `roles` r ON r.id = u.role_id
              WHERE u.id = ? LIMIT 1",
            [$id]
        );
        if (!$user) {
            $this->error($response, 'User not found.', 404);
        }

        $summary = $db->fetchOne(
            "SELECT COUNT(*) AS sessions,
                    COALESCE(SUM(TIMESTAMPDIFF(SECOND, login_at, COALESCE(logout_at, last_seen_at))), 0) AS total_seconds,
                    MAX(login_at) AS last_login
               FROM `user_sessions` WHERE user_id = ?",
            [$id]
        );

        $sessions = $db->fetchAll(
            "SELECT id, login_at, logout_at, last_seen_at, ip_address, user_agent,
                    TIMESTAMPDIFF(SECOND, login_at, COALESCE(logout_at, last_seen_at)) AS duration_seconds
               FROM `user_sessions` WHERE user_id = ?
              ORDER BY login_at DESC LIMIT 200",
            [$id]
        );
        $sessions = array_map(fn(array $s) => $this->sessionRow($s), $sessions);

        $actions = $db->fetchAll(
            "SELECT action, module, description, entity_type, entity_id, ip_address, created_at
               FROM `system_logs` WHERE user_id = ?
              ORDER BY created_at DESC LIMIT 200",
            [$id]
        );
        $pages = $db->fetchAll(
            "SELECT path, module, created_at FROM `user_page_views`
              WHERE user_id = ? ORDER BY created_at DESC LIMIT 200",
            [$id]
        );

        $timeline = [];
        foreach ($actions as $a) {
            $timeline[] = [
                'type'        => 'action',
                'at'          => $a['created_at'],
                'module'      => $a['module'],
                'action'      => $a['action'],
                'description' => $a['description'],
                'entity_type' => $a['entity_type'],
                'entity_id'   => $a['entity_id'],
            ];
        }
        foreach ($pages as $p) {
            $timeline[] = [
                'type'   => 'page',
                'at'     => $p['created_at'],
                'module' => $p['module'],
                'action' => 'VIEW',
                'path'   => $p['path'],
            ];
        }
        usort($timeline, fn(array $a, array $b) => strcmp((string) $b['at'], (string) $a['at']));

        $modules = $db->fetchAll(
            "SELECT module, COUNT(*) AS views FROM `user_page_views`
              WHERE user_id = ? GROUP BY module ORDER BY views DESC LIMIT 10",
            [$id]
        );

        $this->success($response, [
            'user' => [
                'id'        => (int) $user['id'],
                'full_name' => $user['full_name'],
                'email'     => $user['email'],
                'role_name' => $user['role_name'],
                'is_active' => (bool) $user['is_active'],
            ],
            'summary' => [
                'sessions'      => (int) $summary['sessions'],
                'total_seconds' => (int) $summary['total_seconds'],
                'last_login'    => $summary['last_login'],
            ],
            'sessions'   => $sessions,
            'activity'   => array_slice($timeline, 0, 300),
            'top_modules' => array_map(
                fn(array $m) => ['module' => $m['module'], 'views' => (int) $m['views']],
                $modules
            ),
        ], 'User activity retrieved.');
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /** @return array{0: string, 1: array<int, mixed>} */
    private function userFilters(string $search, int $roleId, bool $online): array
    {
        $clauses  = ['1 = 1'];
        $bindings = [];

        if ($search !== '') {
            $clauses[]  = '(u.full_name LIKE ? OR u.email LIKE ?)';
            $like       = '%' . $search . '%';
            $bindings[] = $like;
            $bindings[] = $like;
        }
        if ($roleId > 0) {
            $clauses[]  = 'u.role_id = ?';
            $bindings[] = $roleId;
        }
        if ($online) {
            $clauses[] = 'COALESCE(s.is_online, 0) = 1';
        }

        return [implode(' AND ', $clauses), $bindings];
    }

    /** @param array<string, mixed> $r */
    private function userRow(array $r): array
    {
        $loginCount = (int) $r['login_count'];
        $seconds    = (int) $r['total_seconds'];
        return [
            'id'            => (int) $r['id'],
            'full_name'     => $r['full_name'],
            'email'         => $r['email'],
            'role_name'     => $r['role_name'],
            'is_active'     => (bool) $r['is_active'],
            'is_online'     => (bool) $r['is_online'],
            'login_count'   => $loginCount,
            'total_seconds' => $seconds,
            'last_login'    => $r['last_login'],
            'last_seen'     => $r['last_seen'],
            'last_page_at'  => $r['last_page_at'],
            'status'        => $loginCount === 0 ? 'never' : ((bool) $r['is_online'] ? 'online' : 'offline'),
        ];
    }

    /** @param array<string, mixed> $s */
    private function sessionRow(array $s): array
    {
        $open   = $s['logout_at'] === null;
        $recent = strtotime((string) $s['last_seen_at']) >= time() - self::ACTIVE_SECONDS;

        if (!$open) {
            $status = 'logged_out';
        } elseif ($recent) {
            $status = 'active';
        } else {
            $status = 'timed_out'; // no logout and no heartbeat for a while (tab closed)
        }

        return [
            'id'               => (int) $s['id'],
            'login_at'         => $s['login_at'],
            'logout_at'        => $s['logout_at'],
            'last_seen_at'     => $s['last_seen_at'],
            'ip_address'       => $s['ip_address'],
            'user_agent'       => $s['user_agent'],
            'duration_seconds' => max(0, (int) $s['duration_seconds']),
            'status'           => $status,
        ];
    }

    private function actorId(Request $request, Response $response): int
    {
        $actor  = (array) ($request->param('_auth_user') ?? []);
        $userId = (int) ($actor['id'] ?? 0);
        if ($userId <= 0) {
            $this->error($response, 'Unauthorized.', 401);
        }
        return $userId;
    }
}

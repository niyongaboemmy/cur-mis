<?php

declare(strict_types=1);

namespace App\Services;

use Core\Database;

/**
 * Tracks login sessions and page views for the User Activity dashboard.
 *
 * A session starts at login and is closed at logout. Each heartbeat from the
 * browser moves last_seen_at forward, so a session whose tab was simply closed
 * ends at its last heartbeat. Every method swallows its own errors: tracking
 * must never break a login, logout or page request.
 */
class UserActivityService
{
    /** A session with no heartbeat for this long counts as no longer active. */
    public const ACTIVE_WINDOW_SECONDS = 300;

    public static function startSession(int $userId): void
    {
        try {
            $now = date('Y-m-d H:i:s');
            Database::getInstance()->execute(
                'INSERT INTO `user_sessions` (`user_id`, `login_at`, `last_seen_at`, `ip_address`, `user_agent`)
                 VALUES (?, ?, ?, ?, ?)',
                [$userId, $now, $now, self::ip(), substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255)]
            );
        } catch (\Throwable) {
            // Intentionally silent.
        }
    }

    /** Moves the user's open session forward. Does nothing if none is open. */
    public static function heartbeat(int $userId): void
    {
        try {
            Database::getInstance()->execute(
                'UPDATE `user_sessions` SET `last_seen_at` = NOW()
                 WHERE `user_id` = ? AND `logout_at` IS NULL
                 ORDER BY `login_at` DESC LIMIT 1',
                [$userId]
            );
        } catch (\Throwable) {
        }
    }

    public static function endSession(int $userId): void
    {
        try {
            Database::getInstance()->execute(
                'UPDATE `user_sessions` SET `logout_at` = NOW(), `last_seen_at` = NOW()
                 WHERE `user_id` = ? AND `logout_at` IS NULL
                 ORDER BY `login_at` DESC LIMIT 1',
                [$userId]
            );
        } catch (\Throwable) {
        }
    }

    public static function recordPageView(int $userId, string $path): void
    {
        try {
            $path   = substr(trim($path), 0, 255);
            $module = self::moduleFromPath($path);
            Database::getInstance()->execute(
                'INSERT INTO `user_page_views` (`user_id`, `path`, `module`) VALUES (?, ?, ?)',
                [$userId, $path, $module]
            );
        } catch (\Throwable) {
        }
    }

    /** "/students/12?tab=x" -> "students". The first path segment names the module. */
    public static function moduleFromPath(string $path): string
    {
        $segment = strtok(ltrim($path, '/'), '/?#') ?: '';
        return substr(strtolower($segment) ?: 'home', 0, 100);
    }

    private static function ip(): string
    {
        foreach (['HTTP_X_FORWARDED_FOR', 'HTTP_CLIENT_IP', 'REMOTE_ADDR'] as $key) {
            $val = $_SERVER[$key] ?? '';
            if ($val !== '') {
                return substr(trim(explode(',', $val)[0]), 0, 45);
            }
        }
        return '';
    }
}

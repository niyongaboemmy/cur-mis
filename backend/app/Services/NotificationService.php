<?php

declare(strict_types=1);

namespace App\Services;

use Core\Database;
use App\Models\NotificationModel;

/**
 * In-system notifications.
 *
 * Every method here is best-effort and never throws: a notification is a
 * courtesy, and failing to deliver one must never roll back the business
 * action that triggered it. Same contract as SystemLogService::log().
 *
 * `push()` writes to one user. `pushToPermissionHolders()` fans out to whoever
 * currently holds a permission slug — which is what makes an approval queue
 * discoverable without hardcoding who the approvers are.
 */
class NotificationService
{
    public const SEVERITIES = ['info', 'success', 'warning', 'danger'];

    /** Deliver one notification. Returns the new id, or null if it was skipped. */
    public static function push(
        int $userId,
        string $type,
        string $title,
        string $message,
        ?string $link = null,
        ?string $entityType = null,
        ?int $entityId = null,
        string $severity = 'info'
    ): ?int {
        if ($userId <= 0) {
            return null;
        }

        try {
            $id = (new NotificationModel())->create([
                'user_id'     => $userId,
                'type'        => $type,
                'title'       => mb_substr($title, 0, 150),
                'message'     => $message,
                'link'        => $link !== null ? mb_substr($link, 0, 255) : null,
                'entity_type' => $entityType,
                'entity_id'   => $entityId,
                'severity'    => in_array($severity, self::SEVERITIES, true) ? $severity : 'info',
                'is_read'     => 0,
            ]);

            return (int) $id;
        } catch (\Throwable $e) {
            error_log('[NotificationService] push failed: ' . $e->getMessage());
            return null;
        }
    }

    /**
     * Notify every active user who holds $permissionSlug — the people who can
     * actually act on whatever this is about.
     *
     * Superadmins are deliberately NOT included in the normal fan-out: they hold
     * every permission implicitly, so including them would send every routine
     * approval in the system to every superadmin. They are used only as a
     * fallback when nobody holds the slug explicitly — better one noisy inbox
     * than a request that stalls with nobody told about it.
     *
     * @param int[] $excludeUserIds e.g. the actor who caused the event; nobody
     *                              wants a notification about their own action.
     * @return int how many notifications were delivered
     */
    public static function pushToPermissionHolders(
        string $permissionSlug,
        string $type,
        string $title,
        string $message,
        ?string $link = null,
        ?string $entityType = null,
        ?int $entityId = null,
        string $severity = 'info',
        array $excludeUserIds = []
    ): int {
        $recipients = self::usersWithPermission($permissionSlug, $excludeUserIds);
        if (empty($recipients)) {
            $recipients = self::usersWithPermission($permissionSlug, $excludeUserIds, true);
        }

        $sent = 0;
        foreach ($recipients as $userId) {
            if (self::push($userId, $type, $title, $message, $link, $entityType, $entityId, $severity) !== null) {
                $sent++;
            }
        }
        return $sent;
    }

    /**
     * Active user ids holding $permissionSlug. Permissions come from the role —
     * there is no per-user override table.
     *
     * With $includeSuperadmins the superadmin role counts as holding the slug,
     * mirroring AuthService::isSuperadmin. Off by default; see
     * pushToPermissionHolders() for why.
     *
     * @param int[] $excludeUserIds
     * @return int[]
     */
    public static function usersWithPermission(
        string $permissionSlug,
        array $excludeUserIds = [],
        bool $includeSuperadmins = false
    ): array {
        $superadminClause = $includeSuperadmins ? " OR r.name = 'superadmin'" : '';

        try {
            $rows = Database::getInstance()->fetchAll(
                "SELECT DISTINCT u.id
                 FROM users u
                 JOIN roles r ON r.id = u.role_id
                 LEFT JOIN role_permissions rp ON rp.role_id = r.id
                 LEFT JOIN permissions p ON p.id = rp.permission_id
                 WHERE u.is_active = 1
                   AND (p.slug = ?{$superadminClause})",
                [$permissionSlug]
            );
        } catch (\Throwable $e) {
            error_log('[NotificationService] permission-holder lookup failed: ' . $e->getMessage());
            return [];
        }

        $exclude = array_map('intval', $excludeUserIds);

        return array_values(array_filter(
            array_map(static fn(array $r): int => (int) $r['id'], $rows),
            static fn(int $id): bool => !in_array($id, $exclude, true)
        ));
    }
}

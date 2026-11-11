<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\UserCampusAssignmentModel;

/**
 * Narrows what a campus-locked account sees to its assigned campuses.
 *
 * A role is campus-locked when "Show only data from assigned campus(es)" is on
 * (`roles.enforce_campus_scope`); the campuses come from Users management
 * (`user_campus_assignments`). The top-bar campus picker only narrows further:
 * with no campus picked a locked user sees all of their campuses, never more.
 * Superadmins and users of unlocked roles get `null` — no restriction.
 */
final class CampusScopeService
{
    /** @var array<int, int[]> */
    private static array $cache = [];

    /**
     * @return int[]|null  campus ids the user may see; null = unrestricted, [] = none
     */
    public static function forUser(array $authUser): ?array
    {
        if (AuthService::isSuperadmin($authUser) || empty($authUser['enforce_campus_scope'])) {
            return null;
        }
        $userId = (int)($authUser['id'] ?? 0);
        if ($userId <= 0) {
            return [];
        }
        return self::$cache[$userId] ??= (new UserCampusAssignmentModel())->campusIdsForUser($userId);
    }

    /**
     * Condition limiting a student campus column (a varchar holding the
     * campuses.id) to the user's campuses. Returns null when unrestricted.
     *
     * @return array{0:string,1:string[]}|null
     */
    public static function studentCondition(array $authUser, string $column): ?array
    {
        $ids = self::forUser($authUser);
        if ($ids === null) {
            return null;
        }
        if ($ids === []) {
            return ['1=0', []];
        }
        $ph = implode(',', array_fill(0, count($ids), '?'));
        return ["{$column} IN ({$ph})", array_map('strval', $ids)];
    }
}

<?php

declare(strict_types=1);

namespace App\Helpers;

use Core\Database;
use Throwable;

/**
 * Turns a level *id* into the level *name* the reader expects to see.
 *
 * Several columns store a `levels.id` even though their name reads like a
 * plain number: `student.current_level`, `modules.level`,
 * `student_applications.level_id`, `module_offerings.level_id`. Printing them
 * raw produced screens and PDFs that said "Level 3" when the catalogue calls
 * that level "Year 2" — or worse, "Level #7" on the application detail page.
 *
 * Everything that renders a level for a human should pass the stored value
 * through {@see self::name()} first. The catalogue is tiny (a handful of rows)
 * and never changes mid-request, so it is fetched once per process and cached.
 *
 * Non-numeric values pass through untouched: some legacy rows already hold a
 * label ("Year 1"), and a few callers pass a name in deliberately.
 */
final class LevelHelper
{
    /** @var array<int,string>|null id → name, loaded lazily. */
    private static ?array $map = null;

    /**
     * The whole catalogue, id → name. Falls back to an empty map when the
     * table is unreachable so a document still renders (with raw ids) rather
     * than failing outright.
     *
     * @return array<int,string>
     */
    public static function map(): array
    {
        if (self::$map !== null) {
            return self::$map;
        }

        try {
            $rows = Database::getInstance()->fetchAll('SELECT id, name FROM `levels`');
        } catch (Throwable) {
            return self::$map = [];
        }

        $map = [];
        foreach ($rows as $row) {
            $map[(int) $row['id']] = (string) $row['name'];
        }

        return self::$map = $map;
    }

    /**
     * Resolve one stored level value to its display name.
     *
     * - numeric id with a catalogue row  → the row's name ("Year 2")
     * - numeric id with no row           → "Level 7" (readable, still traceable)
     * - non-numeric text                 → returned as-is (already a label)
     * - null / empty                     → $fallback
     */
    public static function name(mixed $value, string $fallback = ''): string
    {
        if ($value === null) {
            return $fallback;
        }

        $raw = trim((string) $value);
        if ($raw === '') {
            return $fallback;
        }

        if (!ctype_digit($raw)) {
            return $raw;
        }

        return self::map()[(int) $raw] ?? ('Level ' . $raw);
    }

    /**
     * Add a resolved name beside the id on every row of a result set.
     *
     * @param array<int,array<string,mixed>> $rows
     * @return array<int,array<string,mixed>>
     */
    public static function decorate(array $rows, string $idKey = 'level', string $nameKey = 'level_name'): array
    {
        foreach ($rows as &$row) {
            if (is_array($row) && array_key_exists($idKey, $row) && ($row[$nameKey] ?? null) === null) {
                $row[$nameKey] = self::name($row[$idKey], '') ?: null;
            }
        }
        unset($row);

        return $rows;
    }

    /** Test seam — drop the cached catalogue. */
    public static function flush(): void
    {
        self::$map = null;
    }
}

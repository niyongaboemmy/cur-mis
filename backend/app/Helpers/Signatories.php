<?php

declare(strict_types=1);

namespace App\Helpers;

use Core\Database;

/**
 * Who signs the documents the registry issues.
 *
 * The Academic Registrar's name used to be a string literal repeated across
 * every document helper, so a change of officeholder meant a code change and
 * a deploy — and until all of them were found, a transcript and a certificate
 * could go out over two different names.
 *
 * Resolution order, first non-empty wins:
 *   1. the `settings` row an admin edits at System settings → Signatories
 *   2. the ACADEMIC_REGISTRAR_NAME env var, kept so an existing deployment
 *      that already sets it is not silently overridden
 *   3. the built-in default below
 *
 * The lookup is memoised per request: a transcript renders one sign-off per
 * level sheet and would otherwise repeat the query for each.
 */
final class Signatories
{
    public const REGISTRAR_KEY     = 'academic_registrar_name';
    public const REGISTRAR_DEFAULT = 'BIZIMANA Protais';

    private static ?string $registrar = null;

    /** The name printed above "Academic Registrar" on issued documents. */
    public static function academicRegistrar(): string
    {
        if (self::$registrar !== null) {
            return self::$registrar;
        }

        $name = self::stored(self::REGISTRAR_KEY);

        if ($name === '') {
            $name = trim((string) (getenv('ACADEMIC_REGISTRAR_NAME') ?: ''));
        }
        if ($name === '') {
            $name = self::REGISTRAR_DEFAULT;
        }

        return self::$registrar = $name;
    }

    /** Forget the memoised value — used after a save so the next render is current. */
    public static function forget(): void
    {
        self::$registrar = null;
    }

    /**
     * One settings value, or '' when the row, the table or the database is not
     * there. A document must still render if settings are unavailable; falling
     * back is always better than a fatal in the middle of a PDF.
     */
    private static function stored(string $key): string
    {
        try {
            $row = Database::getInstance()->fetchOne(
                "SELECT `value` FROM `settings` WHERE `key_name` = ? LIMIT 1",
                [$key],
            );
            return trim((string) ($row['value'] ?? ''));
        } catch (\Throwable) {
            return '';
        }
    }
}

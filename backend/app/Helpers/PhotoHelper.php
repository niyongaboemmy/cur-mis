<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Resolves the kinds of values stored in `student.photo` / `users.photo`:
 *   • a file-server UUID  ("3d25b511-24a2-4968-ae48-faca750051f9")
 *       → handled by the current process (FileServerClient).
 *   • a legacy image, in one of two forms, both living on the old CUR store:
 *       - a bare filename            "photo_6a1af38bd7e819.40609252.jpg"
 *       - a relative path            "documents/std_photo/<hash><name>.jpeg"
 *     Both resolve to LEGACY_ROOT + documents/std_photo/<file>.
 */
class PhotoHelper
{
    /** Old CUR document root (the std_photo folder lives under it). */
    private const LEGACY_ROOT = 'https://cur.ac.rw/mis/main/registraria';

    public static function isUuid(?string $value): bool
    {
        return (bool) preg_match(
            '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i',
            trim((string) $value)
        );
    }

    /**
     * Absolute URL on the legacy store for a legacy photo value; null for
     * UUID / file-server ids (use the current process) or anything that isn't
     * a legacy image reference. Path traversal ("..") is rejected.
     */
    public static function legacyUrl(?string $value): ?string
    {
        $v = trim((string) $value);
        if ($v === '' || self::isUuid($v)) return null;

        // Already absolute (some rows store a full URL) — use as-is.
        if (preg_match('#^https?://#i', $v)) return $v;

        // Must reference an image file; never allow traversal.
        if (str_contains($v, '..')) return null;
        if (!preg_match('/\.(jpe?g|png|gif|webp)$/i', $v)) return null;

        $root = rtrim((string) ($_ENV['LEGACY_STD_PHOTO_ROOT_URL'] ?? '') ?: self::LEGACY_ROOT, '/');
        $path = ltrim($v, '/');
        // A bare filename (no slash) lives directly in documents/std_photo/.
        if (!str_contains($path, '/')) {
            $path = 'documents/std_photo/' . $path;
        }
        // Encode each path segment (handles spaces / special chars) but keep slashes.
        $encoded = implode('/', array_map('rawurlencode', explode('/', $path)));
        return $root . '/' . $encoded;
    }
}

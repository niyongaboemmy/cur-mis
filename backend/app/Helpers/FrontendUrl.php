<?php

declare(strict_types=1);

namespace App\Helpers;

use Core\Request;

/**
 * Base address of the web app (the SPA), for links printed on documents —
 * e.g. the verification pages a QR code opens.
 */
final class FrontendUrl
{
    /**
     * APP_FRONTEND_URL when set (it must include the sub-path, e.g.
     * https://cur.ac.rw/umis); otherwise derived from the request's Referer,
     * keeping its first path segment so /umis/... referers yield
     * https://host/umis; otherwise the production address. No trailing slash.
     */
    public static function base(?Request $request = null): string
    {
        $base = trim((string) ($_ENV['APP_FRONTEND_URL'] ?? getenv('APP_FRONTEND_URL') ?: ''));

        if ($base === '' && $request !== null) {
            $ref = (string) ($request->header('Referer') ?? '');
            if ($ref !== '' && ($p = parse_url($ref))) {
                $path     = $p['path'] ?? '/';
                $segments = explode('/', trim($path, '/'));
                $prefix   = isset($segments[0]) && $segments[0] !== '' ? '/' . $segments[0] : '';
                $base     = ($p['scheme'] ?? 'https') . '://' . ($p['host'] ?? '')
                          . (isset($p['port']) ? ':' . $p['port'] : '')
                          . $prefix;
            }
        }

        if ($base === '') {
            $base = 'https://cur.ac.rw/umis';
        }

        return rtrim($base, '/');
    }
}

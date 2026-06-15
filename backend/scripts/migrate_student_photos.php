<?php

declare(strict_types=1);

/**
 * scripts/migrate_student_photos.php
 * ─────────────────────────────────────────────────────────────────────────
 * Migrates legacy student profile photos into the file-server and rewrites
 * `student.photo` to the new file-server UUID, so photos render everywhere
 * (ID cards, student profiles, the public verify page) through the normal
 * `/api/students/:id/photo` path.
 *
 * Why this exists:
 *   Photos imported from the old curac system are stored as relative paths
 *   (e.g. "documents/std_photo/<file>.jpeg"). The actual image files live on
 *   the OLD server's disk — they were never copied into the new file-server,
 *   so `FileServerClient::download()` 404s for them. This script re-hosts each
 *   legacy file and updates the reference.
 *
 * Two passes, run in order:
 *   A) Backfill — students with no usable photo whose linked applicant_profile
 *      already has a file-server `profile_photo_id` get that id copied across
 *      (pure DB, no files needed).
 *   B) Re-host — students whose photo is a legacy path/filename have the file
 *      located (from a source dir or URL), uploaded to the file-server, and
 *      their `student.photo` set to the returned UUID.
 *
 * Idempotent: a photo that is already a file-server UUID is skipped, so the
 * script is safe to re-run on any database and resumes where it left off.
 *
 * Where the legacy files come from — set ONE of these (env or .env):
 *   LEGACY_PHOTO_SOURCE_DIR  Absolute path to the folder that CONTAINS the
 *                            stored relative paths, e.g. if photos are
 *                            "documents/std_photo/x.jpg" and they live under
 *                            /var/www/curac/documents/std_photo/x.jpg then set
 *                            LEGACY_PHOTO_SOURCE_DIR=/var/www/curac
 *   LEGACY_PHOTO_BASE_URL    HTTP base serving the same paths, e.g.
 *                            https://old.cur.ac.rw  (file at <base>/<photo>)
 *
 * Usage:
 *   php scripts/migrate_student_photos.php --dry-run     # report only, no writes
 *   php scripts/migrate_student_photos.php               # perform the migration
 *   php scripts/migrate_student_photos.php --limit=200   # process at most N students
 *   php scripts/migrate_student_photos.php --backfill-only
 *   php scripts/migrate_student_photos.php --rehost-only
 * ─────────────────────────────────────────────────────────────────────────
 */

require __DIR__ . '/../vendor/autoload.php';
if (file_exists(__DIR__ . '/../.env')) {
    (Dotenv\Dotenv::createImmutable(__DIR__ . '/..'))->load();
}

use App\Helpers\FileServerClient;

$args        = $argv ?? [];
$dryRun      = in_array('--dry-run', $args, true);
$backfillOnly = in_array('--backfill-only', $args, true);
$rehostOnly   = in_array('--rehost-only', $args, true);
$limit        = 0;
foreach ($args as $a) {
    if (preg_match('/^--limit=(\d+)$/', $a, $m)) $limit = (int) $m[1];
}

$dbHost = $_ENV['DB_HOST']     ?? '127.0.0.1';
$dbPort = $_ENV['DB_PORT']     ?? 8889;
$dbName = $_ENV['DB_DATABASE'] ?? 'cur_mis';
$dbUser = $_ENV['DB_USERNAME'] ?? 'root';
$dbPass = $_ENV['DB_PASSWORD'] ?? 'root';

$pdo = new PDO(
    "mysql:host=$dbHost;port=$dbPort;dbname=$dbName;charset=utf8mb4",
    $dbUser, $dbPass,
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
);

$sourceDir = rtrim((string) ($_ENV['LEGACY_PHOTO_SOURCE_DIR'] ?? getenv('LEGACY_PHOTO_SOURCE_DIR') ?: ''), '/');
$baseUrl   = rtrim((string) ($_ENV['LEGACY_PHOTO_BASE_URL']   ?? getenv('LEGACY_PHOTO_BASE_URL')   ?: ''), '/');

$isUuid = static fn (string $v): bool =>
    (bool) preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $v);

echo "── Student photo migration ──────────────────────────────────────────\n";
echo "DB:           {$dbName}\n";
echo "Mode:         " . ($dryRun ? 'DRY RUN (no writes)' : 'LIVE') . "\n";
echo "Source dir:   " . ($sourceDir ?: '(none)') . "\n";
echo "Source URL:   " . ($baseUrl ?: '(none)') . "\n";
echo "─────────────────────────────────────────────────────────────────────\n\n";

$client = new FileServerClient();

/* ── Pass A: backfill from applicant_profiles.profile_photo_id ───────────── */
$backfilled = 0;
if (!$rehostOnly) {
    echo "Pass A — backfill from applicant_profiles.profile_photo_id\n";
    // student links to applicant_profiles via user_id (student.user_id added in
    // migration 048). Only fill when the student has no usable UUID photo yet.
    $rows = $pdo->query(
        "SELECT s.id, s.photo AS cur, ap.profile_photo_id AS pid
         FROM student s
         JOIN applicant_profiles ap ON ap.user_id = s.user_id
         WHERE ap.profile_photo_id IS NOT NULL AND ap.profile_photo_id <> ''
           AND (s.photo IS NULL OR s.photo = '' OR s.photo LIKE '%/%')"
    )->fetchAll(PDO::FETCH_ASSOC);

    foreach ($rows as $r) {
        if ($isUuid((string) ($r['cur'] ?? ''))) continue;
        echo "  student {$r['id']}: photo <- profile {$r['pid']}\n";
        if (!$dryRun) {
            $pdo->prepare("UPDATE student SET photo = ? WHERE id = ?")->execute([$r['pid'], $r['id']]);
        }
        $backfilled++;
    }
    echo "  backfilled: {$backfilled}\n\n";
}

/* ── Pass B: re-host legacy file-path photos into the file-server ────────── */
$rehosted = $skipped = $missing = $failed = 0;
if (!$backfillOnly) {
    echo "Pass B — re-host legacy photo files\n";

    if ($sourceDir === '' && $baseUrl === '') {
        echo "  ⚠ No LEGACY_PHOTO_SOURCE_DIR or LEGACY_PHOTO_BASE_URL set — cannot\n";
        echo "    locate the legacy files. Set one and re-run on the host that has\n";
        echo "    the old documents/std_photo folder (or serves it over HTTP).\n\n";
    } else {
        $stmt = $pdo->query(
            "SELECT id, photo FROM student
             WHERE photo IS NOT NULL AND photo <> ''
             ORDER BY id ASC"
        );
        $count = 0;
        foreach ($stmt as $row) {
            $photo = (string) $row['photo'];
            if ($isUuid($photo)) { $skipped++; continue; }

            if ($limit > 0 && $count >= $limit) break;
            $count++;

            $bytes = resolveLegacyBytes($photo, $sourceDir, $baseUrl);
            if ($bytes === null) {
                $missing++;
                echo "  student {$row['id']}: SOURCE MISSING ({$photo})\n";
                continue;
            }

            if ($dryRun) {
                echo "  student {$row['id']}: would re-host (" . strlen($bytes) . " bytes)\n";
                $rehosted++;
                continue;
            }

            try {
                $tmp = tempnam(sys_get_temp_dir(), 'stdphoto_');
                file_put_contents($tmp, $bytes);
                $name = basename($photo) ?: ('photo-' . $row['id']);
                $uploaded = $client->upload([
                    'tmp_name' => $tmp,
                    'name'     => $name,
                    'size'     => strlen($bytes),
                    'error'    => UPLOAD_ERR_OK,
                ]);
                @unlink($tmp);

                $pdo->prepare("UPDATE student SET photo = ? WHERE id = ?")
                    ->execute([$uploaded['id'], $row['id']]);
                $rehosted++;
                if ($rehosted % 50 === 0) echo "  …{$rehosted} re-hosted\n";
            } catch (\Throwable $e) {
                @unlink($tmp ?? '');
                $failed++;
                echo "  student {$row['id']}: FAILED — {$e->getMessage()}\n";
            }
        }
    }
}

echo "\n── Summary ──────────────────────────────────────────────────────────\n";
echo "Backfilled (profile_photo_id): {$backfilled}\n";
echo "Re-hosted (legacy files):      {$rehosted}\n";
echo "Skipped (already file-server): {$skipped}\n";
echo "Source missing:                {$missing}\n";
echo "Failed uploads:                {$failed}\n";
echo ($dryRun ? "(dry run — nothing was written)\n" : "Done.\n");

/**
 * Locate the bytes for a legacy photo reference from the configured dir / URL.
 */
function resolveLegacyBytes(string $photo, string $sourceDir, string $baseUrl): ?string
{
    $rel  = ltrim($photo, '/');
    $base = basename($rel);
    $tries = [];

    if ($sourceDir !== '') {
        $tries[] = $sourceDir . '/' . $rel;   // <dir>/documents/std_photo/x.jpg
        $tries[] = $sourceDir . '/' . $base;  // <dir>/x.jpg  (dir points at the folder)
    }
    if ($baseUrl !== '') {
        $tries[] = $baseUrl . '/' . rawurlencode_path($rel);
    }

    foreach ($tries as $src) {
        $bytes = @file_get_contents($src, false, stream_context_create(['http' => ['timeout' => 8]]));
        if ($bytes !== false && strlen($bytes) > 100) {
            return $bytes;
        }
    }
    return null;
}

/** URL-encode each path segment but keep the slashes. */
function rawurlencode_path(string $path): string
{
    return implode('/', array_map('rawurlencode', explode('/', $path)));
}

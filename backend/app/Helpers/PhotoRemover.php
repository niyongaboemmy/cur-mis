<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Shared logic for clearing a profile picture.
 *
 * Four endpoints can remove a photo (own account, own student record, a student
 * record as an administrator, and an applicant profile). They must all behave
 * identically, so the rules live here rather than being reimplemented per
 * controller:
 *
 *  - Removal is idempotent. Clearing an already-empty photo is a success, not a
 *    404 — the caller asked for "no photo" and that is the end state either way.
 *    This also makes a double-click harmless.
 *
 *  - The database reference is cleared FIRST, and only then is the stored file
 *    deleted. If the storage call fails we are left with an orphaned blob, which
 *    is harmless; the reverse order risks a record pointing at a file that no
 *    longer exists, which renders as a broken image.
 *
 *  - Storage deletion is best-effort. The user's intent (remove my picture) has
 *    already been satisfied by clearing the reference, so a storage outage must
 *    not fail the request.
 *
 *  - Legacy photo values are never sent to the storage service. Older records
 *    hold a filesystem path from the previous system (e.g.
 *    "documents/std_photo/photo_x.jpg") rather than a storage UUID. Those files
 *    belong to the legacy store and are shared/immutable as far as this app is
 *    concerned, so we clear the reference and leave the file alone.
 */
final class PhotoRemover
{
    /**
     * @param  string|null $photo Current value of the record's photo column.
     * @return bool True when a stored file was actually deleted.
     */
    public static function discard(?string $photo): bool
    {
        $photo = trim((string)$photo);
        if ($photo === '' || !PhotoHelper::isUuid($photo)) {
            return false;
        }

        try {
            return (new FileServerClient())->delete($photo);
        } catch (\Throwable $e) {
            // Best effort: the reference is already gone, so the user sees the
            // result they asked for. Log it so orphans can be reclaimed later.
            error_log('[PhotoRemover] could not delete stored file ' . $photo . ': ' . $e->getMessage());
            return false;
        }
    }
}

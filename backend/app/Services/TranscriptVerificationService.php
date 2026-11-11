<?php

declare(strict_types=1);

namespace App\Services;

use App\Helpers\FrontendUrl;
use App\Helpers\TranscriptPdf;
use Core\Database;
use Core\Request;

/**
 * Verification codes for issued transcripts (`transcript_verifications`).
 *
 * Issuing a transcript PDF records what it prints under a random code; every
 * sheet carries a QR code opening /verify/transcript?code=….
 * The public verification page reads the record back with {@see find()}.
 */
final class TranscriptVerificationService
{
    /** No 0/O or 1/I, so a code read off paper cannot be mistyped between them. */
    private const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

    /**
     * Record the transcript about to be printed and return what the PDF needs
     * to carry. The same content issued again on the same day reuses its code.
     *
     * Returns null when the record cannot be written (e.g. the migration has not
     * run on this server): the transcript then prints without a QR code rather
     * than not printing at all.
     *
     * @param  array<string,mixed>            $student
     * @param  array<int,array<string,mixed>> $rows
     * @return array{code:string,url:string,issued_on:string}|null
     */
    public static function issue(array $student, array $rows, ?int $issuedBy, ?Request $request = null): ?array
    {
        try {
            $snapshot = TranscriptPdf::snapshot($student, $rows);
            $json     = (string)json_encode($snapshot, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            $hash     = hash('sha256', $json);
            $reg      = (string)$snapshot['student']['regnumber'];
            $issuedOn = date('Y-m-d');
            $db       = Database::getInstance();

            $existing = $db->fetchOne(
                'SELECT code FROM transcript_verifications
                  WHERE regnumber = ? AND content_hash = ? AND issued_on = ? LIMIT 1',
                [$reg, $hash, $issuedOn]
            );
            $code = $existing ? (string)$existing['code'] : null;

            // A collision on 80 random bits is not expected; retry anyway rather than fail.
            for ($i = 0; $code === null && $i < 5; $i++) {
                $candidate = self::newCode();
                try {
                    $db->execute(
                        'INSERT INTO transcript_verifications
                            (code, regnumber, content_hash, snapshot, issued_on, issued_by)
                         VALUES (?, ?, ?, ?, ?, ?)',
                        [$candidate, $reg, $hash, $json, $issuedOn, $issuedBy]
                    );
                    $code = $candidate;
                } catch (\PDOException $e) {
                    if ((int)($e->errorInfo[1] ?? 0) !== 1062) {
                        throw $e;
                    }
                }
            }
            if ($code === null) {
                return null;
            }

            return [
                'code'      => $code,
                'url'       => FrontendUrl::base($request) . '/verify/transcript?code=' . rawurlencode($code),
                'issued_on' => $issuedOn,
            ];
        } catch (\Throwable $e) {
            error_log('[TranscriptVerification] could not record transcript: ' . $e->getMessage());
            return null;
        }
    }

    /**
     * The issued transcript a code refers to, or null. `superseded_on` is the
     * date a later transcript with different content was issued for the same
     * student — i.e. the results changed after this copy was printed.
     *
     * @return array<string,mixed>|null
     */
    public static function find(string $code): ?array
    {
        $code = self::normalize($code);
        if ($code === null) {
            return null;
        }

        $db  = Database::getInstance();
        $row = $db->fetchOne(
            'SELECT code, regnumber, content_hash, snapshot, issued_on, issued_at
               FROM transcript_verifications WHERE code = ? LIMIT 1',
            [$code]
        );
        if (!$row) {
            return null;
        }

        $newer = $db->fetchOne(
            'SELECT issued_on FROM transcript_verifications
              WHERE regnumber = ? AND issued_at > ? AND content_hash <> ?
              ORDER BY issued_at DESC LIMIT 1',
            [$row['regnumber'], $row['issued_at'], $row['content_hash']]
        );

        return [
            'code'          => $row['code'],
            'issued_on'     => $row['issued_on'],
            'superseded_on' => $newer ? $newer['issued_on'] : null,
            'snapshot'      => json_decode((string)$row['snapshot'], true) ?: [],
        ];
    }

    /** "7k3q 9xwm-2pld ht8r" → "7K3Q-9XWM-2PLD-HT8R"; null when it cannot be a code. */
    private static function normalize(string $code): ?string
    {
        $raw = strtoupper((string)preg_replace('/[^A-Za-z0-9]/', '', $code));
        if (strlen($raw) !== 16 || strspn($raw, self::ALPHABET) !== 16) {
            return null;
        }
        return implode('-', str_split($raw, 4));
    }

    private static function newCode(): string
    {
        $raw = '';
        for ($i = 0; $i < 16; $i++) {
            $raw .= self::ALPHABET[random_int(0, strlen(self::ALPHABET) - 1)];
        }
        return implode('-', str_split($raw, 4));
    }
}

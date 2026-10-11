<?php

declare(strict_types=1);

namespace App\Services;

use Core\Database;

/**
 * Device-level notifications (Web Push, RFC 8030) for installed CUR-MIS apps.
 *
 * This is what makes a notification reach someone whose app is closed, the
 * same way WhatsApp does. The browser keeps a push subscription per device;
 * we encrypt each message to that device's key (RFC 8291, aes128gcm) and sign
 * the request with our VAPID key (RFC 8292) so only this server can push.
 *
 * Implemented directly on OpenSSL rather than a Composer package: the backend
 * runs PHP 8.0 and this keeps the dependency set unchanged. Correctness is
 * pinned by scripts/tests/webpush_vector_test.php against the RFC's own vector.
 *
 * Best-effort, like NotificationService: a failed push never fails the action
 * that triggered it, and the in-app notification row is still the source of
 * truth — a device that misses a push sees it on its next bell refresh.
 *
 * Configuration (.env):
 *   VAPID_PUBLIC_KEY       base64url uncompressed P-256 point (65 bytes)
 *   VAPID_PRIVATE_KEY_PEM  base64 of the PEM private key (single line)
 *   VAPID_SUBJECT          mailto:… or https:… contact for the push service
 * Generate with: php scripts/generate_vapid_keys.php
 */
class WebPushService
{
    private const RECORD_SIZE = 4096;
    private const BATCH_SIZE  = 50;
    private const TTL_SECONDS = 86400;

    /** @var \OpenSSLAsymmetricKey|false|null */
    private static $vapidPrivate = null;

    public static function isConfigured(): bool
    {
        return self::publicKey() !== '' && self::envValue('VAPID_PRIVATE_KEY_PEM') !== '';
    }

    public static function publicKey(): string
    {
        return self::envValue('VAPID_PUBLIC_KEY');
    }

    /**
     * Deliver $payload to every registered device of $userIds.
     *
     * The payload is JSON-encoded per device with a `badge` field holding that
     * user's unread count, so the installed app's icon badge stays accurate.
     * Devices the push service reports as gone (404/410) are forgotten.
     *
     * @param int[] $userIds
     * @param array<string,mixed> $payload title, body, url, tag
     * @return int how many devices accepted the message
     */
    public static function sendToUsers(array $userIds, array $payload): int
    {
        if (!self::isConfigured()) {
            return 0;
        }

        $userIds = array_values(array_unique(array_filter(array_map('intval', $userIds), static fn(int $id): bool => $id > 0)));
        if ($userIds === []) {
            return 0;
        }

        try {
            $db = Database::getInstance();
            $ph = implode(',', array_fill(0, count($userIds), '?'));

            $subs = $db->fetchAll(
                "SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id IN ({$ph})",
                $userIds
            );
            if ($subs === []) {
                return 0;
            }

            $badges = [];
            foreach ($db->fetchAll(
                "SELECT user_id, COUNT(*) AS c FROM notifications WHERE is_read = 0 AND user_id IN ({$ph}) GROUP BY user_id",
                $userIds
            ) as $row) {
                $badges[(int) $row['user_id']] = (int) $row['c'];
            }
        } catch (\Throwable $e) {
            error_log('[WebPush] subscription lookup failed: ' . $e->getMessage());
            return 0;
        }

        $delivered = 0;
        foreach (array_chunk($subs, self::BATCH_SIZE) as $chunk) {
            $delivered += self::deliverChunk($chunk, $payload, $badges);
        }
        return $delivered;
    }

    /**
     * Send one chunk in parallel. Requests run concurrently so a fan-out to
     * many devices costs one round trip per chunk, not one per device.
     *
     * @param array<int,array<string,mixed>> $subs
     * @param array<string,mixed> $payload
     * @param array<int,int> $badges
     */
    private static function deliverChunk(array $subs, array $payload, array $badges): int
    {
        $mh   = curl_multi_init();
        $jobs = [];

        foreach ($subs as $sub) {
            try {
                $body = self::encrypt(
                    (string) json_encode(array_merge($payload, ['badge' => $badges[(int) $sub['user_id']] ?? 0]), JSON_UNESCAPED_UNICODE),
                    self::b64urlDecode((string) $sub['p256dh']),
                    self::b64urlDecode((string) $sub['auth'])
                );
                $auth = self::vapidAuthorization((string) $sub['endpoint']);
            } catch (\Throwable $e) {
                error_log('[WebPush] could not encrypt for subscription ' . $sub['id'] . ': ' . $e->getMessage());
                continue;
            }

            $ch = curl_init((string) $sub['endpoint']);
            curl_setopt_array($ch, [
                CURLOPT_POST           => true,
                CURLOPT_POSTFIELDS     => $body,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_CONNECTTIMEOUT => 3,
                CURLOPT_TIMEOUT        => 5,
                CURLOPT_HTTPHEADER     => [
                    'Content-Type: application/octet-stream',
                    'Content-Encoding: aes128gcm',
                    'Content-Length: ' . strlen($body),
                    'TTL: ' . self::TTL_SECONDS,
                    'Urgency: normal',
                    'Authorization: ' . $auth,
                ],
            ]);
            curl_multi_add_handle($mh, $ch);
            $jobs[] = ['ch' => $ch, 'id' => (int) $sub['id']];
        }

        do {
            $status = curl_multi_exec($mh, $running);
            if ($running) {
                curl_multi_select($mh, 1.0);
            }
        } while ($running && $status === CURLM_OK);

        $delivered = 0;
        foreach ($jobs as $job) {
            $code = (int) curl_getinfo($job['ch'], CURLINFO_HTTP_CODE);
            if ($code >= 200 && $code < 300) {
                $delivered++;
            } elseif ($code === 404 || $code === 410) {
                self::forget($job['id']);
            } else {
                error_log(sprintf('[WebPush] subscription %d rejected with HTTP %d.', $job['id'], $code));
            }
            curl_multi_remove_handle($mh, $job['ch']);
            curl_close($job['ch']);
        }
        curl_multi_close($mh);

        return $delivered;
    }

    private static function forget(int $subscriptionId): void
    {
        try {
            Database::getInstance()->execute('DELETE FROM push_subscriptions WHERE id = ?', [$subscriptionId]);
        } catch (\Throwable $e) {
            error_log('[WebPush] could not remove dead subscription: ' . $e->getMessage());
        }
    }

    // ── RFC 8291: message encryption (aes128gcm) ─────────────────────────────

    /**
     * Encrypt $plaintext for one device with a fresh ephemeral key and salt.
     *
     * @param string $uaPublic  the device's public key, 65 raw bytes
     * @param string $authSecret the device's auth secret, 16 raw bytes
     */
    public static function encrypt(string $plaintext, string $uaPublic, string $authSecret): string
    {
        $asPrivate = openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]);
        if ($asPrivate === false) {
            throw new \RuntimeException('Could not generate an ephemeral key pair.');
        }

        return self::encryptWithKeys($plaintext, $uaPublic, $authSecret, $asPrivate, random_bytes(16));
    }

    /**
     * Encryption with the ephemeral key and salt supplied. Separate from
     * encrypt() so the RFC 8291 test vector can be reproduced exactly.
     *
     * @param \OpenSSLAsymmetricKey $asPrivate the application server's ephemeral key
     * @return string the complete aes128gcm body: header followed by ciphertext
     */
    public static function encryptWithKeys(
        string $plaintext,
        string $uaPublic,
        string $authSecret,
        $asPrivate,
        string $salt
    ): string {
        if (strlen($uaPublic) !== 65 || $uaPublic[0] !== "\x04") {
            throw new \InvalidArgumentException('Subscription p256dh must be an uncompressed 65-byte point.');
        }
        if (strlen($authSecret) !== 16) {
            throw new \InvalidArgumentException('Subscription auth secret must be 16 bytes.');
        }
        // One record, so the 0x02 "last record" delimiter follows the plaintext.
        if (strlen($plaintext) > self::RECORD_SIZE - 17) {
            throw new \InvalidArgumentException('Payload too large for a single push record.');
        }

        $details  = openssl_pkey_get_details($asPrivate);
        $asPublic = "\x04"
            . str_pad((string) $details['ec']['x'], 32, "\0", STR_PAD_LEFT)
            . str_pad((string) $details['ec']['y'], 32, "\0", STR_PAD_LEFT);

        $uaKey = openssl_pkey_get_public(self::spkiPem($uaPublic));
        $ecdh  = openssl_pkey_derive($uaKey, $asPrivate, 32);
        if ($ecdh === false) {
            throw new \RuntimeException('ECDH key agreement failed.');
        }

        $keyInfo = "WebPush: info\0" . $uaPublic . $asPublic;
        $ikm     = hash_hkdf('sha256', $ecdh, 32, $keyInfo, $authSecret);
        $cek     = hash_hkdf('sha256', $ikm, 16, "Content-Encoding: aes128gcm\0", $salt);
        $nonce   = hash_hkdf('sha256', $ikm, 12, "Content-Encoding: nonce\0", $salt);

        $tag        = '';
        $ciphertext = openssl_encrypt($plaintext . "\x02", 'aes-128-gcm', $cek, OPENSSL_RAW_DATA, $nonce, $tag, '', 16);
        if ($ciphertext === false) {
            throw new \RuntimeException('AES-GCM encryption failed.');
        }

        // Header: salt(16) | record size(4, big-endian) | key id length(1) | key id = as_public
        return $salt . pack('N', self::RECORD_SIZE) . chr(strlen($asPublic)) . $asPublic . $ciphertext . $tag;
    }

    // ── RFC 8292: VAPID authorization ────────────────────────────────────────

    /** Authorization header proving this server is the one that owns the VAPID key. */
    public static function vapidAuthorization(string $endpoint): string
    {
        $parts    = parse_url($endpoint);
        $audience = ($parts['scheme'] ?? 'https') . '://' . ($parts['host'] ?? '');

        $header = self::b64urlEncode((string) json_encode(['typ' => 'JWT', 'alg' => 'ES256']));
        $claims = self::b64urlEncode((string) json_encode([
            'aud' => $audience,
            'exp' => time() + 12 * 3600,
            'sub' => self::envValue('VAPID_SUBJECT') ?: 'mailto:admin@cur.ac.rw',
        ]));
        $input = $header . '.' . $claims;

        if (!openssl_sign($input, $der, self::vapidPrivateKey(), OPENSSL_ALGO_SHA256)) {
            throw new \RuntimeException('VAPID signing failed.');
        }

        return 'vapid t=' . $input . '.' . self::b64urlEncode(self::derToRawSignature($der))
            . ', k=' . self::publicKey();
    }

    /** @return \OpenSSLAsymmetricKey */
    private static function vapidPrivateKey()
    {
        if (self::$vapidPrivate === null) {
            $pem = base64_decode(self::envValue('VAPID_PRIVATE_KEY_PEM'), true);
            self::$vapidPrivate = $pem === false ? false : openssl_pkey_get_private($pem);
        }
        if (self::$vapidPrivate === false) {
            throw new \RuntimeException('VAPID_PRIVATE_KEY_PEM is not a valid key.');
        }
        return self::$vapidPrivate;
    }

    /** OpenSSL signs in DER; JWS ES256 needs the raw 64-byte r || s. */
    private static function derToRawSignature(string $der): string
    {
        $rLen = ord($der[3]);
        $r    = substr($der, 4, $rLen);
        $s    = substr($der, 4 + $rLen + 2, ord($der[5 + $rLen]));

        return str_pad(ltrim($r, "\0"), 32, "\0", STR_PAD_LEFT)
            . str_pad(ltrim($s, "\0"), 32, "\0", STR_PAD_LEFT);
    }

    // ── Key helpers ──────────────────────────────────────────────────────────

    /** Wrap a raw P-256 public point in SubjectPublicKeyInfo PEM so OpenSSL can read it. */
    private static function spkiPem(string $rawPoint): string
    {
        $prefix = hex2bin('3059301306072a8648ce3d020106082a8648ce3d030107034200');
        return "-----BEGIN PUBLIC KEY-----\n"
            . chunk_split(base64_encode($prefix . $rawPoint), 64, "\n")
            . "-----END PUBLIC KEY-----\n";
    }

    private static function envValue(string $key): string
    {
        return trim((string) ($_ENV[$key] ?? getenv($key) ?: ''));
    }

    public static function b64urlEncode(string $raw): string
    {
        return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
    }

    public static function b64urlDecode(string $encoded): string
    {
        $decoded = base64_decode(strtr($encoded, '-_', '+/') . str_repeat('=', (4 - strlen($encoded) % 4) % 4), true);
        return $decoded === false ? '' : $decoded;
    }
}

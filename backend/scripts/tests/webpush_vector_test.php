<?php

/**
 * Verifies WebPushService's RFC 8291 encryption against the RFC's own
 * Appendix A test vector. If this passes, a push service will accept and
 * decrypt our messages; if it fails, do not ship.
 *
 * Run: php scripts/tests/webpush_vector_test.php
 */

declare(strict_types=1);

// Load the service directly: this test needs no Composer packages or database.
require __DIR__ . '/../../app/Services/WebPushService.php';

use App\Services\WebPushService;

$b64 = static fn(string $s): string => WebPushService::b64urlDecode($s);
$strip = static fn(string $s): string => preg_replace('/\s+/', '', $s);

// Inputs from RFC 8291 Appendix A (whitespace removed from the RFC's line breaks).
$plaintext = 'When I grow up, I want to be a watermelon';
$uaPublic  = $b64($strip('BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4'));
$authSecret = $b64('BTBZMqHH6r4Tts7J_aSIgg');
$salt      = $b64('DGv6ra1nlYgDCS1FRnbzlw');
$asPublic  = $b64($strip('BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8'));
$asPrivateD = $b64('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw');

// Expected output: 86-byte header followed by the AES-GCM ciphertext and tag.
// The RFC prints header and ciphertext as separate base64url strings, so each
// is decoded on its own and the raw bytes joined.
$expectedHeader = $b64($strip(
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml'
    . 'mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8'
));
$expectedCiphertext = $b64($strip(
    '8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEs'
    . 'bI_0LpXMuGvnzQ'
));
$expected = $expectedHeader . $expectedCiphertext;

// Rebuild the ephemeral private key from its scalar and public point (SEC1 DER → PEM).
$der = hex2bin('30770201010420') . $asPrivateD
    . hex2bin('a00a06082a8648ce3d030107')
    . hex2bin('a144034200') . $asPublic;
$asPrivate = openssl_pkey_get_private(
    "-----BEGIN EC PRIVATE KEY-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END EC PRIVATE KEY-----\n"
);
if ($asPrivate === false) {
    fwrite(STDERR, "FAIL: could not load the RFC ephemeral key\n");
    exit(1);
}

$actual = WebPushService::encryptWithKeys($plaintext, $uaPublic, $authSecret, $asPrivate, $salt);

if (strlen($expected) !== strlen($actual) || !hash_equals($expected, $actual)) {
    fwrite(STDERR, sprintf(
        "FAIL: encrypted body does not match RFC 8291 (expected %d bytes, got %d)\n",
        strlen($expected),
        strlen($actual)
    ));
    fwrite(STDERR, 'expected: ' . bin2hex($expected) . "\n");
    fwrite(STDERR, 'actual:   ' . bin2hex($actual) . "\n");
    exit(1);
}

echo "PASS: encryption matches the RFC 8291 test vector (" . strlen($actual) . " bytes).\n";

<?php

/**
 * Generates the VAPID key pair used to sign Web Push requests.
 *
 * Run once per environment and store the output in that environment's .env.
 * Never commit the private key, and do not regenerate it on a live system:
 * every device subscribed under the old public key stops receiving pushes.
 *
 *   php scripts/generate_vapid_keys.php
 */

declare(strict_types=1);

$key = openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]);
if ($key === false) {
    fwrite(STDERR, "Could not generate an EC key pair. Check the OpenSSL configuration.\n");
    exit(1);
}

openssl_pkey_export($key, $pem);
$details = openssl_pkey_get_details($key);

// Uncompressed point: 0x04 || X || Y, base64url-encoded as the browser expects.
$point = "\x04"
    . str_pad((string) $details['ec']['x'], 32, "\0", STR_PAD_LEFT)
    . str_pad((string) $details['ec']['y'], 32, "\0", STR_PAD_LEFT);
$publicKey = rtrim(strtr(base64_encode($point), '+/', '-_'), '=');

echo "VAPID_PUBLIC_KEY={$publicKey}\n";
echo 'VAPID_PRIVATE_KEY_PEM=' . base64_encode($pem) . "\n";
echo "VAPID_SUBJECT=mailto:admin@cur.ac.rw\n";

<?php

declare(strict_types=1);

namespace App\Helpers;

use chillerlan\QRCode\QRCode;
use chillerlan\QRCode\QROptions;

/**
 * QR codes for printed documents (student ID cards, transcripts), rendered as
 * self-contained data URIs so DOMPDF embeds them without fetching anything.
 */
final class QrImage
{
    /**
     * Constant names matter here and are version-specific: chillerlan/php-qrcode
     * v4 (what composer.lock pins, 4.4.2) puts the output modes on QRCode as
     * OUTPUT_IMAGE_PNG / OUTPUT_MARKUP_SVG and base64-encodes via `imageBase64`.
     * QROutputInterface::GDIMAGE_PNG and `outputBase64` are the v5 spellings —
     * referencing them on v4 raises an Error, which once printed every ID card
     * with an empty QR panel and no complaint. Failures are logged, never
     * swallowed, so the next breakage is visible.
     *
     * @return string|null data URI, or null when rendering failed
     */
    public static function dataUri(string $content, int $scale = 5): ?string
    {
        try {
            $opts = new QROptions([
                'outputType'  => extension_loaded('gd')
                    ? QRCode::OUTPUT_IMAGE_PNG
                    : QRCode::OUTPUT_MARKUP_SVG,
                'imageBase64' => true,
                'scale'       => $scale,
                'eccLevel'    => QRCode::ECC_M,
            ]);
            return (new QRCode($opts))->render($content);
        } catch (\Throwable $e) {
            error_log('[QrImage] QR render failed: ' . $e->getMessage());
            return null;
        }
    }
}

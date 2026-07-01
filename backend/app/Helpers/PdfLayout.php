<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Shared CUR letterhead for every official PDF document.
 *
 * The letterhead must appear at the top of EVERY page of a multi-page document
 * (transcripts, completed-module reports, attendance rosters). DOMPDF's CSS
 * `position: fixed` does not reliably repeat across pages, so instead each
 * document:
 *
 *   1. reserves vertical room on every page with {@see pageCss()} (an `@page`
 *      top margin), and
 *   2. after rendering, paints the letterhead into that reserved band on every
 *      page with {@see stampHeader()}, which uses DOMPDF's canvas page-script.
 *
 * The header image is the official letterhead bar at
 * `template_docs/header_bar.jpeg` (1600 × 259). When that asset is missing a
 * plain-text letterhead is drawn instead.
 */
final class PdfLayout
{
    /** Vertical band (px) reserved at the top of every page for the letterhead. */
    public const HEADER_SPACE = 180;

    /** Aspect ratio (width / height) of header_bar.jpeg — 1600 / 259. */
    private const IMG_RATIO = 6.1776;

    /** Letterhead geometry in PDF points (1pt = 1/72in). */
    private const SIDE_PT = 36.0;
    private const TOP_PT  = 18.0;

    private static ?string $cachedPath = null;
    private static bool $resolved = false;

    /** Absolute path to the letterhead JPEG, or null when the asset is missing. */
    public static function headerImagePath(): ?string
    {
        if (!self::$resolved) {
            self::$resolved = true;
            $path = dirname(__DIR__, 3) . '/template_docs/header_bar.jpeg';
            self::$cachedPath = is_file($path) ? $path : null;
        }
        return self::$cachedPath;
    }

    /**
     * Placeholder kept for documents that still interpolate `{$header}` in their
     * markup. The real letterhead is painted on the canvas by {@see stampHeader()},
     * so this intentionally returns an empty string to avoid a duplicate header.
     */
    public static function headerHtml(): string
    {
        return '';
    }

    /**
     * `@page` margins for a document. The top margin reserves space for the letterhead
     * header to display without overlapping content. All documents now use a standardized
     * width of 6.5 inches to match the degree certificate format.
     */
    public static function pageCss(int $side = 40, int $bottom = 40): string
    {
        $top = self::HEADER_SPACE;
        return "@page { margin: {$top}px {$side}px {$bottom}px {$side}px; size: 8.5in 11in; }
                body { width: 6.5in; margin: 0 auto; }";
    }

    /**
     * Paint the letterhead onto every page of an already-rendered document.
     * Call this AFTER `$dompdf->render()` and BEFORE streaming/output.
     */
    public static function stampHeader(\Dompdf\Dompdf $dompdf): void
    {
        $canvas = $dompdf->getCanvas();
        $pageW  = $canvas->get_width();
        $side   = self::SIDE_PT;
        $top    = self::TOP_PT;
        $path   = self::headerImagePath();

        if ($path !== null) {
            $imgW = $pageW - 2 * $side;
            $imgH = $imgW / self::IMG_RATIO;
            $canvas->page_script(function ($pageNumber, $pageCount, $canvas, $fontMetrics) use ($path, $side, $top, $imgW, $imgH) {
                $canvas->image($path, $side, $top, $imgW, $imgH);
            });
            return;
        }

        // Text letterhead fallback when the image asset is unavailable.
        $canvas->page_script(function ($pageNumber, $pageCount, $canvas, $fontMetrics) use ($side, $top, $pageW) {
            $navy = [0.12, 0.16, 0.36];
            $grey = [0.20, 0.20, 0.20];
            $bold = $fontMetrics->getFont('serif', 'bold');
            $reg  = $fontMetrics->getFont('serif', 'normal');
            $canvas->text($side, $top,      'CATHOLIC UNIVERSITY OF RWANDA', $bold, 15, $navy);
            $canvas->text($side, $top + 22, 'P.o Box 49 Butare/Huye - RWANDA', $reg, 9, $grey);
            $canvas->text($side, $top + 36, 'Registry: 250 733 214 677   -   Administration: 250 733 214 678', $reg, 8.5, $grey);
            $canvas->text($side, $top + 50, 'email: catholic.university.rwanda@gmail.com   |   website: www.cur.ac.rw', $reg, 8.5, $grey);
            $canvas->line($side, $top + 66, $pageW - $side, $top + 66, $navy, 1.2);
        });
    }
}

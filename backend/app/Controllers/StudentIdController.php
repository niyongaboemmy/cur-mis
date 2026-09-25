<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use Core\Database;
use App\Models\StudentIdModel;
use App\Helpers\DocumentHelper;
use App\Helpers\StudentIdCardHelper;
use App\Services\SystemLogService;

/**
 * Student ID card issuance + printable card generation.
 *
 * Cards are stored in `student_ids`; one active card per student at a time.
 * The printable card (front + back, photo + QR + barcode) is rendered via
 * StudentIdCardHelper as a PDF (or HTML preview).
 */
class StudentIdController extends BaseController
{
    private StudentIdModel $model;
    private Database        $db;

    public function __construct()
    {
        $this->model = new StudentIdModel();
        $this->db    = Database::getInstance();
    }

    // ── GET /api/student-ids ──────────────────────────────────────────────────
    /**
     * Roster of students and their current card state, for the ID-card
     * workspace. Query: page, per_page, keyword, state, campus, option_id.
     */
    public function index(Request $request, Response $response): never
    {
        $page    = max(1, (int) ($request->query('page') ?? 1));
        $perPage = max(1, min(200, (int) ($request->query('per_page') ?? 25)));

        $result = $this->model->roster([
            'keyword'   => (string) ($request->query('keyword') ?? ''),
            'state'     => (string) ($request->query('state') ?? ''),
            'campus'    => (string) ($request->query('campus') ?? ''),
            'option_id' => (int) ($request->query('option_id') ?? 0),
        ], $page, $perPage);

        $total = $result['total'];

        $this->success($response, [
            'data'       => $result['rows'],
            'pagination' => [
                'current_page' => $page,
                'per_page'     => $perPage,
                'total'        => $total,
                'last_page'    => (int) max(1, ceil($total / $perPage)),
            ],
        ], 'ID card roster fetched.');
    }

    // ── POST /api/student-ids/batch-issue ─────────────────────────────────────
    /**
     * Issue a card to several students in one action. Partial success is
     * reported per student rather than failing the whole batch — one bad id in
     * a 200-student selection should not cost the other 199 their cards.
     * Body: { student_ids: int[], validity_years?: int }
     */
    public function batchIssue(Request $request, Response $response): never
    {
        $actor = (array) $request->param('_auth_user');
        $body  = $request->body();

        $ids = array_values(array_unique(array_filter(
            array_map('intval', (array) ($body['student_ids'] ?? [])),
            fn (int $id): bool => $id > 0
        )));

        if ($ids === []) {
            $this->error($response, 'Select at least one student.', 422);
        }
        if (count($ids) > 500) {
            $this->error($response, 'Issue at most 500 cards at a time.', 422);
        }

        $years  = max(1, min(10, (int) ($body['validity_years'] ?? 4)));
        $issued = [];
        $failed = [];

        foreach ($ids as $studentId) {
            $student = $this->db->fetchOne(
                'SELECT id, regnumber FROM `student` WHERE id = ? LIMIT 1',
                [$studentId]
            );
            if (!$student) {
                $failed[] = ['student_id' => $studentId, 'reason' => 'Student not found.'];
                continue;
            }

            try {
                $barcode    = $this->generateBarcode((string) $student['regnumber']);
                $issueDate  = date('Y-m-d');
                $expiryDate = date('Y-m-d', strtotime("+{$years} years"));

                $cardId = $this->db->transaction(function () use ($studentId, $issueDate, $expiryDate, $barcode): int {
                    $this->model->deactivateAll($studentId);
                    return (int) $this->model->create([
                        'student_id'  => $studentId,
                        'issue_date'  => $issueDate,
                        'expiry_date' => $expiryDate,
                        'barcode'     => $barcode,
                        'is_active'   => 1,
                    ]);
                });

                $issued[] = ['student_id' => $studentId, 'card_id' => $cardId, 'barcode' => $barcode];
            } catch (\Throwable $e) {
                $failed[] = ['student_id' => $studentId, 'reason' => 'Could not issue a card for this student.'];
                error_log('[student-ids] batch issue failed for student ' . $studentId . ': ' . $e->getMessage());
            }
        }

        SystemLogService::log('CREATE', 'STUDENT_ID',
            'User ' . ($actor['id'] ?? '?') . ' batch-issued ' . count($issued) . ' ID card(s).',
            null, 'student_id',
            ['issued' => count($issued), 'failed' => count($failed), 'validity_years' => $years],
            $actor
        );

        $this->success($response, [
            'issued' => $issued,
            'failed' => $failed,
        ], count($failed) === 0
            ? count($issued) . ' ID card(s) issued.'
            : count($issued) . ' issued, ' . count($failed) . ' skipped.');
    }

    // ── POST /api/student-ids/issue ───────────────────────────────────────────
    /**
     * Issue (or re-issue) an ID card for a student. Deactivates any prior card.
     * Body: { student_id: int, validity_years?: int }
     */
    public function issue(Request $request, Response $response): never
    {
        $actor = (array) $request->param('_auth_user');
        $body  = $request->body();

        $studentId = (int) ($body['student_id'] ?? 0);
        if ($studentId <= 0) {
            $this->error($response, 'student_id is required.', 422);
        }

        $student = $this->db->fetchOne(
            'SELECT id, regnumber FROM `student` WHERE id = ? LIMIT 1',
            [$studentId]
        );
        if (!$student) {
            $this->error($response, 'Student not found.', 404);
        }

        $years   = max(1, min(10, (int) ($body['validity_years'] ?? 4)));
        $barcode  = $this->generateBarcode((string) $student['regnumber']);
        $issueDate  = date('Y-m-d');
        $expiryDate = date('Y-m-d', strtotime("+{$years} years"));

        $cardId = $this->db->transaction(function () use ($studentId, $issueDate, $expiryDate, $barcode): int {
            $this->model->deactivateAll($studentId);
            return (int) $this->model->create([
                'student_id'  => $studentId,
                'issue_date'  => $issueDate,
                'expiry_date' => $expiryDate,
                'barcode'     => $barcode,
                'is_active'   => 1,
            ]);
        });

        SystemLogService::log('CREATE', 'STUDENT_ID',
            "User {$actor['id']} issued ID card {$cardId} for student {$studentId}.",
            $cardId, 'student_id', ['barcode' => $barcode, 'expiry' => $expiryDate], $actor
        );

        $this->success($response, $this->model->find($cardId), 'ID card issued.', 201);
    }

    // ── GET /api/student-ids/by-student/:id ───────────────────────────────────
    /** Active card + full history for a student. */
    public function history(Request $request, Response $response): never
    {
        $studentId = (int) $request->param('id');
        $this->success($response, [
            'active'  => $this->model->activeForStudent($studentId) ?: null,
            'history' => $this->model->historyForStudent($studentId),
        ], 'ID card history fetched.');
    }

    // ── GET /api/student-ids/by-student/:id/card[?preview=1] ──────────────────
    /**
     * Render the printable card for a student's active ID.
     * `?preview=1` returns { html } JSON for an iframe; otherwise streams a PDF.
     */
    // ── GET /api/student-ids/card-sizes ───────────────────────────────────────
    /**
     * The print sizes the card renderer supports.
     *
     * Served rather than hardcoded in the UI so the list cannot drift from what
     * the renderer will actually accept — a size the dropdown offers but the
     * helper rejects would silently print at the default.
     */
    public function cardSizes(Request $request, Response $response): never
    {
        $out = [];
        foreach (StudentIdCardHelper::SIZES as $key => $spec) {
            $out[] = [
                'key'      => $key,
                'label'    => $spec['label'],
                'width_mm' => $spec['w'],
                'height_mm'=> $spec['h'],
                'default'  => $key === StudentIdCardHelper::SIZE_DEFAULT,
            ];
        }
        $this->success($response, ['sizes' => $out], 'Card sizes fetched.');
    }

    public function card(Request $request, Response $response): never
    {
        $studentId = (int) $request->param('id');
        $card = $this->model->activeForStudent($studentId);
        if (!$card) {
            $this->error($response, 'No active ID card. Issue a card first.', 404);
        }

        $student = DocumentHelper::fetchStudentData($studentId);
        if (!$student) {
            $this->error($response, 'Student not found.', 404);
        }

        $isPreview = (bool) $request->query('preview');

        // student.photo from the DB; fall back to a client-supplied value so
        // the card can still render the photo even when the DB column is null
        // (common for students imported from the legacy system without migration).
        $photo = $student['photo'] ?? null;
        if (!$photo) {
            $clientPhoto = trim((string) ($request->query('photo') ?? ''));
            if ($clientPhoto !== '') $photo = $clientPhoto;
        }

        $legacyUrl = \App\Helpers\PhotoHelper::legacyUrl($photo);

        $opts = [
            'verify_url' => $this->verifyUrl((string) $card['barcode'], $request),
            // Unknown or missing falls back to the default inside the helper,
            // so a stale bookmark prints at the standard size instead of 500ing.
            'size'       => (string) ($request->query('size') ?? ''),
        ];

        // Always try to embed as a data URI first — this is the only approach
        // that works reliably in the iframe srcDoc preview AND in PDFs.
        // If the server can't reach the legacy photo store, fall back to the
        // URL so the browser can still load the image directly.
        $dataUri = StudentIdCardHelper::resolvePhotoDataUri($photo);
        if ($dataUri !== null) {
            $opts['photo_data_uri'] = $dataUri;
        } elseif ($legacyUrl !== null) {
            $opts['photo_url'] = $legacyUrl;
        }

        $html = StudentIdCardHelper::buildHtml($student, $card, $opts);

        if ($isPreview) {
            $this->success($response, ['html' => $html], 'Preview generated.');
        }

        $reg = preg_replace('/[^A-Za-z0-9_-]/', '', (string) ($student['regnumber'] ?? "s{$studentId}"));
        StudentIdCardHelper::stream($html, "id-card-{$reg}.pdf");
    }

    // ── POST /api/student-ids/batch-print ─────────────────────────────────────
    /**
     * Stream one PDF holding the active cards of every selected student.
     * Students with no active card are skipped rather than failing the batch.
     * Body: { student_ids: int[] }
     */
    public function batchPrint(Request $request, Response $response): never
    {
        $body = $request->body();
        // One size applies to the whole run — a sheet of mixed-size cards is
        // not something anyone wants to cut out.
        $batchSize = (string) ($body['size'] ?? '');

        $ids = array_values(array_unique(array_filter(
            array_map('intval', (array) ($body['student_ids'] ?? [])),
            fn (int $id): bool => $id > 0
        )));

        if ($ids === []) {
            $this->error($response, 'Select at least one student.', 422);
        }
        if (count($ids) > 200) {
            $this->error($response, 'Print at most 200 cards at a time.', 422);
        }

        $verifyBase = null;
        $items      = [];

        foreach ($ids as $studentId) {
            $card = $this->model->activeForStudent($studentId);
            if (!$card) {
                continue;
            }

            $student = DocumentHelper::fetchStudentData($studentId);
            if (!$student) {
                continue;
            }

            $opts = [
                'verify_url' => $this->verifyUrl((string) $card['barcode'], $request),
                'size'       => $batchSize,
            ];

            $dataUri = StudentIdCardHelper::resolvePhotoDataUri($student['photo'] ?? null);
            if ($dataUri !== null) {
                $opts['photo_data_uri'] = $dataUri;
            } else {
                $legacyUrl = \App\Helpers\PhotoHelper::legacyUrl($student['photo'] ?? null);
                if ($legacyUrl !== null) {
                    $opts['photo_url'] = $legacyUrl;
                }
            }

            $items[] = ['student' => $student, 'card' => $card, 'opts' => $opts];
        }

        if ($items === []) {
            $this->error($response, 'None of the selected students hold an active ID card. Issue their cards first.', 422);
        }

        unset($verifyBase);

        $html = StudentIdCardHelper::buildBatchHtml($items);
        StudentIdCardHelper::stream($html, 'id-cards-' . count($items) . '.pdf');
    }

    // ── DELETE /api/student-ids/:id ───────────────────────────────────────────
    /** Revoke (deactivate) a specific card. */
    public function revoke(Request $request, Response $response): never
    {
        $actor = (array) $request->param('_auth_user');
        $id    = (int) $request->param('id');

        $card = $this->model->find($id);
        if (!$card) {
            $this->error($response, 'Card not found.', 404);
        }

        $this->model->update($id, ['is_active' => 0]);

        SystemLogService::log('UPDATE', 'STUDENT_ID',
            "User {$actor['id']} revoked ID card {$id}.",
            $id, 'student_id', null, $actor
        );

        $this->success($response, null, 'ID card revoked.');
    }

    /* ── helpers ──────────────────────────────────────────────────────────── */

    /**
     * Build the PUBLIC verification URL the QR code resolves to, anchored to the
     * live front-end the card is printed from.
     *
     * Resolution order:
     *   1. APP_FRONTEND_URL env (authoritative per deployment, e.g. https://cur.ac.rw/umis)
     *   2. the Origin / Referer of the printing request (so dev/staging just work)
     *   3. a sane production default.
     */
    private function verifyUrl(string $barcode, Request $request): string
    {
        // APP_FRONTEND_URL must include the sub-path, e.g. https://cur.ac.rw/umis
        $base = trim((string) ($_ENV['APP_FRONTEND_URL'] ?? getenv('APP_FRONTEND_URL') ?: ''));

        if ($base === '') {
            // Derive base from Referer, preserving its path prefix up to the
            // first segment so /umis/... referers yield https://host/umis.
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

        return rtrim($base, '/') . '/verify/student?code=' . rawurlencode($barcode);
    }

    /** Build a unique, alphanumeric barcode from the registration number. */
    private function generateBarcode(string $regnumber): string
    {
        $base = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $regnumber)) ?: 'CUR';
        $base = substr($base, 0, 50);

        // Use the cleaned reg number directly as the barcode when possible.
        // Never append a date suffix — that would change every month and break
        // physical cards if the same student is re-issued a card later.
        // For uniqueness (re-issues keep old inactive rows), append a sequence.
        if (!$this->model->findByBarcode($base)) {
            return $base;
        }
        for ($i = 1; $i <= 99; $i++) {
            $try = substr($base, 0, 57) . sprintf('%02d', $i);
            if (!$this->model->findByBarcode($try)) {
                return $try;
            }
        }
        return substr($base . bin2hex(random_bytes(3)), 0, 60);
    }
}

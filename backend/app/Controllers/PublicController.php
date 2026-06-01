<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use Core\Database;
use App\Models\StudentIdModel;
use App\Helpers\StudentIdCardHelper;

/**
 * Public, unauthenticated endpoints — anyone holding a printed card (or its QR)
 * can verify the holder. Only minimal, non-sensitive identity fields are
 * exposed, and only for a card whose barcode actually exists.
 */
class PublicController extends BaseController
{
    private StudentIdModel $cards;
    private Database       $db;

    public function __construct()
    {
        $this->cards = new StudentIdModel();
        $this->db    = Database::getInstance();
    }

    // ── GET /api/public/student-verify?code=<barcode> ────────────────────────
    public function verifyStudent(Request $request, Response $response): never
    {
        $code = trim((string) ($request->query('code') ?? ''));
        if ($code === '') {
            $this->error($response, 'Verification code is required.', 422);
        }

        $card = $this->cards->findByBarcode($code);
        if (!$card) {
            // Do not leak whether a student exists — just "not found".
            $this->success($response, ['found' => false], 'No card matches this code.');
        }

        $student = $this->db->fetchOne(
            "SELECT s.regnumber, s.fname, s.lname, s.current_level, s.program, s.photo,
                    f.fac_name, d.dep_name
             FROM `student` s
             LEFT JOIN `faculty`      f ON CAST(f.fac_id AS CHAR) = s.faculty
             LEFT JOIN `departements` d ON CAST(d.dep_id AS CHAR) = s.department
             WHERE s.id = ? LIMIT 1",
            [(int) $card['student_id']]
        );
        if (!$student) {
            $this->success($response, ['found' => false], 'No card matches this code.');
        }

        $expired = !empty($card['expiry_date']) && strtotime((string) $card['expiry_date']) < strtotime(date('Y-m-d'));
        $valid   = (int) ($card['is_active'] ?? 0) === 1 && !$expired;

        $this->success($response, [
            'found'       => true,
            'valid'       => $valid,
            'status'      => $valid ? 'valid' : ((int) ($card['is_active'] ?? 0) !== 1 ? 'revoked' : 'expired'),
            'full_name'   => trim(((string) $student['fname']) . ' ' . ((string) $student['lname'])),
            'regnumber'   => $student['regnumber'],
            'faculty'     => $student['fac_name'] ?: null,
            'department'  => $student['dep_name'] ?: null,
            'program'     => $student['program'] ?: null,
            'level'       => $student['current_level'] ?: null,
            'issued_at'   => $card['issue_date'] ?? null,
            'expires_at'  => $card['expiry_date'] ?? null,
            'has_photo'   => !empty($student['photo']),
            'photo_url'   => !empty($student['photo'])
                ? '/api/public/student-photo?code=' . rawurlencode($code)
                : null,
        ], 'Verification result.');
    }

    // ── GET /api/public/student-photo?code=<barcode> ─────────────────────────
    /** Streams the photo of the student whose active card carries this barcode. */
    public function studentPhoto(Request $request, Response $response): never
    {
        $code = trim((string) ($request->query('code') ?? ''));
        if ($code === '') {
            $this->error($response, 'Verification code is required.', 422);
        }

        $card = $this->cards->findByBarcode($code);
        if (!$card) {
            $this->error($response, 'Not found.', 404);
        }

        $student = $this->db->fetchOne('SELECT photo FROM `student` WHERE id = ? LIMIT 1', [(int) $card['student_id']]);
        $uri = $student ? StudentIdCardHelper::resolvePhotoDataUri($student['photo'] ?? null) : null;
        if (!$uri || !preg_match('#^data:(image/[^;]+);base64,(.+)$#', $uri, $m)) {
            $this->error($response, 'No photo available.', 404);
        }

        header('Content-Type: ' . $m[1]);
        header('Cache-Control: public, max-age=300');
        header('X-Content-Type-Options: nosniff');
        echo base64_decode($m[2]);
        exit;
    }
}

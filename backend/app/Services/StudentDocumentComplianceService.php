<?php

declare(strict_types=1);

namespace App\Services;

use Core\Database;
use App\Models\ProgrammeDocumentRequirementModel;

/**
 * Required-document compliance for an enrolled student.
 *
 * Compares the checklist configured for the student's programme category
 * (`programme_document_requirements`, admin-editable) against what the
 * student actually uploaded with their admission application
 * (`application_documents`), matched by document_type_id. The result powers
 * the Documents tab, the checklist modal and the "notify student" action.
 *
 * Statuses per requirement:
 *   verified  — uploaded and approved by the registry
 *   pending   — uploaded, awaiting verification
 *   rejected  — uploaded but refused; the student must re-upload
 *   missing   — nothing on file
 *
 * A required document is "outstanding" (and listed in a notice) when it is
 * missing or rejected. `is_complete` is stricter: every required document
 * must be verified.
 */
final class StudentDocumentComplianceService
{
    public const CATEGORY_LABELS = [
        'undergraduate' => 'Undergraduate',
        'postgraduate'  => 'Postgraduate (PGDE)',
        'masters'       => 'Masters',
    ];

    private const STATUS_RANK = ['verified' => 3, 'pending' => 2, 'rejected' => 1];

    /**
     * Which checklist applies to this student. `programme_category` is the
     * source of truth (backfilled by 2026_09_17_001); the fallbacks mirror
     * that migration's rules for rows created before it ran.
     */
    public static function resolveCategory(array $student): string
    {
        $cat = strtolower(trim((string)($student['programme_category'] ?? '')));
        if (in_array($cat, ProgrammeDocumentRequirementModel::CATEGORIES, true)) {
            return $cat;
        }

        $level = strtolower(trim((string)($student['programme_level'] ?? '')));
        $reg   = strtoupper(trim((string)($student['regnumber'] ?? '')));

        if ($level === 'masters') {
            return 'masters';
        }
        if (in_array($level, ['pgde', 'phd'], true) || str_starts_with($reg, '2CUR')) {
            return 'postgraduate';
        }
        if (stripos((string)($student['category'] ?? ''), 'postgraduate') !== false) {
            return 'postgraduate';
        }
        return 'undergraduate';
    }

    /**
     * Build the checklist for a student against their uploaded documents.
     *
     * @param array $student   student row (needs id, programme_category/level, regnumber)
     * @param array $documents rows from ApplicationDocumentModel::getForApplication()
     *                         (synthetic visa rows are ignored — they have their own flow)
     */
    public static function checklist(array $student, array $documents): array
    {
        $category     = self::resolveCategory($student);
        $requirements = (new ProgrammeDocumentRequirementModel())->getForCategory($category);

        // Best upload per document type: verified beats pending beats rejected.
        $byType = [];
        foreach ($documents as $doc) {
            if (!empty($doc['is_visa'])) {
                continue;
            }
            $typeId = (int)($doc['document_type_id'] ?? 0);
            if ($typeId <= 0 || empty($doc['file_server_id'])) {
                continue;
            }
            $status = strtolower((string)($doc['verification_status'] ?? 'pending'));
            $rank   = self::STATUS_RANK[$status] ?? 2;
            $prev   = $byType[$typeId] ?? null;
            if ($prev === null || $rank > $prev['rank']) {
                $byType[$typeId] = ['rank' => $rank, 'status' => $status, 'doc' => $doc];
            }
        }

        $items   = [];
        $summary = [
            'required_total'   => 0,
            'verified'         => 0,
            'pending'          => 0,
            'rejected'         => 0,
            'missing'          => 0,
            'optional_missing' => 0,
        ];
        $outstanding = [];

        foreach ($requirements as $req) {
            $typeId = (int)$req['document_type_id'];
            $match  = $byType[$typeId] ?? null;
            $status = $match['status'] ?? 'missing';
            $isReq  = (bool)(int)$req['is_required'];
            $doc    = $match['doc'] ?? null;

            $item = [
                'requirement_id'   => (int)$req['id'],
                'document_type_id' => $typeId,
                'name'             => $req['document_type_name'],
                'slug'             => $req['document_type_slug'],
                'description'      => $req['document_description'],
                'notes'            => $req['notes'],
                'is_required'      => $isReq,
                'status'           => $status,
                'document_id'      => $doc ? (int)$doc['id'] : null,
                'file_original_name'   => $doc['file_original_name'] ?? null,
                'uploaded_at'          => $doc['uploaded_at'] ?? null,
                'verified_at'          => $doc['verified_at'] ?? null,
                'verifier_name'        => $doc['verifier_name'] ?? null,
                'verification_comment' => $doc['verification_comment'] ?? null,
            ];
            $items[] = $item;

            if ($isReq) {
                $summary['required_total']++;
                $summary[$status]++;
                if ($status === 'missing' || $status === 'rejected') {
                    $outstanding[] = $item;
                }
            } elseif ($status === 'missing') {
                $summary['optional_missing']++;
            }
        }

        // Uploads that aren't on this category's checklist — never hide them.
        $reqTypeIds = array_map(fn($r) => (int)$r['document_type_id'], $requirements);
        $extra = [];
        foreach ($documents as $doc) {
            if (!empty($doc['is_visa'])) {
                continue;
            }
            $typeId = (int)($doc['document_type_id'] ?? 0);
            if (!in_array($typeId, $reqTypeIds, true)) {
                $extra[] = (int)$doc['id'];
            }
        }

        return [
            'programme_category'       => $category,
            'programme_category_label' => self::CATEGORY_LABELS[$category] ?? ucfirst($category),
            'configured'               => count($requirements) > 0,
            'requirements'             => $items,
            'outstanding'              => $outstanding,
            'extra_document_ids'       => $extra,
            'summary'                  => $summary,
            'is_complete'              => $summary['required_total'] > 0
                                          && $summary['verified'] === $summary['required_total'],
            'last_notice'              => self::lastNotice((int)$student['id']),
        ];
    }

    /** Most recent notice sent to this student, or null. */
    public static function lastNotice(int $studentId): ?array
    {
        $rows = self::notices($studentId, 1);
        return $rows[0] ?? null;
    }

    /** Notices sent to this student, newest first. */
    public static function notices(int $studentId, int $limit = 20): array
    {
        try {
            $rows = Database::getInstance()->fetchAll(
                "SELECT n.id, n.message, n.document_types, n.notification_id,
                        n.email_to, n.email_sent_at, n.email_error, n.created_at,
                        u.full_name AS sent_by_name
                 FROM `missing_document_notes` n
                 LEFT JOIN `users` u ON u.id = n.sent_by_user_id
                 WHERE n.student_id = ?
                 ORDER BY n.id DESC
                 LIMIT " . max(1, min(100, $limit)),
                [$studentId]
            );
        } catch (\Throwable $e) {
            // Table not migrated yet — the tab still renders, just without history.
            error_log('[DocumentCompliance] notices lookup failed: ' . $e->getMessage());
            return [];
        }

        return array_map(static function (array $r): array {
            $types = json_decode((string)($r['document_types'] ?? '[]'), true);
            return [
                'id'                => (int)$r['id'],
                'message'           => $r['message'],
                'document_types'    => is_array($types) ? $types : [],
                'in_app_sent'       => !empty($r['notification_id']),
                'email_to'          => $r['email_to'],
                'email_sent'        => !empty($r['email_sent_at']),
                'email_error'       => $r['email_error'],
                'sent_by_name'      => $r['sent_by_name'],
                'created_at'        => $r['created_at'],
            ];
        }, $rows);
    }

    /**
     * Notify the student about outstanding required documents through every
     * channel we have for them: an in-app notification (when the student has
     * a portal account) and an email (when they have an address). The notice
     * is always recorded in `missing_document_notes` so staff can see what
     * was sent and when, even if both channels failed.
     *
     * @param array      $student         student row
     * @param array      $checklist       output of checklist()
     * @param array      $actor           the staff user sending the notice
     * @param string|null $customMessage  optional staff-written note; the
     *                                    document list is always appended
     * @param int[]|null $documentTypeIds subset of outstanding types to list;
     *                                    null = every outstanding requirement
     * @return array{note_id:int, documents:array, in_app:bool, email:array}
     */
    public static function notify(
        array $student,
        array $checklist,
        array $actor,
        ?string $customMessage = null,
        ?array $documentTypeIds = null
    ): array {
        $studentId = (int)$student['id'];
        $outstanding = $checklist['outstanding'] ?? [];

        if ($documentTypeIds !== null) {
            $wanted      = array_map('intval', $documentTypeIds);
            $outstanding = array_values(array_filter(
                $outstanding,
                fn($d) => in_array((int)$d['document_type_id'], $wanted, true)
            ));
        }

        if ($outstanding === []) {
            throw new \InvalidArgumentException('This student has no outstanding required documents.');
        }

        $docs = array_map(fn($d) => [
            'id'     => (int)$d['document_type_id'],
            'name'   => (string)$d['name'],
            'status' => (string)$d['status'],
            'notes'  => $d['notes'] ?? null,
            'comment' => $d['verification_comment'] ?? null,
        ], $outstanding);

        $firstName = trim((string)($student['fname'] ?? ''));
        $fullName  = trim(($student['fname'] ?? '') . ' ' . ($student['lname'] ?? ''));
        $reg       = (string)($student['regnumber'] ?? '');
        $custom    = trim((string)$customMessage);

        // ── Plain-text body (stored + used as the email alt-body) ──────────
        $lines   = [];
        $lines[] = 'Dear ' . ($firstName !== '' ? $firstName : 'Student') . ',';
        $lines[] = '';
        $lines[] = $custom !== ''
            ? $custom
            : 'Our records show that the following required document(s) for your programme are still outstanding. Please upload clear scans or photos as soon as possible so your file can be completed.';
        $lines[] = '';
        foreach ($docs as $d) {
            $suffix = $d['status'] === 'rejected'
                ? ' (previous upload rejected' . (!empty($d['comment']) ? ': ' . $d['comment'] : '') . ' — please re-upload)'
                : '';
            $lines[] = '• ' . $d['name'] . $suffix . (!empty($d['notes']) ? ' — ' . $d['notes'] : '');
        }
        $lines[] = '';
        $lines[] = 'You can upload them from your student portal: My Profile → Documents.';
        $lines[] = '';
        $lines[] = 'Catholic University of Rwanda — Registry';
        $plain = implode("\n", $lines);

        $db = Database::getInstance();
        $noteId = 0;
        try {
            $db->execute(
                "INSERT INTO `missing_document_notes`
                    (student_id, reg_number, message, document_types, sent_by_user_id, created_at)
                 VALUES (?, ?, ?, ?, ?, NOW())",
                [$studentId, $reg !== '' ? $reg : null, $plain, json_encode($docs), (int)($actor['id'] ?? 0) ?: null]
            );
            $noteId = (int)$db->lastInsertId();
        } catch (\Throwable $e) {
            error_log('[DocumentCompliance] could not record notice: ' . $e->getMessage());
        }

        // ── In-app notification (student portal) ──────────────────────────
        $userId = (int)($student['user_id'] ?? 0);
        $notificationId = null;
        if ($userId > 0) {
            $names = implode(', ', array_column($docs, 'name'));
            $notificationId = NotificationService::push(
                $userId,
                'missing_documents',
                count($docs) === 1 ? 'Missing document: ' . $docs[0]['name'] : count($docs) . ' required documents missing',
                ($custom !== '' ? $custom . "\n\nOutstanding: " : 'Please upload the following required document(s): ') . $names . '.',
                '/me/profile?tab=documents',
                'student',
                $studentId,
                'warning'
            );
        }

        // ── Email ─────────────────────────────────────────────────────────
        $email      = trim((string)($student['email'] ?? ''));
        $emailSent  = false;
        $emailError = null;
        if ($email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL)) {
            try {
                $frontend = rtrim((string)($_ENV['APP_FRONTEND_URL'] ?? ''), '/');
                $subject  = 'Action required: missing documents' . ($reg !== '' ? " — {$reg}" : '');
                $html     = self::emailHtml($fullName, $custom, $docs, $frontend . '/me/profile?tab=documents');
                $emailSent = (new MailService())->send(['email' => $email, 'name' => $fullName], $subject, $html, $plain);
                if (!$emailSent) {
                    $emailError = 'Mailer refused the message (see server log).';
                }
            } catch (\Throwable $e) {
                $emailError = mb_substr($e->getMessage(), 0, 250);
                error_log('[DocumentCompliance] email failed: ' . $e->getMessage());
            }
        } elseif ($email !== '') {
            $emailError = 'Student email address is invalid: ' . $email;
        } else {
            $emailError = 'Student has no email address on file.';
        }

        if ($noteId > 0) {
            try {
                $db->execute(
                    "UPDATE `missing_document_notes`
                        SET notification_id = ?, email_to = ?, email_sent_at = ?, email_error = ?
                      WHERE id = ?",
                    [
                        $notificationId,
                        $email !== '' ? $email : null,
                        $emailSent ? date('Y-m-d H:i:s') : null,
                        $emailSent ? null : $emailError,
                        $noteId,
                    ]
                );
            } catch (\Throwable $e) {
                error_log('[DocumentCompliance] could not update notice delivery: ' . $e->getMessage());
            }
        }

        SystemLogService::log(
            'NOTIFY',
            'STUDENTS',
            "Missing-documents notice sent to student #{$studentId}" . ($reg !== '' ? " ({$reg})" : '')
                . ': ' . implode(', ', array_column($docs, 'name')),
            $studentId,
            'student',
            [
                'note_id'         => $noteId ?: null,
                'document_types'  => array_column($docs, 'id'),
                'in_app'          => $notificationId !== null,
                'email_to'        => $email !== '' ? $email : null,
                'email_sent'      => $emailSent,
                'email_error'     => $emailSent ? null : $emailError,
            ],
            $actor ?: null
        );

        return [
            'note_id'   => $noteId,
            'documents' => $docs,
            'in_app'    => $notificationId !== null,
            'has_portal_account' => $userId > 0,
            'email'     => [
                'to'    => $email !== '' ? $email : null,
                'sent'  => $emailSent,
                'error' => $emailSent ? null : $emailError,
            ],
        ];
    }

    private static function emailHtml(string $fullName, string $custom, array $docs, string $portalUrl): string
    {
        $e = static fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');

        $intro = $custom !== ''
            ? nl2br($e($custom))
            : 'Our records show that the following required document(s) for your programme are still outstanding. '
              . 'Please upload clear scans or photos as soon as possible so your file can be completed.';

        $rows = '';
        foreach ($docs as $d) {
            $badge = $d['status'] === 'rejected'
                ? '<span style="display:inline-block;margin-left:8px;padding:2px 8px;border-radius:999px;background:#fee2e2;color:#991b1b;font-size:11px;font-weight:700;">RE-UPLOAD</span>'
                : '<span style="display:inline-block;margin-left:8px;padding:2px 8px;border-radius:999px;background:#fef3c7;color:#92400e;font-size:11px;font-weight:700;">MISSING</span>';
            $hint = '';
            if ($d['status'] === 'rejected' && !empty($d['comment'])) {
                $hint = '<div style="color:#991b1b;font-size:12px;margin-top:2px;">Reason: ' . $e($d['comment']) . '</div>';
            } elseif (!empty($d['notes'])) {
                $hint = '<div style="color:#6b7280;font-size:12px;margin-top:2px;">' . $e($d['notes']) . '</div>';
            }
            $rows .= '<tr><td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">'
                . '<strong style="color:#111827;">' . $e($d['name']) . '</strong>' . $badge . $hint
                . '</td></tr>';
        }

        return '<!doctype html><html><body style="margin:0;padding:0;background:#f3f4f6;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#111827;">'
            . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;"><tr><td align="center">'
            . '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">'
            . '<tr><td style="background:#0A2A5E;padding:20px 28px;color:#ffffff;">'
            . '<div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.8;">Catholic University of Rwanda</div>'
            . '<div style="font-size:20px;font-weight:700;margin-top:4px;">Missing documents — action required</div>'
            . '</td></tr>'
            . '<tr><td style="padding:24px 28px;font-size:14px;line-height:1.6;">'
            . '<p style="margin:0 0 12px;">Dear ' . $e($fullName !== '' ? $fullName : 'Student') . ',</p>'
            . '<p style="margin:0 0 16px;">' . $intro . '</p>'
            . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">' . $rows . '</table>'
            . '<p style="margin:20px 0 8px;">Upload them from your student portal:</p>'
            . '<p style="margin:0 0 20px;"><a href="' . $e($portalUrl) . '" style="display:inline-block;background:#0A2A5E;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">Open My Documents</a></p>'
            . '<p style="margin:0;color:#6b7280;font-size:12px;">If you have already submitted these documents at the Registry office, please ignore this message or contact us so we can update your file.</p>'
            . '</td></tr>'
            . '<tr><td style="padding:14px 28px;background:#f9fafb;color:#6b7280;font-size:12px;">Catholic University of Rwanda — Registry Office</td></tr>'
            . '</table></td></tr></table></body></html>';
    }
}

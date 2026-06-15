<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use Core\Database;
use App\Models\MessageModel;
use App\Models\ConversationModel;
use App\Helpers\ValidationHelper;
use App\Services\MailService;
use App\Services\SystemLogService;

class MessageController extends BaseController
{
    private MessageModel      $messageModel;
    private ConversationModel $convModel;
    private Database          $db;

    public function __construct()
    {
        $this->messageModel = new MessageModel();
        $this->convModel    = new ConversationModel();
        $this->db           = Database::getInstance();
    }

    // ── Role expansion ────────────────────────────────────────────────────────

    /**
     * Resolve mixed recipient tokens (user IDs or role slugs) to a flat list
     * of active user IDs.
     *
     * Role slug map:
     *   all_students    → role 'student'
     *   all_lecturers   → role 'lecturer'
     *   all_applicants  → role 'applicant'
     *   hr_department   → role 'hr_manager'
     *   finance         → role 'finance_officer'
     *   registrar_team  → role 'registrar'
     *   all_staff       → all non-student/applicant roles
     *   all_users       → every active user (superadmin only)
     *
     * Non-admin callers may only use 'all_students' and 'all_lecturers'.
     * Other role slugs are silently skipped for unprivileged users.
     */
    private function expandRecipients(array $tokens, array $actor): array
    {
        $roleSlugMap = [
            'all_students'   => ['student'],
            'all_lecturers'  => ['lecturer'],
            'all_applicants' => ['applicant'],
            'hr_department'  => ['hr_manager'],
            'finance'        => ['finance_officer'],
            'registrar_team' => ['registrar'],
            'all_staff'      => ['superadmin', 'admin', 'registrar', 'hr_manager', 'lecturer', 'finance_officer'],
            'all_users'      => null, // null = every active user
        ];

        $allowedRoleSlugs = ['all_students', 'all_lecturers'];
        $isAdmin          = in_array($actor['role'] ?? '', ['superadmin', 'admin'], true);

        $userIds   = [];
        $roleSlugs = [];

        foreach ($tokens as $token) {
            if (is_numeric($token)) {
                $userIds[] = (int) $token;
            } elseif (isset($roleSlugMap[$token])) {
                if (!$isAdmin && !in_array($token, $allowedRoleSlugs, true)) {
                    continue;
                }
                $roleSlugs[$token] = $roleSlugMap[$token];
            }
        }

        foreach ($roleSlugs as $slug => $roleNames) {
            if ($roleNames === null) {
                $rows = $this->db->fetchAll(
                    "SELECT id FROM users WHERE is_active = 1"
                );
            } else {
                $ph   = implode(',', array_fill(0, count($roleNames), '?'));
                $rows = $this->db->fetchAll(
                    "SELECT u.id FROM users u
                     INNER JOIN roles r ON r.id = u.role_id
                     WHERE r.name IN ({$ph}) AND u.is_active = 1",
                    $roleNames
                );
            }
            foreach ($rows as $r) {
                $userIds[] = (int) $r['id'];
            }
        }

        return array_values(array_unique($userIds));
    }

    // ── POST /api/messages/conversations ─────────────────────────────────────
    /**
     * Create or find a conversation.
     *
     * Body: { recipients: (int|string)[], subject?: string, type?: 'direct'|'broadcast' }
     *
     * For a direct (1:1) conversation, an existing thread is returned if one exists;
     * a soft-deleted participant row is restored transparently.
     */
    public function createConversation(Request $request, Response $response): never
    {
        $actor  = (array) $request->param('_auth_user');
        $authId = (int) $actor['id'];
        $body   = $request->body();

        $errors = ValidationHelper::validate($body, [
            'recipients' => ['required'],
            'body'       => ['required', 'min:1'],
        ]);
        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        $rawRecipients = (array) ($body['recipients'] ?? []);
        $type          = in_array($body['type'] ?? '', ['direct', 'broadcast'], true)
                         ? $body['type'] : 'direct';
        $subject       = trim($body['subject'] ?? '');
        $messageBody   = trim($body['body'] ?? '');
        $sendEmail     = filter_var($body['send_email'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $channel       = $sendEmail ? 'system_email' : 'system';

        $recipientIds = array_values($this->expandRecipients($rawRecipients, $actor));

        if (empty($recipientIds)) {
            $this->error($response, 'No valid recipients found.', 422);
        }

        // Auto-generate subject from participant first names when none provided
        if ($subject === '') {
            $allIds     = array_unique(array_merge([$authId], $recipientIds));
            $ph         = implode(',', array_fill(0, count($allIds), '?'));
            $nameRows   = $this->db->fetchAll("SELECT full_name FROM users WHERE id IN ({$ph})", $allIds);
            $firstNames = array_map(fn($r) => explode(' ', trim($r['full_name']))[0], $nameRows);
            $subject    = count($firstNames) <= 3
                ? implode(' & ', $firstNames)
                : implode(', ', array_slice($firstNames, 0, 3)) . ' +' . (count($firstNames) - 3) . ' more';
        }

        // For 1:1 direct: find or restore existing conversation, then post message into it
        if ($type === 'direct' && count($recipientIds) === 1) {
            $existingId = $this->convModel->findDirect($authId, $recipientIds[0]);
            if ($existingId) {
                $this->convModel->restoreParticipant($existingId, $authId);
                $allParticipants = $this->convModel->getParticipantIds($existingId);
                $msgRecipients   = array_values(array_filter($allParticipants, fn($id) => $id !== $authId));

                $msgId = $this->db->transaction(function () use ($authId, $existingId, $messageBody, $channel, $msgRecipients): int {
                    $id = (int) $this->messageModel->create([
                        'conversation_id'  => $existingId,
                        'sender_id'        => $authId,
                        'body'             => $messageBody,
                        'delivery_channel' => $channel,
                        'has_attachment'   => 0,
                        'is_draft'         => 0,
                    ]);
                    $this->messageModel->createRecipients($id, $msgRecipients);
                    $this->db->execute("UPDATE conversations SET updated_at = NOW() WHERE id = ?", [$existingId]);
                    return $id;
                });

                $this->dispatchEmail($msgId, $actor, $messageBody, $sendEmail, $msgRecipients);

                $conv = $this->convModel->find($existingId);
                $this->success($response, ['conversation' => $conv, 'existing' => true], 'Message sent to existing conversation.');
            }
        }

        // Create new conversation with first message in a single transaction
        $msgId  = null;
        $convId = $this->db->transaction(function () use ($authId, $type, $subject, $recipientIds, $messageBody, $channel, &$msgId): int {
            $id = (int) $this->convModel->create([
                'subject'    => $subject ?: null,
                'type'       => $type,
                'created_by' => $authId,
            ]);

            $this->convModel->addParticipant($id, $authId);
            foreach ($recipientIds as $uid) {
                $this->convModel->addParticipant($id, $uid);
            }

            $msgId = (int) $this->messageModel->create([
                'conversation_id'  => $id,
                'sender_id'        => $authId,
                'body'             => $messageBody,
                'delivery_channel' => $channel,
                'has_attachment'   => 0,
                'is_draft'         => 0,
            ]);
            $this->messageModel->createRecipients($msgId, $recipientIds);
            $this->db->execute("UPDATE conversations SET updated_at = NOW() WHERE id = ?", [$id]);

            return $id;
        });

        $this->dispatchEmail($msgId, $actor, $messageBody, $sendEmail, $recipientIds);

        SystemLogService::log('CREATE', 'MESSAGING',
            "User {$authId} created conversation {$convId} with " . count($recipientIds) . " recipient(s).",
            $convId, 'conversation', ['recipient_count' => count($recipientIds)], $actor
        );

        $conv = $this->convModel->find($convId);
        $this->success($response, ['conversation' => $conv, 'existing' => false], 'Conversation created.', 201);
    }

    // ── GET /api/messages/conversations ──────────────────────────────────────
    /**
     * Paginated conversation list for the authenticated user.
     * Query params: page, per_page
     */
    public function listConversations(Request $request, Response $response): never
    {
        $actor   = (array) $request->param('_auth_user');
        $authId  = (int) $actor['id'];
        $page    = max(1, (int) ($request->query('page') ?? 1));
        $perPage = min(50, max(1, (int) ($request->query('per_page') ?? 20)));

        $result = $this->convModel->listForUser($authId, $page, $perPage);
        $this->success($response, $result, 'Conversations fetched.');
    }

    // ── DELETE /api/messages/conversations/:id ────────────────────────────────
    /**
     * Soft-delete the conversation from the caller's inbox.
     * Other participants are unaffected.
     */
    public function deleteConversation(Request $request, Response $response): never
    {
        $actor  = (array) $request->param('_auth_user');
        $authId = (int) $actor['id'];
        $convId = (int) $request->param('id');

        if (!$this->convModel->isParticipant($convId, $authId)) {
            $this->error($response, 'Conversation not found.', 404);
        }

        $this->db->execute("
            UPDATE conversation_participants
            SET deleted_at = NOW()
            WHERE conversation_id = ? AND user_id = ?
        ", [$convId, $authId]);

        $this->success($response, null, 'Conversation removed from your inbox.');
    }

    // ── GET /api/messages/conversations/:id/messages ──────────────────────────
    /**
     * Paginated messages in a conversation, ordered chronologically.
     * Opening the chat automatically marks all messages as read.
     * Query params: page, per_page
     */
    public function listMessages(Request $request, Response $response): never
    {
        $actor  = (array) $request->param('_auth_user');
        $authId = (int) $actor['id'];
        $convId = (int) $request->param('id');

        if (!$this->convModel->isParticipant($convId, $authId)) {
            $this->error($response, 'Conversation not found.', 404);
        }

        $page    = max(1, (int) ($request->query('page') ?? 1));
        $perPage = min(50, max(1, (int) ($request->query('per_page') ?? 30)));

        // Mark all in this conversation as read and refresh last_read_at
        $this->messageModel->markConversationRead($convId, $authId);
        $this->db->execute("
            UPDATE conversation_participants
            SET last_read_at = NOW()
            WHERE conversation_id = ? AND user_id = ?
        ", [$convId, $authId]);

        $result = $this->messageModel->listForConversation($convId, $authId, $page, $perPage);
        $this->success($response, $result, 'Messages fetched.');
    }

    // ── POST /api/messages/conversations/:id/messages ─────────────────────────
    /**
     * Send a message in an existing conversation.
     *
     * Body: { body: string, send_email?: bool }
     *
     * If send_email is true, PHPMailer dispatches a copy to each recipient
     * synchronously. Safe for ≤50 recipients; for role-wide broadcasts consider
     * a background queue.
     */
    public function sendMessage(Request $request, Response $response): never
    {
        $actor  = (array) $request->param('_auth_user');
        $authId = (int) $actor['id'];
        $convId = (int) $request->param('id');
        $body   = $request->body();

        if (!$this->convModel->isParticipant($convId, $authId)) {
            $this->error($response, 'Conversation not found.', 404);
        }

        $errors = ValidationHelper::validate($body, ['body' => ['required', 'min:1']]);
        if (!empty($errors)) {
            $this->error($response, 'Message body is required.', 422, $errors);
        }

        $sendEmail      = filter_var($body['send_email'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $channel        = $sendEmail ? 'system_email' : 'system';
        $participantIds = $this->convModel->getParticipantIds($convId);
        $recipientIds   = array_values(array_filter($participantIds, fn($id) => $id !== $authId));

        $msgId = $this->db->transaction(function () use ($authId, $convId, $body, $channel, $recipientIds): int {
            $id = (int) $this->messageModel->create([
                'conversation_id'  => $convId,
                'sender_id'        => $authId,
                'body'             => trim($body['body']),
                'delivery_channel' => $channel,
                'has_attachment'   => 0,
                'is_draft'         => 0,
            ]);

            $this->messageModel->createRecipients($id, $recipientIds);

            // Float conversation to top of sidebar
            $this->db->execute(
                "UPDATE conversations SET updated_at = NOW() WHERE id = ?",
                [$convId]
            );

            return $id;
        });

        // Email dispatch — fire-and-forget after DB commit
        $this->dispatchEmail($msgId, $actor, trim($body['body']), $sendEmail, $recipientIds);

        SystemLogService::log('CREATE', 'MESSAGING',
            "User {$authId} sent message {$msgId} in conversation {$convId}.",
            $msgId, 'message', ['channel' => $channel], $actor
        );

        $msg = $this->db->fetchOne("
            SELECT m.*, u.full_name AS sender_name
            FROM messages m
            INNER JOIN users u ON u.id = m.sender_id
            WHERE m.id = ?
        ", [$msgId]);

        $this->success($response, $msg, 'Message sent.', 201);
    }

    // ── PUT /api/messages/messages/:id/read ──────────────────────────────────
    /**
     * Mark a single message as read for the calling user.
     */
    public function markRead(Request $request, Response $response): never
    {
        $actor  = (array) $request->param('_auth_user');
        $authId = (int) $actor['id'];
        $msgId  = (int) $request->param('id');

        $this->messageModel->markAsRead($msgId, $authId);
        $this->success($response, null, 'Marked as read.');
    }

    // ── GET /api/messages/unread-count ───────────────────────────────────────
    /**
     * Total unread count and latest 5 previews for the navbar badge/dropdown.
     */
    public function unreadCount(Request $request, Response $response): never
    {
        $actor  = (array) $request->param('_auth_user');
        $authId = (int) $actor['id'];

        $count   = $this->messageModel->totalUnread($authId);
        $preview = $this->messageModel->recentUnread($authId, 5);

        $this->success($response, [
            'unread_count' => $count,
            'preview'      => $preview,
        ], 'Unread count fetched.');
    }

    // ── POST /api/messages/drafts ─────────────────────────────────────────────
    /**
     * Auto-save a draft (is_draft = 1).
     * Creates a conversation if recipients are provided, but does not send.
     *
     * Body: { body?: string, recipients?: (int|string)[], subject?: string }
     */
    public function saveDraft(Request $request, Response $response): never
    {
        $actor  = (array) $request->param('_auth_user');
        $authId = (int) $actor['id'];
        $body   = $request->body();

        $rawRecipients = (array) ($body['recipients'] ?? []);
        $recipientIds  = array_values(array_filter(
            $this->expandRecipients($rawRecipients, $actor),
            fn($id) => $id !== $authId
        ));

        $convId = null;

        if (!empty($recipientIds)) {
            if (count($recipientIds) === 1) {
                $convId = $this->convModel->findDirect($authId, $recipientIds[0]);
            }

            if (!$convId) {
                $convId = (int) $this->convModel->create([
                    'subject'    => trim($body['subject'] ?? '') ?: null,
                    'type'       => count($recipientIds) === 1 ? 'direct' : 'broadcast',
                    'created_by' => $authId,
                ]);
                $this->convModel->addParticipant($convId, $authId);
                foreach ($recipientIds as $uid) {
                    $this->convModel->addParticipant($convId, $uid);
                }
            }
        }

        $msgId = (int) $this->messageModel->create([
            'conversation_id'  => $convId,
            'sender_id'        => $authId,
            'body'             => trim($body['body'] ?? ''),
            'delivery_channel' => 'system',
            'has_attachment'   => 0,
            'is_draft'         => 1,
        ]);

        $this->success($response, [
            'id'              => $msgId,
            'conversation_id' => $convId,
        ], 'Draft saved.', 201);
    }

    // ── POST /api/messages/attachments ───────────────────────────────────────
    /**
     * Upload a file attachment (multipart/form-data).
     * Field name: 'file'. Optional body field: 'message_id' to link immediately.
     * Max file size: 10 MB.
     */
    public function uploadAttachment(Request $request, Response $response): never
    {
        $actor  = (array) $request->param('_auth_user');
        $file   = $_FILES['file'] ?? null;
        $body   = $request->body();
        $msgId  = (int) ($body['message_id'] ?? 0);

        if (!$file || $file['error'] !== UPLOAD_ERR_OK) {
            $this->error($response, 'No valid file uploaded.', 422);
        }

        $maxBytes = 10 * 1024 * 1024;
        if ($file['size'] > $maxBytes) {
            $this->error($response, 'File too large. Maximum is 10 MB.', 422);
        }

        $uploadDir = dirname(__DIR__, 2) . '/public/uploads/messages/';
        if (!is_dir($uploadDir)) {
            mkdir($uploadDir, 0755, true);
        }

        $ext      = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
        $stored   = uniqid('msg_', true) . '.' . $ext;
        $destPath = $uploadDir . $stored;

        if (!move_uploaded_file($file['tmp_name'], $destPath)) {
            $this->error($response, 'File upload failed.', 500);
        }

        $this->db->execute("
            INSERT INTO message_attachments (message_id, file_name, file_path, mime_type, file_size)
            VALUES (?, ?, ?, ?, ?)
        ", [$msgId ?: null, $file['name'], 'uploads/messages/' . $stored, $file['type'], $file['size']]);

        $attId = (int) $this->db->lastInsertId();

        if ($msgId) {
            $this->db->execute(
                "UPDATE messages SET has_attachment = 1 WHERE id = ?",
                [$msgId]
            );
        }

        $this->success($response, [
            'id'        => $attId,
            'file_name' => $file['name'],
            'file_path' => 'uploads/messages/' . $stored,
            'mime_type' => $file['type'],
            'file_size' => $file['size'],
        ], 'Attachment uploaded.', 201);
    }

    // ── GET /api/messages/conversations/:id/participants ──────────────────────

    public function getConversationParticipants(Request $request, Response $response): never
    {
        $actor  = (array) $request->param('_auth_user');
        $authId = (int) $actor['id'];
        $convId = (int) $request->param('id');

        if (!$this->convModel->isParticipant($convId, $authId)) {
            $this->error($response, 'Conversation not found.', 404);
        }

        $participants = $this->convModel->getParticipants($convId);
        $this->success($response, $participants, 'Participants fetched.');
    }

    // ── Email dispatch helper ─────────────────────────────────────────────────

    private function dispatchEmail(int $msgId, array $actor, string $messageBody, bool $sendEmail, array $recipientIds): void
    {
        if (!$sendEmail || empty($recipientIds)) {
            return;
        }

        $ph         = implode(',', array_fill(0, \count($recipientIds), '?'));
        $recipients = $this->db->fetchAll(
            "SELECT id, email, full_name FROM users WHERE id IN ({$ph})",
            $recipientIds
        );

        $senderName = $actor['full_name'] ?? 'A colleague';
        $plainBody  = strip_tags($messageBody);
        $htmlBody   = '<p>You have a new message from <strong>' . htmlspecialchars($senderName) . '</strong>:</p>'
                    . '<blockquote style="border-left:3px solid #0A2A5E;padding:8px 16px;color:#333;">'
                    . nl2br(htmlspecialchars($plainBody))
                    . '</blockquote>'
                    . '<p><a href="' . ($_ENV['APP_FRONTEND_URL'] ?? '') . '/messages">Open in CUR-MIS</a></p>';

        $mail = new MailService();
        foreach ($recipients as $rec) {
            $sent = $mail->send(
                ['email' => $rec['email'], 'name' => $rec['full_name']],
                "New message from {$senderName}",
                $htmlBody,
                $plainBody
            );
            if ($sent) {
                $this->db->execute(
                    "UPDATE message_recipients SET email_sent = 1 WHERE message_id = ? AND user_id = ?",
                    [$msgId, $rec['id']]
                );
            }
        }
    }

    // ── GET /api/messages/recipients/search ──────────────────────────────────
    /**
     * Autocomplete search for the ComposeModal.
     * Returns matched users and (for admins) role-group options.
     * Query param: q (search term, min 1 char)
     */
    public function searchRecipients(Request $request, Response $response): never
    {
        $actor = (array) $request->param('_auth_user');
        $q     = trim((string) ($request->query('q') ?? ''));

        $users = [];
        if ($q !== '') {
            $like  = "%{$q}%";
            $users = $this->db->fetchAll("
                SELECT u.id, u.full_name, u.email, r.name AS role
                FROM users u
                LEFT JOIN roles r ON r.id = u.role_id
                WHERE u.is_active = 1
                  AND (u.full_name LIKE ? OR u.email LIKE ?)
                LIMIT 20
            ", [$like, $like]);
        }

        $roleGroups = [];
        $isAdmin    = \in_array($actor['role'] ?? '', ['superadmin', 'admin'], true);

        if ($isAdmin) {
            $allGroups = [
                ['id' => 'all_students',   'full_name' => 'All Students',   'email' => '', 'role' => 'group'],
                ['id' => 'all_lecturers',  'full_name' => 'All Lecturers',  'email' => '', 'role' => 'group'],
                ['id' => 'all_applicants', 'full_name' => 'All Applicants', 'email' => '', 'role' => 'group'],
                ['id' => 'hr_department',  'full_name' => 'HR Department',  'email' => '', 'role' => 'group'],
                ['id' => 'finance',        'full_name' => 'Finance Office', 'email' => '', 'role' => 'group'],
                ['id' => 'registrar_team', 'full_name' => 'Registrar Team', 'email' => '', 'role' => 'group'],
                ['id' => 'all_staff',      'full_name' => 'All Staff',      'email' => '', 'role' => 'group'],
            ];

            if ($q !== '') {
                $roleGroups = array_values(array_filter(
                    $allGroups,
                    fn($g) => str_contains(strtolower($g['full_name']), strtolower($q))
                ));
            } else {
                $roleGroups = $allGroups;
            }
        }

        $this->success($response, [
            'users'       => $users,
            'role_groups' => $roleGroups,
        ], 'Recipients found.');
    }
}

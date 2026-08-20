<?php

declare(strict_types=1);

use App\Controllers\MessageController;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Constants\Permissions;

/**
 * Messaging API routes.
 *
 * Split by direction, not by resource: reading what was sent to you needs only
 * a valid JWT, while starting a conversation needs SEND_MESSAGES.
 * Ownership/participant checks are enforced inside the controller.
 */
// ── Receiving: every authenticated account ───────────────────────────────────
// Reading is self-scoped — the controller only ever returns conversations the
// caller participates in. It deliberately does NOT require SEND_MESSAGES: a
// recipient must be able to read and acknowledge a message sent to them even
// when they may not start one, and the navbar unread badge is rendered for
// every signed-in user.
$router->group('/api/messages', function ($router) {

    $router->get('/conversations',                          [MessageController::class, 'listConversations']);
    $router->delete('/conversations/:id',                   [MessageController::class, 'deleteConversation']);
    $router->get('/conversations/:id/messages',             [MessageController::class, 'listMessages']);
    $router->get('/conversations/:id/participants',         [MessageController::class, 'getConversationParticipants']);

    // Read receipt (single message)
    $router->post('/messages/:id/read', [MessageController::class, 'markRead']);

    // Navbar badge + dropdown preview
    $router->get('/unread-count', [MessageController::class, 'unreadCount']);

}, [AuthMiddleware::class]);

// ── Originating: SEND_MESSAGES ───────────────────────────────────────────────
// The UI has always gated the Messages area on SEND_MESSAGES while the API
// accepted any authenticated caller, so the permission described a boundary it
// did not enforce. It is applied here rather than over the whole group so
// receiving stays open (see above).
$router->group('/api/messages', function ($router) {

    $router->post('/conversations',              [MessageController::class, 'createConversation']);
    $router->post('/conversations/:id/messages', [MessageController::class, 'sendMessage']);
    $router->post('/drafts',                     [MessageController::class, 'saveDraft']);

    // Multipart upload (field: 'file') — only meaningful while composing.
    $router->post('/attachments', [MessageController::class, 'uploadAttachment']);

    // Recipient autocomplete for the compose modal.
    $router->get('/recipients/search', [MessageController::class, 'searchRecipients']);

}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::SEND_MESSAGES)]);

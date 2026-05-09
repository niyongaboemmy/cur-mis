<?php

declare(strict_types=1);

use App\Controllers\MessageController;
use App\Middleware\AuthMiddleware;

/**
 * Messaging API routes.
 * All routes require a valid JWT (AuthMiddleware).
 * Ownership/participant checks are enforced inside the controller.
 */
$router->group('/api/messages', function ($router) {

    // Conversation management
    $router->post('/conversations',       [MessageController::class, 'createConversation']);
    $router->get('/conversations',        [MessageController::class, 'listConversations']);
    $router->delete('/conversations/:id', [MessageController::class, 'deleteConversation']);

    // Messages within a conversation
    $router->get('/conversations/:id/messages',  [MessageController::class, 'listMessages']);
    $router->post('/conversations/:id/messages', [MessageController::class, 'sendMessage']);

    // Drafts
    $router->post('/drafts', [MessageController::class, 'saveDraft']);

    // Read receipt (single message)
    $router->put('/messages/:id/read', [MessageController::class, 'markRead']);

    // Navbar badge + dropdown preview
    $router->get('/unread-count', [MessageController::class, 'unreadCount']);

    // File attachment upload (multipart/form-data, field: 'file')
    $router->post('/attachments', [MessageController::class, 'uploadAttachment']);

    // Recipient autocomplete for ComposeModal
    $router->get('/recipients/search', [MessageController::class, 'searchRecipients']);

}, [AuthMiddleware::class]);

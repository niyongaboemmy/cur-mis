<?php

declare(strict_types=1);

use App\Controllers\ForumController;
use App\Middleware\AuthMiddleware;
use App\Middleware\MaybePermissionMiddleware;
use App\Constants\Permissions;

/**
 * Discussion forum API routes.
 *   - Reading + participating (threads, posts) needs VIEW_FORUMS.
 *   - Category management + thread moderation needs MODERATE_FORUMS.
 *   - Thread/post deletion ownership is enforced inside the controller.
 */
$router->group('/api/forums', function ($router) {

    // Read + participate — VIEW_FORUMS.
    $router->group('', function ($r) {
        $r->get('/categories',                 [ForumController::class, 'listCategories']);
        // Chat-room view (live message stream per category)
        $r->get('/categories/:id/messages',    [ForumController::class, 'roomMessages']);
        $r->post('/categories/:id/messages',   [ForumController::class, 'postRoomMessage']);
        $r->get('/categories/:id/threads',     [ForumController::class, 'listThreads']);
        $r->post('/categories/:id/threads',    [ForumController::class, 'createThread']);
        $r->get('/threads/:id',                [ForumController::class, 'showThread']);
        $r->post('/threads/:id/posts',         [ForumController::class, 'createPost']);
        $r->delete('/threads/:id',             [ForumController::class, 'deleteThread']);
        $r->delete('/posts/:id',               [ForumController::class, 'deletePost']);
    }, [new MaybePermissionMiddleware([
        Permissions::VIEW_FORUMS,
        Permissions::MODERATE_FORUMS,
    ])]);

    // Moderation — MODERATE_FORUMS.
    $router->group('', function ($r) {
        $r->post('/categories',        [ForumController::class, 'createCategory']);
        $r->put('/categories/:id',     [ForumController::class, 'updateCategory']);
        $r->delete('/categories/:id',  [ForumController::class, 'deleteCategory']);
        $r->put('/threads/:id',        [ForumController::class, 'updateThread']);
    }, [new MaybePermissionMiddleware([
        Permissions::MODERATE_FORUMS,
    ])]);

}, [AuthMiddleware::class]);

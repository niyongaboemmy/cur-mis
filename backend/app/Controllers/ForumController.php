<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use Core\Database;
use App\Models\ForumCategoryModel;
use App\Models\ForumThreadModel;
use App\Models\ForumPostModel;
use App\Models\AnnouncementModel;
use App\Helpers\ValidationHelper;
use App\Services\SystemLogService;

/**
 * Discussion forums — categories → threads → posts, with audience-scoped
 * visibility and moderation (pin / lock / soft-delete + category management).
 *
 * Read + participate: VIEW_FORUMS. Moderation: MODERATE_FORUMS.
 */
class ForumController extends BaseController
{
    private ForumCategoryModel $categories;
    private ForumThreadModel   $threads;
    private ForumPostModel      $posts;
    private Database            $db;

    public function __construct()
    {
        $this->categories = new ForumCategoryModel();
        $this->threads    = new ForumThreadModel();
        $this->posts      = new ForumPostModel();
        $this->db         = Database::getInstance();
    }

    /* ══════════════════════════════════════════════════════════════════════
     * Categories
     * ═══════════════════════════════════════════════════════════════════ */

    // GET /api/forums/categories
    public function listCategories(Request $request, Response $response): never
    {
        $actor     = (array) $request->param('_auth_user');
        $canMod    = $this->canModerate($actor);
        $audiences = $canMod ? ForumCategoryModel::AUDIENCES : AnnouncementModel::audiencesForRole((string) ($actor['role'] ?? ''));

        $this->success($response, $this->categories->listFor($audiences, $canMod), 'Categories fetched.');
    }

    // POST /api/forums/categories   (MODERATE)
    public function createCategory(Request $request, Response $response): never
    {
        $actor = (array) $request->param('_auth_user');
        $body  = $request->body();

        $errors = ValidationHelper::validate($body, ['name' => ['required', 'max:120']]);
        if (!empty($errors)) {
            $this->error($response, 'A category name is required.', 422, $errors);
        }

        $audience = in_array($body['audience'] ?? '', ForumCategoryModel::AUDIENCES, true) ? $body['audience'] : 'all';
        $id = (int) $this->categories->create([
            'name'        => trim((string) $body['name']),
            'slug'        => $this->categories->slugify((string) $body['name']),
            'description' => trim((string) ($body['description'] ?? '')) ?: null,
            'audience'    => $audience,
            'is_active'   => isset($body['is_active']) ? (int) ((bool) $body['is_active']) : 1,
            'sort_order'  => (int) ($body['sort_order'] ?? 0),
            'created_by'  => (int) $actor['id'],
        ]);

        SystemLogService::log('CREATE', 'FORUMS', "User {$actor['id']} created forum category {$id}.", $id, 'forum_category', null, $actor);
        $this->success($response, $this->categories->find($id), 'Category created.', 201);
    }

    // PUT /api/forums/categories/:id   (MODERATE)
    public function updateCategory(Request $request, Response $response): never
    {
        $actor = (array) $request->param('_auth_user');
        $id    = (int) $request->param('id');
        $body  = $request->body();

        if (!$this->categories->find($id)) {
            $this->error($response, 'Category not found.', 404);
        }

        $update = [];
        if (isset($body['name']) && trim((string) $body['name']) !== '') $update['name'] = trim((string) $body['name']);
        if (array_key_exists('description', $body)) $update['description'] = trim((string) $body['description']) ?: null;
        if (in_array($body['audience'] ?? '', ForumCategoryModel::AUDIENCES, true)) $update['audience'] = $body['audience'];
        if (isset($body['is_active']))  $update['is_active'] = (int) ((bool) $body['is_active']);
        if (isset($body['sort_order'])) $update['sort_order'] = (int) $body['sort_order'];

        if ($update) $this->categories->update($id, $update);

        SystemLogService::log('UPDATE', 'FORUMS', "User {$actor['id']} updated forum category {$id}.", $id, 'forum_category', null, $actor);
        $this->success($response, $this->categories->find($id), 'Category updated.');
    }

    // DELETE /api/forums/categories/:id   (MODERATE)
    public function deleteCategory(Request $request, Response $response): never
    {
        $actor = (array) $request->param('_auth_user');
        $id    = (int) $request->param('id');
        if (!$this->categories->find($id)) {
            $this->error($response, 'Category not found.', 404);
        }
        // Soft-delete the threads under it, then remove the category.
        $this->db->execute("UPDATE forum_threads SET is_deleted = 1 WHERE category_id = ?", [$id]);
        $this->categories->delete($id);

        SystemLogService::log('DELETE', 'FORUMS', "User {$actor['id']} deleted forum category {$id}.", $id, 'forum_category', null, $actor);
        $this->success($response, null, 'Category deleted.');
    }

    /* ══════════════════════════════════════════════════════════════════════
     * Threads
     * ═══════════════════════════════════════════════════════════════════ */

    // GET /api/forums/categories/:id/threads
    public function listThreads(Request $request, Response $response): never
    {
        $actor      = (array) $request->param('_auth_user');
        $categoryId = (int) $request->param('id');

        $cat = $this->categories->find($categoryId);
        if (!$cat) {
            $this->error($response, 'Category not found.', 404);
        }
        if (!$this->canSeeAudience((string) $cat['audience'], $actor)) {
            $this->error($response, 'You do not have access to this category.', 403);
        }

        $this->success($response, [
            'category' => $cat,
            'threads'  => $this->threads->listForCategory($categoryId),
        ], 'Threads fetched.');
    }

    // POST /api/forums/categories/:id/threads   body: { title, body }
    public function createThread(Request $request, Response $response): never
    {
        $actor      = (array) $request->param('_auth_user');
        $categoryId = (int) $request->param('id');
        $body       = $request->body();

        $cat = $this->categories->find($categoryId);
        if (!$cat || !(int) $cat['is_active']) {
            $this->error($response, 'Category not found.', 404);
        }
        if (!$this->canSeeAudience((string) $cat['audience'], $actor)) {
            $this->error($response, 'You do not have access to this category.', 403);
        }

        $errors = ValidationHelper::validate($body, [
            'title' => ['required', 'max:200'],
            'body'  => ['required', 'min:1'],
        ]);
        if (!empty($errors)) {
            $this->error($response, 'A title and message are required.', 422, $errors);
        }

        $threadId = $this->db->transaction(function () use ($categoryId, $body, $actor): int {
            $tid = (int) $this->threads->create([
                'category_id' => $categoryId,
                'title'       => trim((string) $body['title']),
                'created_by'  => (int) $actor['id'],
                'last_post_at'=> date('Y-m-d H:i:s'),
            ]);
            $this->posts->create([
                'thread_id'  => $tid,
                'body'       => trim((string) $body['body']),
                'created_by' => (int) $actor['id'],
            ]);
            return $tid;
        });

        SystemLogService::log('CREATE', 'FORUMS', "User {$actor['id']} started forum thread {$threadId}.", $threadId, 'forum_thread', null, $actor);
        $this->success($response, $this->threads->findWithMeta($threadId), 'Thread created.', 201);
    }

    // GET /api/forums/threads/:id
    public function showThread(Request $request, Response $response): never
    {
        $actor = (array) $request->param('_auth_user');
        $id    = (int) $request->param('id');

        $thread = $this->threads->findWithMeta($id);
        if (!$thread || (int) $thread['is_deleted'] === 1) {
            $this->error($response, 'Thread not found.', 404);
        }
        if (!$this->canSeeAudience((string) ($thread['category_audience'] ?? 'all'), $actor)) {
            $this->error($response, 'You do not have access to this thread.', 403);
        }

        $this->threads->incrementViews($id);

        $this->success($response, [
            'thread'      => $thread,
            'posts'       => $this->posts->listForThread($id),
            'can_moderate'=> $this->canModerate($actor),
        ], 'Thread fetched.');
    }

    // PUT /api/forums/threads/:id   (MODERATE)   body: { is_pinned?, is_locked? }
    public function updateThread(Request $request, Response $response): never
    {
        $actor = (array) $request->param('_auth_user');
        $id    = (int) $request->param('id');
        $body  = $request->body();

        if (!$this->threads->find($id)) {
            $this->error($response, 'Thread not found.', 404);
        }

        $update = [];
        if (isset($body['is_pinned'])) $update['is_pinned'] = (int) ((bool) $body['is_pinned']);
        if (isset($body['is_locked'])) $update['is_locked'] = (int) ((bool) $body['is_locked']);
        if (!$update) {
            $this->error($response, 'Nothing to update.', 422);
        }
        $this->threads->update($id, $update);

        SystemLogService::log('UPDATE', 'FORUMS', "User {$actor['id']} moderated thread {$id}.", $id, 'forum_thread', $update, $actor);
        $this->success($response, $this->threads->findWithMeta($id), 'Thread updated.');
    }

    // DELETE /api/forums/threads/:id   (owner or MODERATE)
    public function deleteThread(Request $request, Response $response): never
    {
        $actor  = (array) $request->param('_auth_user');
        $id     = (int) $request->param('id');
        $thread = $this->threads->find($id);
        if (!$thread) {
            $this->error($response, 'Thread not found.', 404);
        }
        if (!$this->ownsOrModerates($thread['created_by'] ?? null, $actor)) {
            $this->error($response, 'You can only remove your own threads.', 403);
        }
        $this->threads->update($id, ['is_deleted' => 1]);

        SystemLogService::log('DELETE', 'FORUMS', "User {$actor['id']} deleted thread {$id}.", $id, 'forum_thread', null, $actor);
        $this->success($response, null, 'Thread removed.');
    }

    /* ══════════════════════════════════════════════════════════════════════
     * Posts
     * ═══════════════════════════════════════════════════════════════════ */

    // POST /api/forums/threads/:id/posts   body: { body }
    public function createPost(Request $request, Response $response): never
    {
        $actor    = (array) $request->param('_auth_user');
        $threadId = (int) $request->param('id');
        $body     = $request->body();

        $thread = $this->threads->findWithMeta($threadId);
        if (!$thread || (int) $thread['is_deleted'] === 1) {
            $this->error($response, 'Thread not found.', 404);
        }
        if (!$this->canSeeAudience((string) ($thread['category_audience'] ?? 'all'), $actor)) {
            $this->error($response, 'You do not have access to this thread.', 403);
        }
        if ((int) $thread['is_locked'] === 1 && !$this->canModerate($actor)) {
            $this->error($response, 'This thread is locked.', 423);
        }

        $errors = ValidationHelper::validate($body, ['body' => ['required', 'min:1']]);
        if (!empty($errors)) {
            $this->error($response, 'A message is required.', 422, $errors);
        }

        $postId = (int) $this->posts->create([
            'thread_id'  => $threadId,
            'body'       => trim((string) $body['body']),
            'created_by' => (int) $actor['id'],
        ]);
        $this->threads->touch($threadId);

        SystemLogService::log('CREATE', 'FORUMS', "User {$actor['id']} replied in thread {$threadId}.", $postId, 'forum_post', null, $actor);

        $post = $this->db->fetchOne(
            "SELECT p.*, u.full_name AS author_name, u.photo AS author_photo, r.name AS author_role
             FROM forum_posts p LEFT JOIN users u ON u.id = p.created_by
             LEFT JOIN roles r ON r.id = u.role_id WHERE p.id = ?",
            [$postId]
        );
        $this->success($response, $post, 'Reply posted.', 201);
    }

    // DELETE /api/forums/posts/:id   (owner or MODERATE)
    public function deletePost(Request $request, Response $response): never
    {
        $actor = (array) $request->param('_auth_user');
        $id    = (int) $request->param('id');
        $post  = $this->posts->find($id);
        if (!$post) {
            $this->error($response, 'Post not found.', 404);
        }
        if (!$this->ownsOrModerates($post['created_by'] ?? null, $actor)) {
            $this->error($response, 'You can only remove your own posts.', 403);
        }
        $this->posts->update($id, ['is_deleted' => 1]);

        SystemLogService::log('DELETE', 'FORUMS', "User {$actor['id']} deleted post {$id}.", $id, 'forum_post', null, $actor);
        $this->success($response, null, 'Post removed.');
    }

    /* ══════════════════════════════════════════════════════════════════════
     * Chat-room view — each category is a live room, messages are a flat stream
     * backed by a single canonical thread. Polled by the client for ~realtime.
     * ═══════════════════════════════════════════════════════════════════ */

    // GET /api/forums/categories/:id/messages[?after_id=N]
    /**
     * Room message stream. With `after_id` returns only newer messages (used by
     * the client's poll loop); without it returns the most recent 80, ascending.
     */
    public function roomMessages(Request $request, Response $response): never
    {
        $actor      = (array) $request->param('_auth_user');
        $categoryId = (int) $request->param('id');

        $cat = $this->categories->find($categoryId);
        if (!$cat) {
            $this->error($response, 'Room not found.', 404);
        }
        if (!$this->canSeeAudience((string) $cat['audience'], $actor)) {
            $this->error($response, 'You do not have access to this room.', 403);
        }

        $threadId = $this->roomThreadId($categoryId, (string) $cat['name'], (int) $actor['id']);
        $afterId  = (int) ($request->query('after_id') ?? 0);

        if ($afterId > 0) {
            $rows = $this->db->fetchAll(
                "SELECT p.id, p.body, p.created_by, p.created_at,
                        u.full_name AS author_name, u.photo AS author_photo, r.name AS author_role
                 FROM forum_posts p
                 LEFT JOIN users u ON u.id = p.created_by
                 LEFT JOIN roles r ON r.id = u.role_id
                 WHERE p.thread_id = ? AND p.is_deleted = 0 AND p.id > ?
                 ORDER BY p.id ASC",
                [$threadId, $afterId]
            );
        } else {
            $rows = array_reverse($this->db->fetchAll(
                "SELECT p.id, p.body, p.created_by, p.created_at,
                        u.full_name AS author_name, u.photo AS author_photo, r.name AS author_role
                 FROM forum_posts p
                 LEFT JOIN users u ON u.id = p.created_by
                 LEFT JOIN roles r ON r.id = u.role_id
                 WHERE p.thread_id = ? AND p.is_deleted = 0
                 ORDER BY p.id DESC
                 LIMIT 80",
                [$threadId]
            ));
        }

        $this->success($response, [
            'room_thread_id' => $threadId,
            'messages'       => $rows,
            'can_moderate'   => $this->canModerate($actor),
            'me'             => (int) $actor['id'],
        ], 'Messages fetched.');
    }

    // POST /api/forums/categories/:id/messages   body: { body }
    public function postRoomMessage(Request $request, Response $response): never
    {
        $actor      = (array) $request->param('_auth_user');
        $categoryId = (int) $request->param('id');
        $body       = $request->body();

        $cat = $this->categories->find($categoryId);
        if (!$cat || !(int) $cat['is_active']) {
            $this->error($response, 'Room not found.', 404);
        }
        if (!$this->canSeeAudience((string) $cat['audience'], $actor)) {
            $this->error($response, 'You do not have access to this room.', 403);
        }

        $text = trim((string) ($body['body'] ?? ''));
        if ($text === '') {
            $this->error($response, 'Message cannot be empty.', 422);
        }
        if (mb_strlen($text) > 4000) {
            $text = mb_substr($text, 0, 4000);
        }

        $threadId = $this->roomThreadId($categoryId, (string) $cat['name'], (int) $actor['id']);

        $postId = (int) $this->posts->create([
            'thread_id'  => $threadId,
            'body'       => $text,
            'created_by' => (int) $actor['id'],
        ]);
        $this->threads->touch($threadId);

        $msg = $this->db->fetchOne(
            "SELECT p.id, p.body, p.created_by, p.created_at,
                    u.full_name AS author_name, u.photo AS author_photo, r.name AS author_role
             FROM forum_posts p
             LEFT JOIN users u ON u.id = p.created_by
             LEFT JOIN roles r ON r.id = u.role_id
             WHERE p.id = ?",
            [$postId]
        );
        $this->success($response, $msg, 'Message sent.', 201);
    }

    /**
     * Get (or lazily create) the canonical message thread that backs a category's
     * chat room — the oldest non-deleted thread, else a fresh one.
     */
    private function roomThreadId(int $categoryId, string $name, int $actorId): int
    {
        $row = $this->db->fetchOne(
            "SELECT id FROM forum_threads WHERE category_id = ? AND is_deleted = 0 ORDER BY id ASC LIMIT 1",
            [$categoryId]
        );
        if ($row && !empty($row['id'])) {
            return (int) $row['id'];
        }
        return (int) $this->threads->create([
            'category_id'  => $categoryId,
            'title'        => $name !== '' ? $name : 'Room',
            'created_by'   => $actorId ?: null,
            'last_post_at' => date('Y-m-d H:i:s'),
        ]);
    }

    /* ── helpers ──────────────────────────────────────────────────────────── */

    private function canModerate(array $actor): bool
    {
        if (in_array($actor['role'] ?? '', ['superadmin', 'admin'], true)) return true;
        return in_array('MODERATE_FORUMS', (array) ($actor['permissions'] ?? []), true);
    }

    private function canSeeAudience(string $audience, array $actor): bool
    {
        if ($this->canModerate($actor)) return true;
        return in_array($audience, AnnouncementModel::audiencesForRole((string) ($actor['role'] ?? '')), true);
    }

    private function ownsOrModerates(mixed $ownerId, array $actor): bool
    {
        if ($this->canModerate($actor)) return true;
        return (int) $ownerId === (int) ($actor['id'] ?? 0);
    }
}

<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use Core\Database;
use App\Services\WebPushService;

/**
 * Device push subscriptions for the signed-in user.
 *
 * Like the notification centre, everything is scoped to the caller: a user can
 * only register or remove devices on their own account.
 */
class PushController extends BaseController
{
    /**
     * GET /api/push/vapid-key
     * The public key the browser needs to subscribe. Not secret.
     */
    public function vapidKey(Request $request, Response $response): never
    {
        $this->success($response, [
            'enabled'    => WebPushService::isConfigured(),
            'public_key' => WebPushService::publicKey(),
        ], 'VAPID key fetched.');
    }

    /**
     * POST /api/push/subscribe
     * Body: { endpoint: string, keys: { p256dh: string, auth: string } }
     */
    public function subscribe(Request $request, Response $response): never
    {
        $userId = $this->userId($request, $response);
        $body   = $request->body();

        $endpoint = trim((string) ($body['endpoint'] ?? ''));
        $p256dh   = trim((string) ($body['keys']['p256dh'] ?? ''));
        $auth     = trim((string) ($body['keys']['auth'] ?? ''));

        // Push services only accept https endpoints; anything else is not a real subscription.
        if (!str_starts_with($endpoint, 'https://') || strlen($endpoint) > 2000) {
            $this->error($response, 'A valid push endpoint is required.', 422);
        }
        $p256dhRaw = WebPushService::b64urlDecode($p256dh);
        $authRaw   = WebPushService::b64urlDecode($auth);
        if (strlen($p256dhRaw) !== 65 || $p256dhRaw[0] !== "\x04" || strlen($authRaw) !== 16) {
            $this->error($response, 'Subscription keys are invalid.', 422);
        }

        Database::getInstance()->execute(
            'INSERT INTO push_subscriptions (user_id, endpoint_hash, endpoint, p256dh, auth, user_agent)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), p256dh = VALUES(p256dh),
                                     auth = VALUES(auth), user_agent = VALUES(user_agent)',
            [
                $userId,
                hash('sha256', $endpoint),
                $endpoint,
                $p256dh,
                $auth,
                mb_substr((string) ($request->header('User-Agent') ?? ''), 0, 255),
            ]
        );

        $this->success($response, null, 'Device alerts turned on.', 201);
    }

    /**
     * POST /api/push/unsubscribe
     * Body: { endpoint: string }
     */
    public function unsubscribe(Request $request, Response $response): never
    {
        $userId   = $this->userId($request, $response);
        $endpoint = trim((string) ($request->body()['endpoint'] ?? ''));

        if ($endpoint !== '') {
            Database::getInstance()->execute(
                'DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint_hash = ?',
                [$userId, hash('sha256', $endpoint)]
            );
        }

        $this->success($response, null, 'Device alerts turned off.');
    }

    /**
     * The signed-in user's id. AuthMiddleware has validated the token already,
     * so a missing id is a broken account, not an expired session: answer 403
     * rather than 401, because the frontend treats 401 as a logout.
     */
    private function userId(Request $request, Response $response): int
    {
        $actor = (array) $request->param('_auth_user');
        $id    = (int) ($actor['id'] ?? 0);

        if ($id <= 0) {
            $this->error($response, 'This account cannot register devices.', 403);
        }
        return $id;
    }
}

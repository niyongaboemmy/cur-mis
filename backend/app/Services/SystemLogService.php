<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\SystemLogModel;

class SystemLogService
{
    /**
     * Write an audit log entry. Never throws — a logging failure must never
     * kill a legitimate request.
     *
     * @param string      $action      CREATE|UPDATE|DELETE|LOGIN|LOGOUT|APPROVE|REJECT|GENERATE|EXPORT|ASSIGN
     * @param string      $module      AUTH|USERS|ROLES|FINANCE|HR|ADMISSIONS|STUDENTS|SYSTEM
     * @param string      $description Human-readable sentence describing the event.
     * @param int|null    $entityId    Primary key of the affected record.
     * @param string|null $entityType  Table/type name (e.g. 'fee_payment').
     * @param array|null  $metadata    Extra JSON-serialisable context.
     * @param array|null  $actor       Pre-decoded JWT user array; if null, decoded from Authorization header.
     */
    public static function log(
        string  $action,
        string  $module,
        string  $description,
        ?int    $entityId   = null,
        ?string $entityType = null,
        ?array  $metadata   = null,
        ?array  $actor      = null
    ): void {
        try {
            if ($actor === null) {
                $actor = static::resolveActorFromHeader();
            }

            (new SystemLogModel())->create([
                'user_id'     => isset($actor['id']) ? (int) $actor['id'] : null,
                'user_name'   => $actor['full_name'] ?? ($actor['name'] ?? ''),
                'user_email'  => $actor['email'] ?? '',
                'action'      => strtoupper($action),
                'module'      => strtoupper($module),
                'entity_type' => $entityType,
                'entity_id'   => $entityId,
                'description' => $description,
                'ip_address'  => static::resolveIp(),
                'metadata'    => $metadata !== null ? json_encode($metadata) : null,
            ]);
        } catch (\Throwable) {
            // Intentionally silent — logging must never break business logic.
        }
    }

    private static function resolveActorFromHeader(): array
    {
        try {
            $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
            if (!str_starts_with($header, 'Bearer ')) {
                return [];
            }
            $token = substr($header, 7);
            $auth  = new AuthService();
            $decoded = $auth->decodeToken($token);
            if (!$decoded) {
                return [];
            }
            return $decoded['user'] ?? $decoded;
        } catch (\Throwable) {
            return [];
        }
    }

    private static function resolveIp(): string
    {
        foreach (['HTTP_X_FORWARDED_FOR', 'HTTP_CLIENT_IP', 'REMOTE_ADDR'] as $key) {
            $val = $_SERVER[$key] ?? '';
            if ($val !== '') {
                return trim(explode(',', $val)[0]);
            }
        }
        return '';
    }
}

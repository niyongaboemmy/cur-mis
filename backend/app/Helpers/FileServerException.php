<?php

declare(strict_types=1);

namespace App\Helpers;

use RuntimeException;

/**
 * Raised by FileServerClient.
 *
 * Distinguishes the two very different reasons an upload can fail, because they
 * need opposite handling:
 *
 *  - CLIENT  — the user's file is genuinely unacceptable (too big, wrong type).
 *              Safe and useful to show verbatim; maps to HTTP 422.
 *  - UPSTREAM — the storage service itself refused or could not be reached
 *              (bad/missing API key, network error, 5xx). Nothing the user can
 *              fix by choosing a different file; maps to HTTP 502 and the real
 *              cause goes to the error log, not to the browser.
 *
 * Before this split, an upstream 401 ("Invalid API Key") was reported to
 * students as a 422 validation error on their photo, which sent everyone
 * looking at the file instead of at the misconfigured FILE_SERVER_KEY.
 */
class FileServerException extends RuntimeException
{
    public const KIND_CLIENT   = 'client';
    public const KIND_UPSTREAM = 'upstream';

    private string $kind;

    /** Operator-facing detail — logged, never returned to the client. */
    private string $detail;

    public function __construct(string $message, string $kind = self::KIND_CLIENT, string $detail = '')
    {
        parent::__construct($message);
        $this->kind   = $kind;
        $this->detail = $detail !== '' ? $detail : $message;
    }

    public static function client(string $message): self
    {
        return new self($message, self::KIND_CLIENT);
    }

    public static function upstream(string $detail): self
    {
        return new self(
            'The file storage service is unavailable. Please try again shortly — if this continues, contact the system administrator.',
            self::KIND_UPSTREAM,
            $detail
        );
    }

    public function isUpstream(): bool
    {
        return $this->kind === self::KIND_UPSTREAM;
    }

    /** HTTP status the API should respond with for this failure. */
    public function httpStatus(): int
    {
        return $this->isUpstream() ? 502 : 422;
    }

    public function detail(): string
    {
        return $this->detail;
    }
}

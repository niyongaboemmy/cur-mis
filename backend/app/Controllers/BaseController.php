<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;

abstract class BaseController
{
    protected function success(Response $response, mixed $data = null, string $message = 'Success', int $status = 200, array $extra = []): never
    {
        $response->success($data, $message, $status, $extra);
    }

    protected function error(Response $response, string $message, int $status = 400, mixed $errors = null): never
    {
        $response->error($message, $status, $errors);
    }

    /**
     * Terminate a request that failed inside the file-storage service.
     *
     * Upstream failures (bad API key, unreachable service) become a 502 and the
     * technical cause goes to the error log only — telling a student their photo
     * is a 422 validation problem when the real cause is a mismatched
     * FILE_SERVER_KEY sends everyone debugging in the wrong direction, and the
     * upstream message can leak infrastructure detail. Genuine file problems
     * (too large, wrong type) still surface verbatim as a 422.
     */
    protected function failFromFileServer(Response $response, \RuntimeException $e): never
    {
        if ($e instanceof \App\Helpers\FileServerException && $e->isUpstream()) {
            error_log('[FileServer] ' . $e->detail());
            $this->error($response, $e->getMessage(), $e->httpStatus());
        }

        $this->error($response, $e->getMessage(), 422);
    }
}

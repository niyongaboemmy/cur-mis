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
}

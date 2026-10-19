<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Services\AcademicScopeService;
use Core\Request;
use Core\Response;

/**
 * Tells the frontend whether the signed-in user is a scoped Dean / HOD, so the
 * sidebar can hide finance, admissions and HR menus.
 */
class AcademicScopeController extends BaseController
{
    public function me(Request $request, Response $response): never
    {
        $authUser = (array) ($request->param('_auth_user') ?? []);
        $scope    = AcademicScopeService::forUser($authUser);

        $this->success($response, [
            'scoped'         => $scope !== null,
            'level'          => $scope['level'] ?? null,
            'faculty_ids'    => $scope['faculty_ids'] ?? [],
            'department_ids' => $scope['department_ids'] ?? [],
        ]);
    }
}

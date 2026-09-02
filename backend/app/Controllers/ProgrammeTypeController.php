<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use Core\Database;

/**
 * Programme Types Controller
 * Manages the lookup table for programme types (Day, Evening, Weekend, Holiday, etc.)
 */
class ProgrammeTypeController extends BaseController
{
    /**
     * GET /api/portal/programme-types
     * Returns all active programme types for the application wizard.
     */
    public function getAllTypes(Request $request, Response $response): never
    {
        $db = Database::getInstance();
        $types = $db->fetchAll(
            "SELECT id, name, display_name FROM `programme_types` WHERE is_active = 1 ORDER BY id ASC"
        );

        $this->success($response, $types, 'Programme types fetched successfully.');
    }
}

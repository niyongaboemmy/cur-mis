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

        try {
            $types = $db->fetchAll(
                "SELECT id, name, display_name FROM `programme_types` WHERE is_active = 1 ORDER BY id ASC"
            );
        } catch (\Exception $e) {
            // Fallback if table doesn't exist (migration not run)
            $types = [
                ['id' => 1, 'name' => 'day', 'display_name' => 'Day'],
                ['id' => 2, 'name' => 'evening', 'display_name' => 'Evening'],
                ['id' => 3, 'name' => 'weekend', 'display_name' => 'Weekend'],
                ['id' => 4, 'name' => 'holiday', 'display_name' => 'Holiday'],
                ['id' => 5, 'name' => 'distance_learning', 'display_name' => 'Distance Learning'],
            ];
        }

        $this->success($response, $types, 'Programme types fetched successfully.');
    }
}

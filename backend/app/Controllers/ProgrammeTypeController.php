<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;

/**
 * Programme Types Controller
 * Manages the lookup table for programme types (Day, Evening, Weekend, Holiday, etc.)
 */
class ProgrammeTypeController extends BaseController
{
    /**
     * Get all active programme types
     * GET /api/portal/programme-types
     * Public endpoint - no authentication required
     */
    public function getAllTypes(Request $request, Response $response): never
    {
        try {
            $db = \Config\Database::connect();
            $types = $db->table('programme_types')
                ->where('is_active', 1)
                ->orderBy('id', 'ASC')
                ->select('id, name, display_name')
                ->get()
                ->getResultArray();

            $this->success($response, $types);

        } catch (\Exception $e) {
            error_log('Error getting programme types: ' . $e->getMessage());
            $this->error($response, 'Failed to get programme types', 500);
        }
    }
}

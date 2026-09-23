<?php

declare(strict_types=1);

use App\Controllers\ProgrammeTypeController;

/**
 * Programme Types Routes (Public Portal)
 * Get all available programme types for the application form
 */

$router->get('/api/portal/programme-types', [ProgrammeTypeController::class, 'getAllTypes']);

<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Models\HrEmployeeModel;
use App\Services\StaffCategoryClassifier;
use App\Services\SystemLogService;

class StaffCategoryController extends BaseController
{
    /**
     * POST /api/employees/staff-categories
     * Body: { "apply": false }  – preview only (default)
     *       { "apply": true }   – save the Academic / Administrative categories
     *
     * Uses the bundled CUR lists. Names that are unmatched, ambiguous or on both
     * lists are never saved.
     */
    public function sync(Request $request, Response $response): never
    {
        $db    = (new HrEmployeeModel())->db();
        $apply = (bool)($request->body()['apply'] ?? false);

        $plan = StaffCategoryClassifier::plan($db, StaffCategoryClassifier::curLists());
        $applied = 0;
        if ($apply) {
            $applied = StaffCategoryClassifier::apply($db, $plan);
            $actor = (array) $request->param('_auth_user');
            SystemLogService::log('UPDATE', 'HR', "Classified {$applied} staff as Academic or Administrative from the CUR list.", null, 'employees', ['counts' => $plan['counts']], $actor ?: null);
        }

        $this->success($response, [
            'applied' => $applied,
            'counts'  => $plan['counts'],
            'unmatched' => $plan['unmatched'],
            'ambiguous' => $plan['ambiguous'],
            'conflicts' => $plan['conflicts'],
        ], $apply ? "Saved {$applied} staff categories." : 'Preview ready.');
    }
}

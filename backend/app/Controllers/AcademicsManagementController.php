<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Models\RoomModel;
use App\Models\DepartmentModel;
use App\Models\OptionModel;
use App\Models\LevelModel;
use App\Models\LeaveTypeModel;
use App\Models\ModuleModel;
use App\Models\FacultyModel;
use App\Models\SchoolModel;
use App\Models\IntakeModel;
use App\Models\DegreeModel;
use App\Models\CampusModel;
use App\Helpers\ValidationHelper;

/**
 * Handles CRUD for general academic entities.
 */
class AcademicsManagementController extends BaseController
{
    private array $models = [];

    public function __construct()
    {
        $this->models = [
            'facility'    => new RoomModel(),
            'departments' => new DepartmentModel(),
            'faculties'   => new FacultyModel(),
            'options'     => new OptionModel(),
            'levels'      => new LevelModel(),
            'leave_types' => new LeaveTypeModel(),
            'modules'     => new ModuleModel(),
            'schools'     => new SchoolModel(),
            'intakes'     => new IntakeModel(),
            'degrees'     => new DegreeModel(),
            'campuses'    => new CampusModel(),
        ];
    }

    /**
     * Resolve the target entity from the request.
     */
    private function resolveEntity(Request $request): ?string
    {
        $entity = $request->param('entity');
        if ($entity !== null && $entity !== '') {
            return $entity;
        }
        $uri = $request->uri();
        if (preg_match('#/academics-management/([a-z_]+)#', $uri, $m)) {
            return $m[1];
        }
        return null;
    }

    public function index(Request $request, Response $response): never
    {
        $entity = $this->resolveEntity($request);
        if (!isset($this->models[$entity])) {
            $this->error($response, 'Entity not found.', 404);
        }

        $page    = (int)($request->query('page')     ?? 1);
        $perPage = (int)($request->query('per_page') ?? 1000); // use a larger limit if needed for dropdowns

        // Modules use the dedicated catalog query so each row carries its
        // prerequisites and the programmes it belongs to. Filters: program,
        // department, level, status, q (free-text on code/name).
        if ($entity === 'modules') {
            /** @var ModuleModel $moduleModel */
            $moduleModel = $this->models['modules'];
            $paginated = $moduleModel->listWithPrereqs($page, $perPage, [
                'program'    => $request->query('program')    ?: null,
                'department' => $request->query('department') ?: null,
                'level'      => $request->query('level')      ?: null,
                'status'     => $request->query('status')     ?: null,
                'q'          => $request->query('q')          ?: null,
            ]);
            $this->success($response, $paginated, 'Modules fetched.');
        }

        // Extract filters (e.g. ?department=1&level=1)
        $whereClauses = [];
        $bindings = [];
        $allowedFilters = ['department', 'level', 'fac_id', 'department_id', 'program_level'];

        foreach ($allowedFilters as $filter) {
            $val = $request->query($filter);
            if ($val !== null && $val !== '') {
                $whereClauses[] = "`{$filter}` = ?";
                $bindings[] = $val;
            }
        }

        $where = implode(' AND ', $whereClauses);

        $paginated = $this->models[$entity]->paginate($page, $perPage, $where, $bindings);

        // Enrich programs/options rows with the campuses they're hosted on, so
        // the admin UI can render campus pills and counts without N+1 calls.
        if ($entity === 'options' && !empty($paginated['data'])) {
            $optionIds = array_map(static fn($r) => (int)$r['id'], $paginated['data']);
            /** @var \App\Models\OptionModel $optionModel */
            $optionModel = $this->models['options'];
            $byOption    = $optionModel->campusIdsForOptions($optionIds);
            foreach ($paginated['data'] as &$row) {
                $row['campus_ids'] = $byOption[(int)$row['id']] ?? [];
            }
            unset($row);
        }

        $this->success($response, $paginated, ucfirst($entity) . ' fetched.');
    }

    /**
     * GET /api/academics-management/options/:id/campuses
     * Return the campus IDs and full campus rows linked to a program.
     */
    public function listOptionCampuses(Request $request, Response $response): never
    {
        $optionId = (int)$request->param('id');
        /** @var \App\Models\OptionModel $optionModel */
        $optionModel = $this->models['options'];

        if (!$optionModel->find($optionId)) {
            $this->error($response, 'Program not found.', 404);
        }

        $ids = $optionModel->getCampusIds($optionId);
        $campuses = [];
        if (!empty($ids)) {
            $ph = implode(',', array_fill(0, count($ids), '?'));
            $campuses = $optionModel->db()->fetchAll(
                "SELECT * FROM `campuses` WHERE id IN ($ph) ORDER BY name ASC",
                $ids,
            );
        }

        $this->success($response, [
            'option_id'  => $optionId,
            'campus_ids' => $ids,
            'campuses'   => $campuses,
        ], 'Program campuses fetched.');
    }

    /**
     * PUT /api/academics-management/options/:id/campuses
     * Replace the full set of campuses linked to a program.
     * Body: { campus_ids: number[] }
     */
    public function setOptionCampuses(Request $request, Response $response): never
    {
        $optionId = (int)$request->param('id');
        /** @var \App\Models\OptionModel $optionModel */
        $optionModel = $this->models['options'];

        if (!$optionModel->find($optionId)) {
            $this->error($response, 'Program not found.', 404);
        }

        $body = $request->body();
        $raw  = $body['campus_ids'] ?? [];
        if (!is_array($raw)) {
            $this->error($response, 'campus_ids must be an array.', 422);
        }
        $campusIds = array_values(array_filter(array_map('intval', $raw), fn($v) => $v > 0));

        // Validate every campus exists, so we don't store dangling refs even
        // though FK cascade would catch it eventually.
        if (!empty($campusIds)) {
            $ph = implode(',', array_fill(0, count($campusIds), '?'));
            $row = $optionModel->db()->fetchOne(
                "SELECT COUNT(*) AS cnt FROM `campuses` WHERE id IN ($ph)",
                $campusIds,
            );
            if ((int)($row['cnt'] ?? 0) !== count($campusIds)) {
                $this->error($response, 'One or more campuses do not exist.', 422);
            }
        }

        $optionModel->setCampusIds($optionId, $campusIds);

        $this->success($response, [
            'option_id'  => $optionId,
            'campus_ids' => $campusIds,
        ], 'Program campuses updated.');
    }

    public function show(Request $request, Response $response): never
    {
        $entity = $this->resolveEntity($request);
        $id     = (int)$request->param('id');

        if (!isset($this->models[$entity])) {
            $this->error($response, 'Entity not found.', 404);
        }

        // Modules carry both prerequisites and the programmes they belong
        // to, so callers (the edit form, in particular) can render their
        // current state without follow-up calls.
        if ($entity === 'modules') {
            /** @var ModuleModel $moduleModel */
            $moduleModel = $this->models['modules'];
            $item = $moduleModel->findWithPrereqs($id);
            if (!$item) {
                $this->error($response, 'Item not found.', 404);
            }
            $this->success($response, $item, 'Module details fetched.');
        }

        $item = $this->models[$entity]->find($id);
        if (!$item) {
            $this->error($response, 'Item not found.', 404);
        }

        $this->success($response, $item, ucfirst($entity) . ' details fetched.');
    }

    public function create(Request $request, Response $response): never
    {
        $entity = $this->resolveEntity($request);
        $data   = $request->body();

        if (!isset($this->models[$entity])) {
            $this->error($response, 'Entity not found.', 404);
        }

        // For modules, `program_ids` and `level_ids` are meta — pull them
        // out before model write.
        $programIds = null;
        $levelIds   = null;
        if ($entity === 'modules') {
            if (array_key_exists('program_ids', $data)) {
                $programIds = is_array($data['program_ids']) ? $data['program_ids'] : [];
                unset($data['program_ids']);
            }
            if (array_key_exists('level_ids', $data)) {
                $levelIds = is_array($data['level_ids']) ? $data['level_ids'] : [];
                unset($data['level_ids']);
            }
        }

        $errors = ValidationHelper::validate($data, $this->getValidationRules($entity));
        if (!empty($errors)) {
            $this->error($response, 'Validation failed', 422, $errors);
        }

        // Auto-fill legacy single-value columns so older readers keep working.
        if ($entity === 'modules') {
            if (empty($data['department']) && !empty($programIds)) {
                $optModel = $this->models['options'];
                $first = $optModel->find((int)$programIds[0]);
                if ($first && !empty($first['department_id'])) {
                    $data['department'] = (int)$first['department_id'];
                }
            }
            if (empty($data['level']) && !empty($levelIds)) {
                $data['level'] = (int)$levelIds[0];
            }
        }

        $id = $this->models[$entity]->create($data);

        if ($entity === 'modules') {
            /** @var ModuleModel $moduleModel */
            $moduleModel = $this->models['modules'];
            if ($programIds !== null) $moduleModel->syncPrograms((int)$id, $programIds);
            // Keep `module_levels` consistent with the single `level` column —
            // the form is single-select, but the join table stays in sync so
            // existing readers don't drift.
            if ($levelIds !== null) {
                $moduleModel->syncLevels((int)$id, $levelIds);
            } elseif (!empty($data['level'])) {
                $moduleModel->syncLevels((int)$id, [(int)$data['level']]);
            }
        }

        $this->success($response, ['id' => $id], ucfirst($entity) . ' created.', 201);
    }

    public function update(Request $request, Response $response): never
    {
        $entity = $this->resolveEntity($request);
        $id     = (int)$request->param('id');
        $data   = $request->body();

        if (!isset($this->models[$entity])) {
            $this->error($response, 'Entity not found.', 404);
        }

        if (!$this->models[$entity]->find($id)) {
            $this->error($response, 'Item not found.', 404);
        }

        $programIds = null;
        $levelIds   = null;
        if ($entity === 'modules') {
            if (array_key_exists('program_ids', $data)) {
                $programIds = is_array($data['program_ids']) ? $data['program_ids'] : [];
                unset($data['program_ids']);
            }
            if (array_key_exists('level_ids', $data)) {
                $levelIds = is_array($data['level_ids']) ? $data['level_ids'] : [];
                unset($data['level_ids']);
            }
        }

        $errors = ValidationHelper::validate($data, $this->getValidationRules($entity));
        if (!empty($errors)) {
            $this->error($response, 'Validation failed', 422, $errors);
        }

        if ($entity === 'modules') {
            if (empty($data['department']) && !empty($programIds)) {
                $optModel = $this->models['options'];
                $first = $optModel->find((int)$programIds[0]);
                if ($first && !empty($first['department_id'])) {
                    $data['department'] = (int)$first['department_id'];
                }
            }
            if (empty($data['level']) && !empty($levelIds)) {
                $data['level'] = (int)$levelIds[0];
            }
        }

        $this->models[$entity]->update($id, $data);

        if ($entity === 'modules') {
            /** @var ModuleModel $moduleModel */
            $moduleModel = $this->models['modules'];
            if ($programIds !== null) $moduleModel->syncPrograms($id, $programIds);
            if ($levelIds !== null) {
                $moduleModel->syncLevels($id, $levelIds);
            } elseif (!empty($data['level'])) {
                $moduleModel->syncLevels($id, [(int)$data['level']]);
            }
        }

        $this->success($response, null, ucfirst($entity) . ' updated.');
    }

    public function delete(Request $request, Response $response): never
    {
        $entity = $this->resolveEntity($request);
        $id     = (int)$request->param('id');

        if (!isset($this->models[$entity])) {
            $this->error($response, 'Entity not found.', 404);
        }

        $this->models[$entity]->delete($id);
        $this->success($response, null, ucfirst($entity) . ' deleted.');
    }

    private function getValidationRules(string $entity): array
    {
        $commonRules = [
            'is_active' => ['numeric', 'in:0,1'],
        ];

        $rules = match ($entity) {
            'facility' => [
                'name'      => ['required', 'min:2'],
                'building'  => ['string'],
                'capacity'  => ['required', 'numeric'],
                'room_type' => ['in:lecture,lab,seminar,exam_hall'],
            ],
            'departments' => [
                'dep_name'        => ['required', 'min:3'],
                'dep_acronym'     => ['string'],
                'fac_id'          => ['required', 'numeric'],
                'dep_description' => ['string'],
            ],
            'options' => [
                'name'          => ['required', 'min:3'],
                'department_id' => ['required', 'numeric'],
            ],
            'levels' => [
                'name' => ['required'],
            ],
            'leave_types' => [
                'name'         => ['required'],
                'days_allowed' => ['required', 'numeric'],
                'is_paid'      => ['numeric', 'in:0,1'],
            ],
            'modules' => [
                'module_name'    => ['required', 'min:3'],
                'module_code'    => ['required'],
                'module_credits' => ['required', 'numeric'],
                'department'     => ['numeric'],
                'level'          => ['numeric'],
            ],
            'schools' => [
                'school_name'     => ['required', 'min:3'],
                'school_descript' => ['string'],
                'school_address'  => ['string'],
                'school_phone'    => ['string'],
                'school_email'    => ['string'],
                'url'             => ['string'],
            ],
            'degrees' => [
                'code'           => ['required', 'min:2'],
                'name'           => ['required', 'min:3'],
                'department_id'  => ['numeric'],
                'degree_type'    => ['string'],
                'duration_years' => ['numeric'],
                'total_credits'  => ['numeric'],
            ],
            'intakes' => [
                'name'       => ['required', 'min:3'],
                'start_date' => ['required'],
                'end_date'   => ['required'],
            ],
            'campuses' => [
                'name'     => ['required', 'min:2'],
                'code'     => ['string'],
                'location' => ['string'],
                'address'  => ['string'],
                'phone'    => ['string'],
                'email'    => ['string'],
            ],
            default => [],
        };

        return array_merge($rules, $commonRules);
    }
}

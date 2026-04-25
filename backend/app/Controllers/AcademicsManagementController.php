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
use App\Models\SchoolModel;
use App\Models\IntakeModel;
use App\Models\DegreeModel;
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
            'options'     => new OptionModel(),
            'levels'      => new LevelModel(),
            'leave_types' => new LeaveTypeModel(),
            'modules'     => new ModuleModel(),
            'schools'     => new SchoolModel(),
            'intakes'     => new IntakeModel(),
            'degrees'     => new DegreeModel(),
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
        $this->success($response, $paginated, ucfirst($entity) . ' fetched.');
    }

    public function show(Request $request, Response $response): never
    {
        $entity = $this->resolveEntity($request);
        $id     = (int)$request->param('id');

        if (!isset($this->models[$entity])) {
            $this->error($response, 'Entity not found.', 404);
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

        $errors = ValidationHelper::validate($data, $this->getValidationRules($entity));
        if (!empty($errors)) {
            $this->error($response, 'Validation failed', 422, $errors);
        }

        $id = $this->models[$entity]->create($data);
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

        $errors = ValidationHelper::validate($data, $this->getValidationRules($entity));
        if (!empty($errors)) {
            $this->error($response, 'Validation failed', 422, $errors);
        }

        $this->models[$entity]->update($id, $data);
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
                'department'     => ['required', 'numeric'],
                'level'          => ['required', 'numeric'],
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
            default => [],
        };

        return array_merge($rules, $commonRules);
    }
}

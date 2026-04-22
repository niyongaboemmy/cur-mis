<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Models\ProgramModel;
use App\Models\RoomModel;
use App\Models\DepartmentModel;
use App\Models\OptionModel;
use App\Models\LevelModel;
use App\Models\LeaveTypeModel;
use App\Models\ModuleModel;
use App\Models\SchoolModel;
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
            'degrees' => new ProgramModel(), // Using programs table for degree management
            'facility' => new RoomModel(),
            'departments' => new DepartmentModel(),
            'options' => new OptionModel(),
            'levels' => new LevelModel(),
            'leave_types' => new LeaveTypeModel(),
            'modules' => new ModuleModel(),
            'schools' => new SchoolModel(),
        ];
    }

    /**
     * Resolve the target entity from the request.
     * Routes register `/api/academics-management/{entity}` with the entity
     * hardcoded in the URL prefix, so `$request->param('entity')` is null.
     * Fall back to deriving it from the URI segment after `academics-management/`.
     */
    private function resolveEntity(Request $request): ?string
    {
        $entity = $request->param('entity');
        if ($entity !== null && $entity !== '') {
            return $entity;
        }
        $uri = $request->uri(); // e.g. /api/academics-management/schools/7
        if (preg_match('#/academics-management/([a-z_]+)#', $uri, $m)) {
            return $m[1];
        }
        return null;
    }

    /**
     * Generic list method for academic entities.
     */
    public function index(Request $request, Response $response): never
    {
        $entity = $this->resolveEntity($request);
        if (!isset($this->models[$entity])) {
            $this->error($response, 'Entity not found.', 404);
        }

        $page = (int) ($request->query('page') ?? 1);
        $perPage = (int) ($request->query('per_page') ?? 20);

        $paginated = $this->models[$entity]->paginate($page, $perPage);
        $this->success($response, $paginated, ucfirst($entity) . ' fetched.');
    }

    /**
     * Generic show method.
     */
    public function show(Request $request, Response $response): never
    {
        $entity = $this->resolveEntity($request);
        $id = (int) $request->param('id');

        if (!isset($this->models[$entity])) {
            $this->error($response, 'Entity not found.', 404);
        }

        $item = $this->models[$entity]->find($id);
        if (!$item) {
            $this->error($response, 'Item not found.', 404);
        }

        $this->success($response, $item, ucfirst($entity) . ' details fetched.');
    }

    /**
     * Generic create method.
     */
    public function create(Request $request, Response $response): never
    {
        $entity = $this->resolveEntity($request);
        $data = $request->body();

        if (!isset($this->models[$entity])) {
            $this->error($response, 'Entity not found.', 404);
        }

        $rules = $this->getValidationRules($entity);
        $errors = ValidationHelper::validate($data, $rules);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed', 422, $errors);
        }

        $id = $this->models[$entity]->create($data);
        $this->success($response, ['id' => $id], ucfirst($entity) . ' created.', 201);
    }

    /**
     * Generic update method.
     */
    public function update(Request $request, Response $response): never
    {
        $entity = $this->resolveEntity($request);
        $id = (int) $request->param('id');
        $data = $request->body();

        if (!isset($this->models[$entity])) {
            $this->error($response, 'Entity not found.', 404);
        }

        if (!$this->models[$entity]->find($id)) {
            $this->error($response, 'Item not found.', 404);
        }

        $rules = $this->getValidationRules($entity);
        $errors = ValidationHelper::validate($data, $rules);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed', 422, $errors);
        }

        $this->models[$entity]->update($id, $data);
        $this->success($response, null, ucfirst($entity) . ' updated.');
    }

    /**
     * Generic delete method.
     */
    public function delete(Request $request, Response $response): never
    {
        $entity = $this->resolveEntity($request);
        $id = (int) $request->param('id');

        if (!isset($this->models[$entity])) {
            $this->error($response, 'Entity not found.', 404);
        }

        $this->models[$entity]->delete($id);
        $this->success($response, null, ucfirst($entity) . ' deleted.');
    }

    /**
     * Returns validation rules for the given entity.
     */
    private function getValidationRules(string $entity): array
    {
        $commonRules = [
            'is_active' => ['numeric', 'in:0,1']
        ];

        $rules = match ($entity) {
            'degrees' => [
                'department_id' => ['required', 'numeric'],
                'code' => ['required', 'min:2'],
                'name' => ['required', 'min:3'],
                'degree_type' => ['required', 'in:Certificate,Diploma,Bachelor,Master,PhD'],
                'duration_years' => ['required', 'numeric'],
                'total_credits' => ['numeric'],
            ],
            'facility' => [
                'name' => ['required', 'min:2'],
                'building' => ['string'],
                'capacity' => ['required', 'numeric'],
                'room_type' => ['in:lecture,lab,seminar,exam_hall'],
            ],
            'departments' => [
                'name' => ['required', 'min:3'],
                'code' => ['string'],
                'faculty_id' => ['required', 'numeric'],
                'description' => ['string'],
            ],
            'options' => [
                'name' => ['required', 'min:3'],
                'department_id' => ['required', 'numeric'],
            ],
            'levels' => [
                'name' => ['required'],
            ],
            'leave_types' => [
                'name' => ['required'],
                'days_allowed' => ['required', 'numeric'],
                'is_paid' => ['numeric', 'in:0,1'],
            ],
            'modules' => [
                'module_name' => ['required', 'min:3'],
                'module_code' => ['required'],
                'module_credits' => ['required', 'numeric'],
                'department' => ['required', 'numeric'],
                'level' => ['required', 'numeric'],
            ],
            'schools' => [
                'school_name' => ['required', 'min:3'],
                'school_descript' => ['string'],
                'school_address' => ['string'],
                'school_phone' => ['string'],
                'school_email' => ['string'],
                'url' => ['string'],
            ],
            default => []
        };
        return array_merge($rules, $commonRules);
    }
}

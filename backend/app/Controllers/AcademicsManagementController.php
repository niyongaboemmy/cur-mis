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
use App\Models\ModuleOfferingModel;
use App\Models\ExamScheduleModel;
use App\Models\FacultyModel;
use App\Models\SchoolModel;
use App\Models\IntakeModel;
use App\Models\DegreeModel;
use App\Models\CampusModel;
use App\Helpers\ValidationHelper;
use App\Helpers\InstructorDirectory;

/**
 * Handles CRUD for general academic entities.
 */
class AcademicsManagementController extends BaseController
{
    private array $models = [];

    public function __construct()
    {
        $this->models = [
            'facility'         => new RoomModel(),
            'departments'      => new DepartmentModel(),
            'faculties'        => new FacultyModel(),
            'options'          => new OptionModel(),
            'levels'           => new LevelModel(),
            'leave_types'      => new LeaveTypeModel(),
            'modules'          => new ModuleModel(),
            'module_offerings' => new ModuleOfferingModel(),
            'exam_schedules'   => new ExamScheduleModel(),
            'schools'          => new SchoolModel(),
            'intakes'          => new IntakeModel(),
            'degrees'          => new DegreeModel(),
            'campuses'         => new CampusModel(),
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

        // Whitelist sort_by to safe identifiers — paginate() interpolates
        // it into the SQL string. Anything else is dropped silently so we
        // fall back to the model's natural order.
        $sortBy = $request->query('sort_by');
        if ($sortBy !== null && !preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/', (string)$sortBy)) {
            $sortBy = null;
        }
        $sortDir = strtoupper((string)($request->query('sort_dir') ?? 'ASC'));
        if (!in_array($sortDir, ['ASC', 'DESC'], true)) {
            $sortDir = 'ASC';
        }

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
                // Hidden (archived) rows are off the catalogue unless asked for.
                'include_archived' => in_array(
                    (string)($request->query('include_archived') ?? ''),
                    ['1', 'true', 'yes'],
                    true,
                ),
                'sort_by'    => $sortBy ?? '',
                'sort_dir'   => $sortDir,
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

        // Free-text search via ?q=. Each entity declares its searchable
        // columns in $this->searchableColumns(); a single q value runs a
        // LIKE %q% across all of them, OR-joined.
        $q = trim((string)($request->query('q') ?? ''));
        if ($q !== '') {
            $cols = $this->searchableColumns($entity);
            if (!empty($cols)) {
                $likes = [];
                foreach ($cols as $col) {
                    $likes[] = "`{$col}` LIKE ?";
                    $bindings[] = '%' . $q . '%';
                }
                $whereClauses[] = '(' . implode(' OR ', $likes) . ')';
            }
        }

        $where = implode(' AND ', $whereClauses);

        $paginated = $this->models[$entity]->paginate(
            $page, $perPage, $where, $bindings,
            $sortBy ?? '', $sortDir,
        );

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

        // Same idea for `options` — `campus_ids` is the option ↔ campus
        // join, not a column on the options table.
        $campusIds = null;
        if ($entity === 'options' && array_key_exists('campus_ids', $data)) {
            $campusIds = is_array($data['campus_ids'])
                ? array_values(array_map('intval', $data['campus_ids']))
                : [];
            unset($data['campus_ids']);
        }

        $errors = ValidationHelper::validate($data, $this->getValidationRules($entity));
        if (!empty($errors)) {
            $this->error($response, 'Validation failed', 422, $errors);
        }

        $data = $this->applyEntityDefaults($entity, $data);
        $data = $this->normalizeNullableColumns($entity, $data);

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

        // After the department/level fill-in above, so the module check scopes
        // against the values actually about to be written rather than the empty
        // ones the form omits.
        if ($conflict = $this->checkCodeUniqueness($entity, $data, null, $levelIds)) {
            $this->error($response, 'Validation failed', 422, $conflict);
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

        if ($entity === 'options' && $campusIds !== null) {
            /** @var \App\Models\OptionModel $optModel */
            $optModel = $this->models['options'];
            $optModel->setCampusIds((int)$id, $campusIds);
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

        $campusIds = null;
        if ($entity === 'options' && array_key_exists('campus_ids', $data)) {
            $campusIds = is_array($data['campus_ids'])
                ? array_values(array_map('intval', $data['campus_ids']))
                : [];
            unset($data['campus_ids']);
        }

        $errors = ValidationHelper::validate($data, $this->getValidationRules($entity));
        if (!empty($errors)) {
            $this->error($response, 'Validation failed', 422, $errors);
        }

        $data = $this->normalizeNullableColumns($entity, $data);

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

        // After the department/level fill-in above, so the module check scopes
        // against the values actually about to be written rather than the empty
        // ones the form omits.
        if ($conflict = $this->checkCodeUniqueness($entity, $data, $id, $levelIds)) {
            $this->error($response, 'Validation failed', 422, $conflict);
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

        if ($entity === 'options' && $campusIds !== null) {
            /** @var \App\Models\OptionModel $optModel */
            $optModel = $this->models['options'];
            $optModel->setCampusIds($id, $campusIds);
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

    /**
     * POST /api/academics-management/:entity/bulk-import
     *
     * Body:
     *   {
     *     "rows":      [...],            // array of row payloads
     *     "action":    "skip" | "update" // what to do with rows that already
     *                                    //   exist (matched by `match_key`)
     *     "match_key": "fac_code"        // optional column used for duplicate
     *                                    //   detection. If absent, every row is
     *                                    //   created.
     *   }
     *
     * Response:
     *   { created, updated, skipped, failed: [{ index, error, errors? }] }
     */
    public function bulkImport(Request $request, Response $response): never
    {
        $entity = $this->resolveEntity($request);
        if (!isset($this->models[$entity])) {
            $this->error($response, 'Entity not found.', 404);
        }

        $body     = $request->body();
        $rows     = $body['rows']      ?? [];
        $action   = $body['action']    ?? 'skip';
        $matchKey = $body['match_key'] ?? null;

        if (!is_array($rows)) {
            $this->error($response, 'rows must be an array.', 422);
        }
        if (!in_array($action, ['skip', 'update'], true)) {
            $this->error($response, "action must be 'skip' or 'update'.", 422);
        }

        $model = $this->models[$entity];
        $pk    = $model->primaryKey();
        $table = $model->table();
        $rules = $this->getValidationRules($entity);

        // Pre-load existing rows keyed by match_key so we don't query in a loop.
        $existingByKey = [];
        if ($matchKey !== null && $matchKey !== '') {
            $rowsDb = $model->db()->fetchAll(
                "SELECT * FROM `{$table}` WHERE `{$matchKey}` IS NOT NULL"
            );
            foreach ($rowsDb as $r) {
                $key = strtolower(trim((string)($r[$matchKey] ?? '')));
                if ($key !== '') {
                    $existingByKey[$key] = $r;
                }
            }
        }

        $created = 0;
        $updated = 0;
        $skipped = 0;
        $failed  = [];

        $optModel = $entity === 'options' ? $this->models['options'] : null;

        foreach ($rows as $idx => $row) {
            if (!is_array($row)) {
                $failed[] = ['index' => $idx, 'error' => 'Row must be an object.'];
                continue;
            }

            // Pull off `campus_ids` for options — applied via the join table
            // after the row write, not as a column on the options table.
            $rowCampusIds = null;
            if ($entity === 'options' && array_key_exists('campus_ids', $row)) {
                $rowCampusIds = is_array($row['campus_ids'])
                    ? array_values(array_map('intval', $row['campus_ids']))
                    : [];
                unset($row['campus_ids']);
            }

            $errs = ValidationHelper::validate($row, $rules);
            if (!empty($errs)) {
                $failed[] = ['index' => $idx, 'error' => 'Validation failed', 'errors' => $errs];
                continue;
            }

            // Resolve duplicate via match_key
            $existingRow = null;
            if ($matchKey !== null && $matchKey !== '' && isset($row[$matchKey])
                && $row[$matchKey] !== null && $row[$matchKey] !== ''
            ) {
                $key = strtolower(trim((string)$row[$matchKey]));
                $existingRow = $existingByKey[$key] ?? null;
            }

            try {
                if ($existingRow !== null) {
                    if ($action === 'update') {
                        $existingId = (int)$existingRow[$pk];
                        // Code uniqueness still applies — but skip the match_key
                        // itself since we resolved it to *this* row.
                        if ($conflict = $this->checkCodeUniqueness($entity, $row, $existingId)) {
                            $failed[] = ['index' => $idx, 'error' => 'Conflict', 'errors' => $conflict];
                            continue;
                        }
                        $row = $this->normalizeNullableColumns($entity, $row);
                        $model->update($existingId, $row);
                        if ($optModel !== null && $rowCampusIds !== null) {
                            $optModel->setCampusIds($existingId, $rowCampusIds);
                        }
                        $updated++;
                    } else {
                        $skipped++;
                    }
                } else {
                    if ($conflict = $this->checkCodeUniqueness($entity, $row, null)) {
                        $failed[] = ['index' => $idx, 'error' => 'Conflict', 'errors' => $conflict];
                        continue;
                    }
                    $row = $this->applyEntityDefaults($entity, $row);
                    $row = $this->normalizeNullableColumns($entity, $row);
                    $newId = $model->create($row);
                    if ($optModel !== null && $rowCampusIds !== null && !empty($rowCampusIds)) {
                        $optModel->setCampusIds((int)$newId, $rowCampusIds);
                    }
                    // Track the freshly created row so a duplicate appearing later
                    // in the same file is detected.
                    if ($matchKey !== null && $matchKey !== '' && isset($row[$matchKey])
                        && $row[$matchKey] !== null && $row[$matchKey] !== ''
                    ) {
                        $key = strtolower(trim((string)$row[$matchKey]));
                        $existingByKey[$key] = array_merge($row, [$pk => $newId]);
                    }
                    $created++;
                }
            } catch (\Throwable $e) {
                $failed[] = ['index' => $idx, 'error' => $e->getMessage()];
            }
        }

        $this->success($response, [
            'created' => $created,
            'updated' => $updated,
            'skipped' => $skipped,
            'failed'  => $failed,
        ], 'Bulk import complete.');
    }

    /**
     * GET /api/academics-management/departments/next-code?fac_id=:id
     *
     * Computes the next department code for a faculty using the convention
     * `<fac_code>.<seq>` where seq is the highest existing trailing integer
     * for that faculty + 1. Returns `{ code: "" }` if the faculty has no
     * fac_code yet, so the form can fall back to manual entry.
     */
    public function nextDepartmentCode(Request $request, Response $response): never
    {
        $facId = (int)($request->query('fac_id') ?? 0);
        if ($facId <= 0) {
            $this->error($response, 'fac_id is required.', 422);
        }

        /** @var \App\Models\FacultyModel $facultyModel */
        $facultyModel = $this->models['faculties'];
        $faculty = $facultyModel->find($facId);
        if (!$faculty) {
            $this->error($response, 'Faculty not found.', 404);
        }

        $facCode = trim((string)($faculty['fac_code'] ?? ''));
        if ($facCode === '') {
            $this->success(
                $response,
                ['code' => '', 'fac_code' => null, 'next_seq' => null],
                'Faculty has no fac_code yet — set one to enable auto-numbering.',
            );
        }

        /** @var \App\Models\DepartmentModel $deptModel */
        $deptModel = $this->models['departments'];
        $rows = $deptModel->db()->fetchAll(
            "SELECT dep_code FROM `departements` WHERE fac_id = ? AND dep_code IS NOT NULL AND dep_code <> ''",
            [$facId],
        );

        $maxSeq    = 0;
        $prefix    = $facCode . '.';
        $prefixLen = strlen($prefix);
        foreach ($rows as $r) {
            $code = trim((string)($r['dep_code'] ?? ''));
            if (strncmp($code, $prefix, $prefixLen) !== 0) continue;
            $tail = substr($code, $prefixLen);
            if ($tail === '' || !ctype_digit($tail)) continue;
            $n = (int)$tail;
            if ($n > $maxSeq) $maxSeq = $n;
        }

        $nextSeq  = $maxSeq + 1;
        $nextCode = $facCode . '.' . $nextSeq;

        $this->success($response, [
            'code'     => $nextCode,
            'fac_code' => $facCode,
            'next_seq' => $nextSeq,
        ], 'Next department code computed.');
    }

    /**
     * GET /api/academics-management/options/next-code?dep_id=:id
     *
     * Computes the next option/program code following `<dep_code>.<seq>`
     * (e.g. "3.1.1") for the given department. Returns `{ code: "" }` if
     * the department has no `dep_code` yet so the form can fall back to
     * manual entry.
     */
    public function nextOptionCode(Request $request, Response $response): never
    {
        $depId = (int)($request->query('dep_id') ?? 0);
        if ($depId <= 0) {
            $this->error($response, 'dep_id is required.', 422);
        }

        /** @var \App\Models\DepartmentModel $deptModel */
        $deptModel = $this->models['departments'];
        $department = $deptModel->find($depId);
        if (!$department) {
            $this->error($response, 'Department not found.', 404);
        }

        $depCode = trim((string)($department['dep_code'] ?? ''));
        if ($depCode === '') {
            $this->success(
                $response,
                ['code' => '', 'dep_code' => null, 'next_seq' => null],
                'Department has no dep_code yet — set one to enable auto-numbering.',
            );
        }

        /** @var \App\Models\OptionModel $optModel */
        $optModel = $this->models['options'];
        $rows = $optModel->db()->fetchAll(
            "SELECT code FROM `options` WHERE department_id = ? AND code IS NOT NULL AND code <> ''",
            [$depId],
        );

        $maxSeq    = 0;
        $prefix    = $depCode . '.';
        $prefixLen = strlen($prefix);
        foreach ($rows as $r) {
            $code = trim((string)($r['code'] ?? ''));
            if (strncmp($code, $prefix, $prefixLen) !== 0) continue;
            $tail = substr($code, $prefixLen);
            if ($tail === '' || !ctype_digit($tail)) continue;
            $n = (int)$tail;
            if ($n > $maxSeq) $maxSeq = $n;
        }

        $nextSeq  = $maxSeq + 1;
        $nextCode = $depCode . '.' . $nextSeq;

        $this->success($response, [
            'code'     => $nextCode,
            'dep_code' => $depCode,
            'next_seq' => $nextSeq,
        ], 'Next option code computed.');
    }

    /**
     * POST /api/academics-management/modules/curriculum-import
     *
     * Body:
     *   {
     *     "rows": [
     *       {
     *         "academic_year": "2025-2026",
     *         "option_code":   "3.1.1",
     *         "level":         "8",
     *         "mode":          "Day",
     *         "mode_order":    1,
     *         "semesters":     "S1&S2",
     *         "module_order":  1,
     *         "module_code":   "STSK 1312",
     *         "module_name":   "Study skills",
     *         "module_credits":15,
     *         "campus_name":   "Taba"
     *       }, ...
     *     ],
     *     "action": "skip" | "update"   // for offering rows that already exist
     *   }
     *
     * For each row:
     *   1. Upsert the module by `module_code` (sets / updates module_name +
     *      module_credits + level on first sight).
     *   2. Resolve `option_code` → `options.id`, `campus_name` → `campuses.id`,
     *      `level` → `levels.id`.
     *   3. Insert / update a `module_offerings` row keyed by
     *      (module_id, option_id, mode, semesters, campus_id, academic_year).
     *
     * Returns:
     *   {
     *     modules:    { created, updated },
     *     offerings:  { created, updated, skipped },
     *     failed:     [{ index, error, errors? }]
     *   }
     */
    public function curriculumImport(Request $request, Response $response): never
    {
        $body   = $request->body();
        $rows   = $body['rows']   ?? [];
        $action = $body['action'] ?? 'skip';

        if (!is_array($rows)) {
            $this->error($response, 'rows must be an array.', 422);
        }
        if (!in_array($action, ['skip', 'update'], true)) {
            $this->error($response, "action must be 'skip' or 'update'.", 422);
        }

        /** @var ModuleModel $moduleModel */
        $moduleModel = $this->models['modules'];
        /** @var OptionModel $optionModel */
        $optionModel = $this->models['options'];
        /** @var \App\Models\CampusModel $campusModel */
        $campusModel = $this->models['campuses'];
        /** @var LevelModel $levelModel */
        $levelModel  = $this->models['levels'];
        /** @var ModuleOfferingModel $offeringModel */
        $offeringModel = $this->models['module_offerings'];

        // Pre-load every lookup table once. Keys are case-insensitive trimmed
        // so file values match regardless of stray whitespace.
        $optionByCode = [];
        foreach ($optionModel->db()->fetchAll("SELECT id, code FROM `options` WHERE code IS NOT NULL AND code <> ''") as $r) {
            $optionByCode[strtolower(trim((string)$r['code']))] = (int)$r['id'];
        }
        $campusByName = [];
        foreach ($campusModel->db()->fetchAll("SELECT id, name FROM `campuses`") as $r) {
            $campusByName[strtolower(trim((string)$r['name']))] = (int)$r['id'];
        }
        $levelByName = [];
        foreach ($levelModel->db()->fetchAll("SELECT id, name FROM `levels`") as $r) {
            $levelByName[strtolower(trim((string)$r['name']))] = (int)$r['id'];
        }

        // Cache resolved module ids by code so a 200-row file doesn't issue
        // 200 SELECTs and 200 UPDATEs for the same module.
        $moduleIdByCode = [];

        $modulesCreated   = 0;
        $modulesUpdated   = 0;
        $offeringsCreated = 0;
        $offeringsUpdated = 0;
        $offeringsSkipped = 0;
        $failed           = [];

        foreach ($rows as $idx => $row) {
            if (!is_array($row)) {
                $failed[] = ['index' => $idx, 'error' => 'Row must be an object.'];
                continue;
            }

            $moduleCode = trim((string)($row['module_code'] ?? ''));
            $moduleName = trim((string)($row['module_name'] ?? ''));
            $optionCode = trim((string)($row['option_code'] ?? ''));

            if ($moduleCode === '') {
                $failed[] = ['index' => $idx, 'error' => 'Missing module_code.'];
                continue;
            }
            if ($optionCode === '') {
                $failed[] = ['index' => $idx, 'error' => "Missing option_code for module {$moduleCode}."];
                continue;
            }

            $optionId = $optionByCode[strtolower($optionCode)] ?? null;
            if (!$optionId) {
                $failed[] = ['index' => $idx, 'error' => "Unknown option code '{$optionCode}'."];
                continue;
            }

            $campusName = trim((string)($row['campus_name'] ?? ''));
            $campusId   = $campusName === '' ? null : ($campusByName[strtolower($campusName)] ?? null);
            // Same numeric-trust rule as programImport: a numeric LEVEL is
            // taken as the id, otherwise resolve by name.
            $levelRaw = trim((string)($row['level'] ?? ''));
            $levelId  = null;
            if ($levelRaw !== '') {
                if (ctype_digit($levelRaw)) {
                    $levelId = (int)$levelRaw;
                } else {
                    $levelId = $levelByName[strtolower($levelRaw)] ?? null;
                }
            }

            $credits = $row['module_credits'] ?? null;
            $credits = $credits === '' || $credits === null ? null : (int)$credits;

            // 1) Upsert the module catalog row.
            try {
                if (!isset($moduleIdByCode[strtolower($moduleCode)])) {
                    // TRIM both sides so legacy padded codes (" MTEC4322") still
                    // match a clean file value ("MTEC4322"); guards against
                    // duplicate-module creation when whitespace differs.
                    $existing = $moduleModel->db()->fetchOne(
                        "SELECT * FROM `modules` WHERE TRIM(`module_code`) = ? LIMIT 1",
                        [$moduleCode],
                    );
                    if ($existing) {
                        $patch = [];
                        if ($moduleName !== '' && $moduleName !== ($existing['module_name'] ?? '')) {
                            $patch['module_name'] = $moduleName;
                        }
                        if ($credits !== null && $credits !== (int)($existing['module_credits'] ?? 0)) {
                            $patch['module_credits'] = $credits;
                        }
                        if ($levelId !== null && $levelId !== (int)($existing['level'] ?? 0)) {
                            $patch['level'] = $levelId;
                        }
                        if (!empty($patch)) {
                            $moduleModel->update((int)$existing['module_id'], $patch);
                            $modulesUpdated++;
                        }
                        $moduleIdByCode[strtolower($moduleCode)] = (int)$existing['module_id'];
                    } else {
                        $newId = $moduleModel->create([
                            'module_code'    => $moduleCode,
                            'module_name'    => $moduleName !== '' ? $moduleName : $moduleCode,
                            'module_credits' => $credits ?? 0,
                            'level'          => $levelId ?? 0,
                        ]);
                        $moduleIdByCode[strtolower($moduleCode)] = (int)$newId;
                        $modulesCreated++;
                    }
                }
                $moduleId = $moduleIdByCode[strtolower($moduleCode)];

                // Keep the module ↔ program join in sync (existing pattern
                // used by the modules tab) so this module shows up under
                // its programmes in the regular Modules listing.
                $moduleModel->db()->execute(
                    'INSERT IGNORE INTO `module_programs` (`module_id`, `option_id`) VALUES (?, ?)',
                    [$moduleId, $optionId],
                );
            } catch (\Throwable $e) {
                $failed[] = ['index' => $idx, 'error' => 'Module upsert failed: ' . $e->getMessage()];
                continue;
            }

            // 2) Find an existing offering with the same placement signature.
            $mode      = ($row['mode'] ?? '') === '' ? null : (string)$row['mode'];
            $semesters = ($row['semesters'] ?? '') === '' ? null : (string)$row['semesters'];
            $acYear    = ($row['academic_year'] ?? '') === '' ? null : (string)$row['academic_year'];
            $modeOrder   = isset($row['mode_order'])   && $row['mode_order']   !== '' ? (int)$row['mode_order']   : null;
            $moduleOrder = isset($row['module_order']) && $row['module_order'] !== '' ? (int)$row['module_order'] : null;

            // Match by all the placement keys; NULL-safe (<=>) so missing
            // values match other missing values.
            $existingOffering = $offeringModel->db()->fetchOne(
                "SELECT id FROM `module_offerings`
                 WHERE  module_id = ?
                   AND  option_id = ?
                   AND  `mode`         <=> ?
                   AND  `semesters`    <=> ?
                   AND  `campus_id`    <=> ?
                   AND  `academic_year` <=> ?
                 LIMIT 1",
                [$moduleId, $optionId, $mode, $semesters, $campusId, $acYear],
            );

            $payload = [
                'module_id'     => $moduleId,
                'option_id'     => $optionId,
                'academic_year' => $acYear,
                'level_id'      => $levelId,
                'mode'          => $mode,
                'mode_order'    => $modeOrder,
                'semesters'     => $semesters,
                'module_order'  => $moduleOrder,
                'campus_id'     => $campusId,
            ];

            try {
                if ($existingOffering) {
                    if ($action === 'update') {
                        $offeringModel->update((int)$existingOffering['id'], $payload);
                        $offeringsUpdated++;
                    } else {
                        $offeringsSkipped++;
                    }
                } else {
                    $offeringModel->create($payload);
                    $offeringsCreated++;
                }
            } catch (\Throwable $e) {
                $failed[] = ['index' => $idx, 'error' => 'Offering write failed: ' . $e->getMessage()];
            }
        }

        $this->success($response, [
            'modules'   => ['created' => $modulesCreated,   'updated' => $modulesUpdated],
            'offerings' => [
                'created' => $offeringsCreated,
                'updated' => $offeringsUpdated,
                'skipped' => $offeringsSkipped,
            ],
            'failed' => $failed,
        ], 'Curriculum import complete.');
    }

    /**
     * POST /api/academics-management/modules/program-import
     *
     * Simpler module import driven by a single program selected up-front.
     * Each row carries just module-catalog fields — Module Order, Module
     * Code, Module Title & Component / Module Name, Credits, LEVEL — and
     * gets linked to the chosen program via `module_programs` (with the
     * file's order stored in `module_programs.module_order`).
     *
     * Body:
     *   { rows: [...], program_id: 7, action: 'skip' | 'update' }
     */
    public function programImport(Request $request, Response $response): never
    {
        $body      = $request->body();
        $rows      = $body['rows']       ?? [];
        $programId = (int)($body['program_id'] ?? 0);
        $action    = $body['action']     ?? 'skip';

        if ($programId <= 0)               $this->error($response, 'program_id is required.', 422);
        if (!is_array($rows))              $this->error($response, 'rows must be an array.', 422);
        if (!in_array($action, ['skip', 'update'], true)) {
            $this->error($response, "action must be 'skip' or 'update'.", 422);
        }

        /** @var OptionModel $optionModel */
        $optionModel = $this->models['options'];
        $option = $optionModel->find($programId);
        if (!$option) {
            $this->error($response, 'Program not found.', 404);
        }
        // Modules carry a `department` column that is NOT NULL — derive it
        // from the chosen program so the user doesn't have to repeat it in
        // every row. The frontend hides this column from the import form
        // entirely.
        $departmentId = isset($option['department_id']) && $option['department_id'] !== ''
            ? (int)$option['department_id']
            : null;

        /** @var ModuleModel $moduleModel */
        $moduleModel = $this->models['modules'];
        /** @var LevelModel $levelModel */
        $levelModel  = $this->models['levels'];

        $levelByName = [];
        foreach ($levelModel->db()->fetchAll("SELECT id, name FROM `levels`") as $l) {
            $levelByName[strtolower(trim((string)$l['name']))] = (int)$l['id'];
        }

        $moduleIdByCode = [];
        $modulesCreated = 0;
        $modulesUpdated = 0;
        $linksCreated   = 0;
        $linksUpdated   = 0;
        $linksSkipped   = 0;
        $failed         = [];

        foreach ($rows as $idx => $row) {
            if (!is_array($row)) {
                $failed[] = ['index' => $idx, 'error' => 'Row must be an object.'];
                continue;
            }

            $code = trim((string)($row['module_code'] ?? ''));
            if ($code === '') {
                $failed[] = ['index' => $idx, 'error' => 'Missing module_code.'];
                continue;
            }
            $name    = trim((string)($row['module_name'] ?? ''));
            $credits = $row['module_credits'] ?? null;
            $credits = $credits === '' || $credits === null ? null : (int)$credits;
            $order   = $row['module_order'] ?? null;
            $order   = $order === '' || $order === null ? null : (int)$order;

            // LEVEL column rules:
            //   - Numeric value ("8"): used directly as the level id, whether
            //     or not an existing `levels` row matches. The modules table
            //     accepts any int and the listing falls back to "#N" when no
            //     row matches — admins can clean up the levels catalog later.
            //   - Name value ("Level 1 (Year 1)"): resolved against `levels.name`.
            //   - Anything else: leaves the column alone on update / falls back
            //     to 0 on insert.
            $levelRaw = trim((string)($row['level'] ?? ''));
            $levelId  = null;
            if ($levelRaw !== '') {
                if (ctype_digit($levelRaw)) {
                    $levelId = (int)$levelRaw;
                } else {
                    $levelId = $levelByName[strtolower($levelRaw)] ?? null;
                }
            }

            try {
                // 1) Upsert module catalog row (cached per-import).
                // Match on the code's IDENTITY, not its literal text. MySQL's
                // TRIM strips spaces only — not the tabs and non-breaking
                // spaces these spreadsheets carry — so `TRIM(code) = ?` kept
                // missing existing rows and every re-import added another copy
                // of the same course (nine "CCU8111"s on live before this).
                $ident = strtoupper(preg_replace('/\s+/u', '', $code) ?? $code);
                $code  = trim((string)preg_replace('/\s+/u', ' ', $code));
                if (!isset($moduleIdByCode[$ident])) {
                    $existing = $moduleModel->db()->fetchOne(
                        "SELECT * FROM `modules`
                          WHERE UPPER(REPLACE(REPLACE(REPLACE(`module_code`, CHAR(9), ''), CHAR(10), ''), ' ', '')) = ?
                          LIMIT 1",
                        [$ident],
                    );
                    if ($existing) {
                        $patch = [];
                        if ($name !== '' && $name !== ($existing['module_name'] ?? '')) {
                            $patch['module_name'] = $name;
                        }
                        if ($credits !== null && $credits !== (int)($existing['module_credits'] ?? 0)) {
                            $patch['module_credits'] = $credits;
                        }
                        if ($levelId !== null && $levelId !== (int)($existing['level'] ?? 0)) {
                            $patch['level'] = $levelId;
                        }
                        if (!empty($patch)) {
                            $moduleModel->update((int)$existing['module_id'], $patch);
                            $modulesUpdated++;
                        }
                        $moduleIdByCode[$ident] = (int)$existing['module_id'];
                    } else {
                        $newId = $moduleModel->create([
                            'module_code'    => $code,
                            'module_name'    => $name !== '' ? $name : $code,
                            'module_credits' => $credits ?? 0,
                            'level'          => $levelId ?? 0,
                            'department'     => $departmentId ?? 0,
                        ]);
                        $moduleIdByCode[$ident] = (int)$newId;
                        $modulesCreated++;
                    }
                }
                $moduleId = $moduleIdByCode[$ident];

                // 2) Link to program with the order from the file.
                $existingLink = $moduleModel->db()->fetchOne(
                    "SELECT id, module_order FROM `module_programs`
                     WHERE  module_id = ? AND option_id = ? LIMIT 1",
                    [$moduleId, $programId],
                );
                if ($existingLink) {
                    $currentOrder = $existingLink['module_order'] ?? null;
                    if ($action === 'update'
                        && $order !== null
                        && (int)($currentOrder ?? 0) !== $order
                    ) {
                        $moduleModel->db()->execute(
                            "UPDATE `module_programs` SET `module_order` = ? WHERE id = ?",
                            [$order, (int)$existingLink['id']],
                        );
                        $linksUpdated++;
                    } else {
                        $linksSkipped++;
                    }
                } else {
                    $moduleModel->db()->execute(
                        "INSERT INTO `module_programs` (`module_id`, `option_id`, `module_order`) VALUES (?, ?, ?)",
                        [$moduleId, $programId, $order],
                    );
                    $linksCreated++;
                }
            } catch (\Throwable $e) {
                $failed[] = ['index' => $idx, 'error' => $e->getMessage()];
            }
        }

        $this->success($response, [
            'modules' => ['created' => $modulesCreated, 'updated' => $modulesUpdated],
            'links'   => ['created' => $linksCreated, 'updated' => $linksUpdated, 'skipped' => $linksSkipped],
            'failed'  => $failed,
        ], 'Modules imported.');
    }

    /**
     * GET /api/academics-management/schedules?program_id=:id&mode=:mode
     *
     * Returns the modules linked to the program (ordered by their
     * curricular position) with the start/end dates already saved for the
     * given mode (Day / Weekend / Holiday). Modules without a saved
     * offering for that mode come back with `start_date: null` so the UI
     * can render an empty row ready to be filled in.
     */
    public function getSchedules(Request $request, Response $response): never
    {
        $programId = (int)($request->query('program_id') ?? 0);
        if ($programId <= 0) {
            $this->error($response, 'program_id is required.', 422);
        }
        $mode = trim((string)($request->query('mode') ?? ''));
        $modeKey = $mode === '' ? null : $mode;

        /** @var ModuleModel $moduleModel */
        $moduleModel = $this->models['modules'];

        // Modules in the program, ordered by their curricular position.
        $modules = $moduleModel->db()->fetchAll(
            "SELECT mp.module_id, mp.module_order,
                    m.module_code, m.module_name, m.module_credits, m.level
             FROM `module_programs` mp
             JOIN `modules` m ON m.module_id = mp.module_id
             WHERE mp.option_id = ?
             ORDER BY mp.module_order ASC, m.module_code ASC",
            [$programId],
        );

        // All saved offerings (blocks) for this (program, mode), grouped by
        // module_id. Multiple blocks per module are normal (e.g. several
        // weeks of teaching + a final exam).
        $offeringRows = $moduleModel->db()->fetchAll(
            "SELECT mo.id, mo.module_id, mo.start_date, mo.end_date, mo.semesters,
                    mo.academic_year, mo.mode_order,
                    mo.day_of_week, mo.day_pattern, mo.start_time, mo.end_time,
                    mo.instructor_id, mo.activity, mo.instructor_name, mo.year_of_study,
                    mo.campus_id,
                    e.full_name AS instructor_full_name
             FROM `module_offerings` mo
             LEFT JOIN `hr_employees` e ON e.id = mo.instructor_id
             WHERE mo.option_id = ? AND mo.`mode` <=> ?
             ORDER BY mo.module_id ASC, mo.start_date ASC, mo.start_time ASC",
            [$programId, $modeKey],
        );
        $blocksByModule = [];
        foreach ($offeringRows as $o) {
            $mid = (int)$o['module_id'];
            $blocksByModule[$mid] ??= [];
            // Prefer the multi-day `day_pattern` when present; fall back to
            // the legacy single-day `day_of_week` so rows saved before this
            // feature still surface a value.
            $dayPattern = trim((string)($o['day_pattern'] ?? '')) ?: null;
            if (!$dayPattern && $o['day_of_week'] !== null) {
                $dayPattern = (string)(int)$o['day_of_week'];
            }
            $blocksByModule[$mid][] = [
                'id'              => (int)$o['id'],
                'start_date'      => $o['start_date']    ?? null,
                'end_date'        => $o['end_date']      ?? null,
                'semesters'       => $o['semesters']     ?? null,
                'academic_year'   => $o['academic_year'] ?? null,
                'day_of_week'     => isset($o['day_of_week']) && $o['day_of_week'] !== null ? (int)$o['day_of_week'] : null,
                'day_pattern'     => $dayPattern,
                'start_time'      => $o['start_time']  ?? null,
                'end_time'        => $o['end_time']    ?? null,
                'instructor_id'   => isset($o['instructor_id']) && $o['instructor_id'] !== null ? (int)$o['instructor_id'] : null,
                'instructor_name' => $o['instructor_full_name'] ?? $o['instructor_name'] ?? null,
                'activity'        => $o['activity']        ?? null,
                'year_of_study'   => isset($o['year_of_study']) && $o['year_of_study'] !== null ? (int)$o['year_of_study'] : null,
                'campus_id'       => isset($o['campus_id']) && $o['campus_id'] !== null ? (int)$o['campus_id'] : null,
            ];
        }

        $rows = [];
        foreach ($modules as $m) {
            $mid = (int)$m['module_id'];
            $rows[] = [
                'module_id'      => $mid,
                'module_order'   => $m['module_order'] !== null ? (int)$m['module_order'] : null,
                'module_code'    => (string)$m['module_code'],
                'module_name'    => (string)$m['module_name'],
                'module_credits' => $m['module_credits'] !== null ? (int)$m['module_credits'] : null,
                'level'          => $m['level'] !== null ? (int)$m['level'] : null,
                'blocks'         => $blocksByModule[$mid] ?? [],
            ];
        }

        $this->success($response, ['rows' => $rows, 'count' => count($rows)], 'Schedule fetched.');
    }

    /**
     * GET /api/academics-management/instructors
     * Returns the staff directory used to populate the instructor selector
     * on the Scheduling tab. Sorted alphabetically; cheap to call (no
     * pagination — the whole list fits in one go).
     */
    public function instructors(Request $request, Response $response): never
    {
        // Unified lecturer pool: HR employees + staff user accounts (so a lecturer
        // with only a login — no HR record — is still assignable). User ids are
        // namespaced by InstructorDirectory::USER_OFFSET. Shared with the Modules
        // → Schedule page so the same person has the same id everywhere.
        $out = InstructorDirectory::all($this->models['modules']->db());
        $this->success($response, ['rows' => $out, 'count' => count($out)], 'Instructors fetched.');
    }

    /**
     * Resolve the display name for a namespaced instructor id (employee or user),
     * for denormalising onto `module_offerings.instructor_name`. Returns null when
     * the id resolves to nothing (caller falls back to any free-text name).
     */
    private function resolveInstructorName(?int $instructorId): ?string
    {
        return InstructorDirectory::resolveName($this->models['modules']->db(), $instructorId);
    }

    /**
     * POST /api/academics-management/schedules
     * Body: {
     *   program_id, mode,
     *   blocks:     [{ id?, module_id, start_date, end_date, semesters,
     *                  day_of_week, start_time, end_time, instructor_id,
     *                  instructor_name, activity, year_of_study, campus_id }],
     *   delete_ids: [number, ...]   // existing block IDs to remove
     * }
     *
     * Each block is one teaching session (one row in `module_offerings`).
     * A block with an `id` is updated; without an `id` it's created. A
     * single module can carry many blocks (e.g. several teaching weeks +
     * a final exam) under the same (program, mode).
     */
    public function saveSchedules(Request $request, Response $response): never
    {
        $body      = $request->body();
        $programId = (int)($body['program_id'] ?? 0);
        $mode      = trim((string)($body['mode'] ?? ''));
        $modeKey   = $mode === '' ? null : $mode;
        $blocks    = $body['blocks']      ?? [];
        $deleteIds = $body['delete_ids']  ?? [];

        if ($programId <= 0)        $this->error($response, 'program_id is required.', 422);
        if (!is_array($blocks))     $this->error($response, 'blocks must be an array.', 422);
        if (!is_array($deleteIds))  $this->error($response, 'delete_ids must be an array.', 422);

        /** @var ModuleOfferingModel $offModel */
        $offModel = $this->models['module_offerings'];
        $created  = 0;
        $updated  = 0;
        $deleted  = 0;
        $failed   = [];

        $cleanTime = static function ($v): ?string {
            $s = trim((string)($v ?? ''));
            if ($s === '') return null;
            if (preg_match('/^\d{1,2}:\d{2}(:\d{2})?$/', $s)) {
                if (strlen($s) === 4) $s = '0' . $s;
                if (strlen($s) === 5) $s .= ':00';
                return $s;
            }
            return null;
        };

        // Deletes go first so an admin can swap out blocks in one save.
        foreach ($deleteIds as $rawId) {
            $id = (int)$rawId;
            if ($id <= 0) continue;
            try {
                $offModel->delete($id);
                $deleted++;
            } catch (\Throwable $e) {
                $failed[] = ['index' => "delete:{$id}", 'error' => $e->getMessage()];
            }
        }

        foreach ($blocks as $idx => $s) {
            if (!is_array($s)) {
                $failed[] = ['index' => $idx, 'error' => 'Block must be an object.'];
                continue;
            }
            $blockId   = isset($s['id']) && $s['id'] !== '' && $s['id'] !== null ? (int)$s['id'] : 0;
            $moduleId  = (int)($s['module_id'] ?? 0);
            $startDate = trim((string)($s['start_date'] ?? '')) ?: null;
            $endDate   = trim((string)($s['end_date']   ?? '')) ?: null;

            $semesters     = trim((string)($s['semesters']       ?? '')) ?: null;
            $activity      = trim((string)($s['activity']        ?? '')) ?: null;
            $instructorRaw = trim((string)($s['instructor_name'] ?? '')) ?: null;
            $academicYear  = trim((string)($s['academic_year']   ?? '')) ?: null;

            // `day_pattern` is the source of truth (a comma-separated list
            // of ISO day numbers, 1=Mon … 7=Sun). The legacy `day_of_week`
            // is derived from it for back-compat: first day of the pattern
            // when single-day, NULL otherwise.
            $rawPattern = trim((string)($s['day_pattern'] ?? ''));
            if ($rawPattern === '' && isset($s['day_of_week']) && $s['day_of_week'] !== '' && $s['day_of_week'] !== null) {
                $rawPattern = (string)(int)$s['day_of_week'];
            }
            $patternDays = [];
            foreach (explode(',', $rawPattern) as $tok) {
                $n = (int)trim($tok);
                if ($n >= 1 && $n <= 7 && !in_array($n, $patternDays, true)) {
                    $patternDays[] = $n;
                }
            }
            sort($patternDays);
            $dayPattern = $patternDays === [] ? null : implode(',', $patternDays);
            $dayOfWeek  = count($patternDays) === 1 ? $patternDays[0] : null;
            $startTime    = $cleanTime($s['start_time'] ?? null);
            $endTime      = $cleanTime($s['end_time']   ?? null);
            $instructorId = isset($s['instructor_id']) && $s['instructor_id'] !== '' && $s['instructor_id'] !== null
                ? (int)$s['instructor_id'] : null;
            // Denormalise the lecturer's name from the (namespaced) id so it
            // displays even when the id points at a user account that isn't in
            // `hr_employees` (the getSchedules join only covers employees).
            $resolvedName = $this->resolveInstructorName($instructorId);
            if ($resolvedName !== null) $instructorRaw = $resolvedName;
            $yearOfStudy  = isset($s['year_of_study']) && $s['year_of_study'] !== '' && $s['year_of_study'] !== null
                ? (int)$s['year_of_study'] : null;
            $campusId     = isset($s['campus_id']) && $s['campus_id'] !== '' && $s['campus_id'] !== null
                ? (int)$s['campus_id'] : null;

            if ($moduleId <= 0 && $blockId <= 0) {
                $failed[] = ['index' => $idx, 'error' => 'Missing module_id.'];
                continue;
            }
            if ($startDate && $endDate && $endDate < $startDate) {
                $failed[] = ['index' => $idx, 'error' => 'end_date must be on or after start_date.'];
                continue;
            }
            if ($startTime && $endTime && $endTime <= $startTime) {
                $failed[] = ['index' => $idx, 'error' => 'end_time must be after start_time.'];
                continue;
            }

            $payload = [
                'start_date'      => $startDate,
                'end_date'        => $endDate,
                'semesters'       => $semesters,
                'day_of_week'     => $dayOfWeek,
                'day_pattern'     => $dayPattern,
                'start_time'      => $startTime,
                'end_time'        => $endTime,
                'instructor_id'   => $instructorId,
                'instructor_name' => $instructorRaw,
                'activity'        => $activity,
                'year_of_study'   => $yearOfStudy,
                'campus_id'       => $campusId,
                'academic_year'   => $academicYear,
            ];

            try {
                if ($blockId > 0) {
                    $offModel->update($blockId, $payload);
                    $updated++;
                } else {
                    $offModel->create(array_merge($payload, [
                        'module_id' => $moduleId,
                        'option_id' => $programId,
                        'mode'      => $modeKey,
                    ]));
                    $created++;
                }
            } catch (\Throwable $e) {
                $failed[] = ['index' => $idx, 'error' => $e->getMessage()];
            }
        }

        $this->success($response, [
            'created' => $created,
            'updated' => $updated,
            'deleted' => $deleted,
            'failed'  => $failed,
        ], 'Schedule saved.');
    }

    /**
     * DELETE /api/academics-management/schedules/:id
     * Removes a single teaching block.
     */
    public function deleteScheduleBlock(Request $request, Response $response): never
    {
        $id = (int)($request->param('id') ?? 0);
        if ($id <= 0) $this->error($response, 'id is required.', 422);
        $this->models['module_offerings']->delete($id);
        $this->success($response, null, 'Schedule block deleted.');
    }

    /**
     * GET /api/academics-management/exams/scheduled-modules
     *
     * Returns the modules that already have at least one teaching block in
     * `module_offerings` — the universe of "active" modules the admin can
     * pick from when scheduling an exam. One row per (module, option, mode)
     * tuple, deduped. Joins are limited to tables that always exist on
     * this DB (modules / options / campuses); the legacy schema doesn't
     * carry separate `faculties` / `departments` tables, so the program
     * (option) is the only org-level context resolved here.
     */
    public function examScheduledModules(Request $request, Response $response): never
    {
        $rows = $this->models['module_offerings']->db()->fetchAll(
            "SELECT
                mo.module_id,
                mo.option_id,
                mo.mode,
                mo.academic_year,
                mo.year_of_study,
                mo.semesters,
                mo.campus_id,
                m.module_code,
                m.module_name,
                m.module_credits,
                m.level,
                o.name      AS option_name,
                o.acro      AS option_acro,
                o.code      AS option_code,
                c.name      AS campus_name,
                MIN(mo.start_date) AS earliest_start,
                MAX(mo.end_date)   AS latest_end
             FROM `module_offerings` mo
             JOIN `modules`      m  ON m.module_id = mo.module_id
             LEFT JOIN `options` o  ON o.id        = mo.option_id
             LEFT JOIN `campuses`    c ON c.id     = mo.campus_id
             WHERE mo.module_id IS NOT NULL
             GROUP BY mo.module_id, mo.option_id, mo.mode, mo.academic_year,
                      mo.year_of_study, mo.semesters, mo.campus_id,
                      m.module_code, m.module_name, m.module_credits, m.level,
                      o.name, o.acro, o.code,
                      c.name
             ORDER BY m.module_code ASC, o.acro ASC",
        );
        $out = [];
        foreach ($rows as $r) {
            $out[] = [
                'module_id'      => (int)$r['module_id'],
                'option_id'      => $r['option_id'] !== null ? (int)$r['option_id'] : null,
                'mode'           => $r['mode']          ?? null,
                'academic_year'  => $r['academic_year'] ?? null,
                'year_of_study'  => $r['year_of_study'] !== null ? (int)$r['year_of_study'] : null,
                'semesters'      => $r['semesters']     ?? null,
                'campus_id'      => $r['campus_id']     !== null ? (int)$r['campus_id'] : null,
                'module_code'    => (string)$r['module_code'],
                'module_name'    => (string)$r['module_name'],
                'module_credits' => $r['module_credits'] !== null ? (int)$r['module_credits'] : null,
                'level'          => $r['level']         !== null ? (int)$r['level'] : null,
                'option_name'    => $r['option_name']   ?? null,
                'option_acro'    => $r['option_acro']   ?? null,
                'option_code'    => $r['option_code']   ?? null,
                'fac_name'       => null,
                'fac_acronym'    => null,
                'fac_code'       => null,
                'dep_name'       => null,
                'dep_acronym'    => null,
                'campus_name'    => $r['campus_name']   ?? null,
                'earliest_start' => $r['earliest_start'] ?? null,
                'latest_end'     => $r['latest_end']     ?? null,
            ];
        }
        $this->success($response, ['rows' => $out, 'count' => count($out)], 'Scheduled modules fetched.');
    }

    /**
     * GET /api/academics-management/exams
     *
     * Lists exam_schedules rows with the module / program / faculty / campus
     * joined in. Optional filters: term_id, academic_year, option_id,
     * module_id, component, q (free-text on code/name).
     */
    public function listExams(Request $request, Response $response): never
    {
        $optionId  = $request->query('option_id');
        $hasOption = $optionId !== null && $optionId !== '';

        $termId    = $request->query('term_id');
        $year      = trim((string)($request->query('academic_year') ?? ''));
        $moduleId  = $request->query('module_id');
        $component = trim((string)($request->query('component') ?? ''));
        $q         = trim((string)($request->query('q') ?? ''));

        // Two distinct shapes:
        //   A. No program filter — list every saved exam across the system.
        //   B. Program filter set — list every module currently scheduled in
        //      that program, with its exam (if any) attached. Modules without
        //      an exam come back with id=null so the UI can render a
        //      "Schedule" button instead of edit/delete.
        if ($hasOption) {
            $args = [(int)$optionId];

            $where = [];
            // The non-option filters (term/year/component) only narrow the
            // exam side of the LEFT JOIN — we still want to see modules
            // that have no exam at all, so each filter is OR'd against
            // `es.id IS NULL`.
            if ($termId !== null && $termId !== '') {
                $where[] = '(es.term_id = ? OR es.id IS NULL)';
                $args[]  = (int)$termId;
            }
            if ($year !== '') {
                $where[] = '(es.academic_year = ? OR es.id IS NULL)';
                $args[]  = $year;
            }
            if ($moduleId !== null && $moduleId !== '') {
                $where[] = 'mo.module_id = ?';
                $args[]  = (int)$moduleId;
            }
            if ($component !== '') {
                $where[] = '(es.component = ? OR es.id IS NULL)';
                $args[]  = $component;
            }
            if ($q !== '') {
                $where[] = '(m.module_code LIKE ? OR m.module_name LIKE ?)';
                $like    = '%' . $q . '%';
                $args[]  = $like;
                $args[]  = $like;
            }
            $whereSql = $where ? ('AND ' . implode(' AND ', $where)) : '';

            // Subquery dedupes module_offerings into one row per module
            // inside the program — admins only need one entry per module
            // to schedule its exam, regardless of how many teaching
            // blocks exist. The `registered_count` correlated subquery
            // surfaces how many students have actually registered for
            // this module (by exam term when set, else any term) so
            // the exam list can show the cohort size at a glance.
            $rows = $this->models['exam_schedules']->db()->fetchAll(
                "SELECT
                    es.id,
                    mo.module_id,
                    COALESCE(es.option_id, mo.option_id) AS option_id,
                    es.term_id,
                    COALESCE(es.academic_year, mo.academic_year) AS academic_year,
                    es.component,
                    es.exam_date, es.start_time, es.end_time,
                    COALESCE(es.campus_id, mo.campus_id) AS campus_id,
                    es.instructor_name, es.notes,
                    m.module_code, m.module_name, m.module_credits, m.level,
                    o.name AS option_name, o.acro AS option_acro, o.code AS option_code,
                    COALESCE(esc.name, moc.name) AS campus_name,
                    t.label AS term_label,
                    mo.mode_label,
                    (
                        SELECT COUNT(*) FROM `module_registrations` mr
                        WHERE mr.module_id = mo.module_id
                          AND mr.status    = 'registered'
                          AND (es.term_id IS NULL OR mr.academic_term_id = es.term_id)
                    ) AS registered_count
                 FROM (
                    SELECT module_id, option_id,
                           MIN(academic_year) AS academic_year,
                           MIN(campus_id)     AS campus_id,
                           GROUP_CONCAT(DISTINCT NULLIF(`mode`,'') ORDER BY `mode` SEPARATOR ', ') AS mode_label
                    FROM `module_offerings`
                    WHERE option_id = ?
                    GROUP BY module_id, option_id
                 ) mo
                 JOIN `modules` m ON m.module_id = mo.module_id
                 LEFT JOIN `options` o ON o.id = mo.option_id
                 LEFT JOIN `campuses` moc ON moc.id = mo.campus_id
                 LEFT JOIN `exam_schedules` es ON es.module_id = mo.module_id
                       AND (es.option_id <=> mo.option_id)
                 LEFT JOIN `campuses` esc ON esc.id = es.campus_id
                 LEFT JOIN `academic_terms` t ON t.id = es.term_id
                 WHERE 1=1
                 $whereSql
                 ORDER BY (es.id IS NULL) ASC, es.exam_date ASC, es.start_time ASC, m.module_code ASC",
                $args,
            );
        } else {
            $where = [];
            $args  = [];
            if ($termId !== null && $termId !== '') {
                $where[] = 'es.term_id = ?';
                $args[]  = (int)$termId;
            }
            if ($year !== '') {
                $where[] = 'es.academic_year = ?';
                $args[]  = $year;
            }
            if ($moduleId !== null && $moduleId !== '') {
                $where[] = 'es.module_id = ?';
                $args[]  = (int)$moduleId;
            }
            if ($component !== '') {
                $where[] = 'es.component = ?';
                $args[]  = $component;
            }
            if ($q !== '') {
                $where[] = '(m.module_code LIKE ? OR m.module_name LIKE ?)';
                $like    = '%' . $q . '%';
                $args[]  = $like;
                $args[]  = $like;
            }
            $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';

            $rows = $this->models['exam_schedules']->db()->fetchAll(
                "SELECT
                    es.id, es.module_id, es.option_id, es.term_id, es.academic_year,
                    es.component, es.exam_date, es.start_time, es.end_time,
                    es.campus_id, es.instructor_name, es.notes,
                    m.module_code, m.module_name, m.module_credits, m.level,
                    o.name      AS option_name,
                    o.acro      AS option_acro,
                    o.code      AS option_code,
                    c.name      AS campus_name,
                    t.label     AS term_label,
                    NULL        AS mode_label,
                    (
                        SELECT COUNT(*) FROM `module_registrations` mr
                        WHERE mr.module_id = es.module_id
                          AND mr.status    = 'registered'
                          AND (es.term_id IS NULL OR mr.academic_term_id = es.term_id)
                    ) AS registered_count
                 FROM `exam_schedules` es
                 JOIN `modules`      m ON m.module_id = es.module_id
                 LEFT JOIN `options` o ON o.id        = es.option_id
                 LEFT JOIN `campuses`    c ON c.id     = es.campus_id
                 LEFT JOIN `academic_terms` t ON t.id  = es.term_id
                 $whereSql
                 ORDER BY es.exam_date ASC, es.start_time ASC, m.module_code ASC",
                $args,
            );
        }

        $out = [];
        foreach ($rows as $r) {
            $out[] = [
                'id'              => $r['id'] !== null ? (int)$r['id'] : null,
                'module_id'       => (int)$r['module_id'],
                'option_id'       => $r['option_id']  !== null ? (int)$r['option_id']  : null,
                'term_id'         => $r['term_id']    !== null ? (int)$r['term_id']    : null,
                'academic_year'   => $r['academic_year']   ?? null,
                'component'       => (string)($r['component'] ?? ''),
                'exam_date'       => $r['exam_date']       ?? null,
                'start_time'      => $r['start_time']      ?? null,
                'end_time'        => $r['end_time']        ?? null,
                'campus_id'       => $r['campus_id']  !== null ? (int)$r['campus_id'] : null,
                'instructor_name' => $r['instructor_name'] ?? null,
                'notes'           => $r['notes']           ?? null,
                'module_code'     => (string)$r['module_code'],
                'module_name'     => (string)$r['module_name'],
                'module_credits'  => $r['module_credits'] !== null ? (int)$r['module_credits'] : null,
                'level'           => $r['level']          !== null ? (int)$r['level']          : null,
                'option_name'     => $r['option_name']    ?? null,
                'option_acro'     => $r['option_acro']    ?? null,
                'option_code'     => $r['option_code']    ?? null,
                'dep_name'        => null,
                'dep_acronym'     => null,
                'fac_name'        => null,
                'fac_acronym'     => null,
                'fac_code'        => null,
                'campus_name'     => $r['campus_name']    ?? null,
                'term_label'      => $r['term_label']     ?? null,
                'mode_label'      => $r['mode_label']     ?? null,
                'registered_count' => isset($r['registered_count']) ? (int)$r['registered_count'] : 0,
            ];
        }
        $this->success($response, ['rows' => $out, 'count' => count($out)], 'Exams fetched.');
    }

    /**
     * POST /api/academics-management/exams
     * Body: { module_id, option_id?, term_id?, academic_year?, component?,
     *         exam_date?, start_time?, end_time?, campus_id?,
     *         instructor_name?, notes? }
     */
    public function createExam(Request $request, Response $response): never
    {
        $body = $request->body();
        $payload = $this->normaliseExamPayload($body);
        if (!$payload['module_id']) {
            $this->error($response, 'module_id is required.', 422);
        }
        if ($payload['exam_date'] === null) {
            $this->error($response, 'exam_date is required.', 422);
        }
        if ($payload['start_time'] && $payload['end_time']
            && $payload['end_time'] <= $payload['start_time']) {
            $this->error($response, 'end_time must be after start_time.', 422);
        }
        $id = $this->models['exam_schedules']->create($payload);
        $this->success($response, ['id' => (int)$id], 'Exam scheduled.', 201);
    }

    /**
     * PUT /api/academics-management/exams/:id
     */
    public function updateExam(Request $request, Response $response): never
    {
        $id = (int)($request->param('id') ?? 0);
        if ($id <= 0) $this->error($response, 'id is required.', 422);
        $existing = $this->models['exam_schedules']->find($id);
        if (!$existing) $this->error($response, 'Exam not found.', 404);

        $payload = $this->normaliseExamPayload($request->body(), allowPartial: true);
        if (isset($payload['start_time'], $payload['end_time'])
            && $payload['start_time'] && $payload['end_time']
            && $payload['end_time'] <= $payload['start_time']) {
            $this->error($response, 'end_time must be after start_time.', 422);
        }
        $this->models['exam_schedules']->update($id, $payload);
        $this->success($response, null, 'Exam updated.');
    }

    /**
     * DELETE /api/academics-management/exams/:id
     */
    public function deleteExam(Request $request, Response $response): never
    {
        $id = (int)($request->param('id') ?? 0);
        if ($id <= 0) $this->error($response, 'id is required.', 422);
        $this->models['exam_schedules']->delete($id);
        $this->success($response, null, 'Exam deleted.');
    }

    /**
     * GET /api/academics-management/exams/:id/attendance
     *
     * Returns the per-exam attendance sheet payload — exam header (faculty,
     * module, component, date, lecturer, campus) plus the roster of students
     * who will sit it. Roster is sourced from `module_registrations` for the
     * exam's module + term; falls back to the program/level mapping that
     * powers the marks page when no formal registrations exist.
     */
    public function examAttendance(Request $request, Response $response): never
    {
        $id = (int)($request->param('id') ?? 0);
        if ($id <= 0) $this->error($response, 'id is required.', 422);

        $db = $this->models['exam_schedules']->db();

        $exam = $db->fetchOne(
            "SELECT
                es.id, es.module_id, es.option_id, es.term_id, es.academic_year,
                es.component, es.exam_date, es.start_time, es.end_time,
                es.campus_id, es.instructor_name, es.notes,
                m.module_code, m.module_name, m.module_credits, m.level,
                o.name AS option_name, o.acro AS option_acro, o.code AS option_code,
                o.department_id,
                c.name AS campus_name,
                t.label AS term_label
             FROM `exam_schedules` es
             JOIN `modules` m ON m.module_id = es.module_id
             LEFT JOIN `options` o ON o.id = es.option_id
             LEFT JOIN `campuses`  c ON c.id     = es.campus_id
             LEFT JOIN `academic_terms` t ON t.id = es.term_id
             WHERE es.id = ? LIMIT 1",
            [$id],
        );
        if (!$exam) $this->error($response, 'Exam not found.', 404);

        $moduleId = (int)$exam['module_id'];
        $termId   = $exam['term_id'] !== null ? (int)$exam['term_id'] : null;
        $level    = (int)($exam['level'] ?? 0);
        $depId    = $exam['department_id'] !== null ? (int)$exam['department_id'] : 0;
        $exam['dep_name']     = null;
        $exam['dep_acronym']  = null;
        $exam['fac_id']       = null;
        $exam['fac_name']     = null;
        $exam['fac_acronym']  = null;
        $exam['fac_code']     = null;

        // Roster comes from `module_registrations` — formally enrolled
        // students for this specific module / term. We deliberately do
        // NOT scope by the exam's option_id: shared / service modules
        // (e.g. English Skills taught for MCS but also Bio+Chem) need to
        // surface every cross-programme enrollee on the same attendance
        // sheet. Each student carries their own programme label below
        // so the exam invigilator can still tell who is from where.
        //
        // The term filter is applied when an exam term is set; otherwise
        // we accept registrations across terms (still scoped to module).
        $args  = [$moduleId];
        // `<> 'dropped'` not `= 'registered'`: ModuleMarksController::saveMarks
        // flips module_registrations.status to 'completed'/'failed' once a student
        // is marked, so filtering on 'registered' silently removed marked students
        // from the exam sheet — they could not be signed in or marked absent.
        $where = "mr.module_id = ? AND mr.status <> 'dropped'";
        if ($termId !== null) {
            $where .= " AND mr.academic_term_id = ?";
            $args[] = $termId;
        }
        $roster = $db->fetchAll(
            "SELECT st.regnumber, st.fname, st.lname,
                    st.std_option AS option_acro,
                    st.current_level AS level,
                    st.intake, st.gender
             FROM module_registrations mr
             JOIN student st ON st.regnumber = mr.student_regnumber
             WHERE $where
             ORDER BY st.lname, st.fname",
            $args,
        );

        // Resolve the program acronym for each student. Some students have
        // their `std_option` stored as the legacy `dep_options.op_id`, others
        // (post-migration cohorts) store the new `options.id` directly — we
        // try both so cross-programme rows always show a meaningful label.
        $optionLabelByOpId = [];
        $resolveOptionLabel = function ($opId) use ($db, &$optionLabelByOpId) {
            $key = (string)$opId;
            if ($key === '') return null;
            if (array_key_exists($key, $optionLabelByOpId)) return $optionLabelByOpId[$key];
            // Prefer options.acro / options.code / options.name when std_option
            // is numeric (post-migration enrollments).
            if (ctype_digit($key)) {
                $row = $db->fetchOne(
                    "SELECT acro, code, name FROM options WHERE id = ? LIMIT 1",
                    [(int)$key],
                );
                if ($row) {
                    $label = $row['acro'] ?: ($row['code'] ?: $row['name']);
                    if ($label) return $optionLabelByOpId[$key] = $label;
                }
            }
            $row = $db->fetchOne(
                "SELECT option_acronym FROM dep_options WHERE op_id = ? LIMIT 1",
                [$key],
            );
            return $optionLabelByOpId[$key] = ($row['option_acronym'] ?? $key);
        };

        // Pull each registered student's mode (Day/Weekend/Holiday) from
        // their most recent module_offerings row in the same option, falling
        // back to the exam-level default if nothing matches.
        $defaultMode = $db->fetchOne(
            "SELECT mo.mode
             FROM module_offerings mo
             WHERE mo.module_id = ?
             ORDER BY mo.id DESC LIMIT 1",
            [$moduleId],
        )['mode'] ?? null;

        $semestersDefault = $db->fetchOne(
            "SELECT mo.semesters
             FROM module_offerings mo
             WHERE mo.module_id = ?
             ORDER BY mo.id DESC LIMIT 1",
            [$moduleId],
        )['semesters'] ?? null;

        $rosterOut = [];
        foreach ($roster as $r) {
            $optionAcro = $r['option_acro'] !== null && $r['option_acro'] !== ''
                ? $resolveOptionLabel($r['option_acro'])
                : ($exam['option_acro'] ?? null);
            $rosterOut[] = [
                'regnumber'    => (string)($r['regnumber'] ?? ''),
                'first_name'   => (string)($r['fname']     ?? ''),
                'last_name'    => (string)($r['lname']     ?? ''),
                'option_acro'  => $optionAcro,
                'semester'     => $semestersDefault,
                'attendance_mode' => $defaultMode,
                'level'        => $r['level'] ?? null,
                'intake'       => $r['intake'] ?? null,
                'gender'       => $r['gender'] ?? null,
            ];
        }

        $header = [
            'exam_id'         => (int)$exam['id'],
            'module_id'       => $moduleId,
            'module_code'     => (string)$exam['module_code'],
            'module_name'     => (string)$exam['module_name'],
            'module_credits'  => $exam['module_credits'] !== null ? (int)$exam['module_credits'] : null,
            'level'           => $exam['level']          !== null ? (int)$exam['level']          : null,
            'component'       => (string)$exam['component'],
            'exam_date'       => $exam['exam_date'],
            'start_time'      => $exam['start_time'],
            'end_time'        => $exam['end_time'],
            'campus_name'     => $exam['campus_name'],
            'option_name'     => $exam['option_name'],
            'option_acro'     => $exam['option_acro'],
            'fac_name'        => $exam['fac_name'],
            'fac_acronym'     => $exam['fac_acronym'],
            'dep_name'        => $exam['dep_name'],
            'instructor_name' => $exam['instructor_name'],
            'term_label'      => $exam['term_label'],
            'academic_year'   => $exam['academic_year'],
            'notes'           => $exam['notes'],
        ];

        $this->success($response, [
            'header'  => $header,
            'roster'  => $rosterOut,
            'count'   => count($rosterOut),
        ], 'Exam attendance fetched.');
    }

    /**
     * Shared payload normaliser for create/update exam — clamps blank
     * strings to null, coerces ids/integers, validates the time format.
     */
    private function normaliseExamPayload(array $body, bool $allowPartial = false): array
    {
        $clean = static function ($v) {
            $s = trim((string)($v ?? ''));
            return $s === '' ? null : $s;
        };
        $cleanTime = static function ($v): ?string {
            $s = trim((string)($v ?? ''));
            if ($s === '') return null;
            if (preg_match('/^\d{1,2}:\d{2}(:\d{2})?$/', $s)) {
                if (strlen($s) === 4) $s = '0' . $s;
                if (strlen($s) === 5) $s .= ':00';
                return $s;
            }
            return null;
        };

        $payload = [
            'module_id'       => isset($body['module_id'])  && $body['module_id']  !== '' ? (int)$body['module_id']  : null,
            'option_id'       => isset($body['option_id'])  && $body['option_id']  !== '' ? (int)$body['option_id']  : null,
            'term_id'         => isset($body['term_id'])    && $body['term_id']    !== '' ? (int)$body['term_id']    : null,
            'academic_year'   => $clean($body['academic_year']   ?? null),
            'component'       => $clean($body['component']       ?? null) ?? 'Final Exam',
            'exam_date'       => $clean($body['exam_date']       ?? null),
            'start_time'      => $cleanTime($body['start_time']  ?? null),
            'end_time'        => $cleanTime($body['end_time']    ?? null),
            'campus_id'       => isset($body['campus_id'])  && $body['campus_id']  !== '' ? (int)$body['campus_id']  : null,
            'instructor_name' => $clean($body['instructor_name'] ?? null),
            'notes'           => $clean($body['notes']           ?? null),
        ];

        // On a partial update we don't want to clobber columns the caller
        // didn't send. Strip keys that weren't explicitly present in $body.
        if ($allowPartial) {
            $sentKeys = array_keys($body);
            $payload = array_intersect_key($payload, array_flip($sentKeys));
        }
        return $payload;
    }

    /**
     * POST /api/academics-management/schedules/import-timetable
     *
     * Bulk import of the university's timetable spreadsheet. Each row in
     * the request becomes one teaching block in `module_offerings`.
     * The frontend parses the .xlsx / .csv first; the backend is given
     * normalised rows with explicit field names so the contract stays
     * stable across file format quirks.
     *
     * Body:
     *   {
     *     academic_year: "2025-2026" | null,
     *     mode_default:  "Day" | "Weekend" | "Holiday",
     *     replace:       bool   // when true, every existing block matching
     *                           // (module, option, mode) for the imported
     *                           // rows is deleted before the new ones are
     *                           // inserted — clean re-imports.
     *     rows: [
     *       {
     *         option_acro:    "MCS",
     *         module_code:    "NALP4322",
     *         module_name:    "Numerical Analysis…",
     *         start_date:     "2025-09-08",
     *         end_date:       "2025-09-12",
     *         start_time:     "08:30",
     *         end_time:       "13:00",
     *         semesters:      "S5&S6",
     *         activity:       "Teaching" | "Final Exam" | …,
     *         lecturer_name:  "Ngizimana Boaz" | "PT" | …,
     *         level:          8,
     *         year_of_study:  2,
     *         campus_name:    "Taba",
     *         attendance_mode:"DP",        // 'DP' → 'Day'
     *       }, ...
     *     ]
     *   }
     */
    public function timetableImport(Request $request, Response $response): never
    {
        $body         = $request->body();
        $academicYear = trim((string)($body['academic_year'] ?? '')) ?: null;
        $modeDefault  = trim((string)($body['mode_default']  ?? 'Day')) ?: 'Day';
        $replace      = !empty($body['replace']);
        $rows         = $body['rows'] ?? [];

        if (!is_array($rows)) $this->error($response, 'rows must be an array.', 422);

        /** @var OptionModel    $optionModel */
        $optionModel = $this->models['options'];
        /** @var ModuleModel    $moduleModel */
        $moduleModel = $this->models['modules'];
        /** @var \App\Models\CampusModel $campusModel */
        $campusModel = $this->models['campuses'];

        // Pre-load lookups by case-insensitive trimmed key. Cheap because
        // each table is small relative to the row count.
        $optionByAcro = [];
        foreach ($optionModel->db()->fetchAll(
            "SELECT id, acro, code, department_id FROM `options` WHERE acro IS NOT NULL AND acro <> ''",
        ) as $r) {
            $optionByAcro[strtolower(trim((string)$r['acro']))] = $r;
        }
        $campusByName = [];
        foreach ($campusModel->db()->fetchAll("SELECT id, name FROM `campuses`") as $r) {
            $campusByName[strtolower(trim((string)$r['name']))] = (int)$r['id'];
        }
        $instructorByName = [];
        foreach ($moduleModel->db()->fetchAll("SELECT id, full_name FROM `hr_employees`") as $r) {
            $instructorByName[strtolower(trim((string)$r['full_name']))] = (int)$r['id'];
        }

        // Levels — the timetable's `Level` column carries a level *name*
        // (e.g. "8" in the Rwanda HE framework, not the auto-increment id).
        // Build both lookups so we can resolve either way and fall back to
        // null when neither matches, instead of letting the FK insert blow up.
        $levelByName  = [];
        $validLevelIds = [];
        foreach ($moduleModel->db()->fetchAll("SELECT id, name FROM `levels`") as $r) {
            $levelByName[strtolower(trim((string)$r['name']))] = (int)$r['id'];
            $validLevelIds[(int)$r['id']] = true;
        }
        $resolveLevelId = static function ($raw) use ($levelByName, $validLevelIds): ?int {
            if ($raw === null || $raw === '') return null;
            $key = strtolower(trim((string)$raw));
            if (isset($levelByName[$key])) return $levelByName[$key];
            if (ctype_digit($key) && isset($validLevelIds[(int)$key])) return (int)$key;
            return null;
        };

        $modeMap = ['DP' => 'Day', 'WK' => 'Weekend', 'HD' => 'Holiday'];

        $moduleIdByCode = [];
        $modulesCreated = 0;
        $blocksCreated  = 0;
        $blocksUpdated  = 0;
        $blocksReplaced = 0;
        $failed         = [];
        $unknownOpts    = [];
        $unknownStaff   = [];
        $unknownCampuses = [];
        $unknownLevels   = [];

        // Track which (module_id, option_id, mode) combos we've already
        // wiped during this import (replace=true) so each combo only gets
        // cleared once even if the file has many rows for it.
        $wipedKeys = [];

        $offModel = $this->models['module_offerings'];

        foreach ($rows as $idx => $r) {
            if (!is_array($r)) {
                $failed[] = ['index' => $idx, 'error' => 'Row must be an object.'];
                continue;
            }

            $optAcro = strtolower(trim((string)($r['option_acro']  ?? '')));
            $code    = trim((string)($r['module_code']  ?? ''));
            $name    = trim((string)($r['module_name']  ?? ''));
            if ($optAcro === '' || $code === '') {
                $failed[] = ['index' => $idx, 'error' => 'Missing OPT or module Code.'];
                continue;
            }

            $optionRow = $optionByAcro[$optAcro] ?? null;
            if (!$optionRow) {
                if (!in_array($optAcro, $unknownOpts, true)) $unknownOpts[] = $optAcro;
                $failed[] = ['index' => $idx, 'error' => "Unknown OPT '{$r['option_acro']}'."];
                continue;
            }
            $optionId  = (int)$optionRow['id'];
            $deptId    = isset($optionRow['department_id']) ? (int)$optionRow['department_id'] : null;

            $rawMode = strtoupper(trim((string)($r['attendance_mode'] ?? '')));
            $modeKey = $modeMap[$rawMode] ?? $modeDefault;

            // Upsert module by code (cached per import).
            $codeKey = strtolower($code);
            if (!isset($moduleIdByCode[$codeKey])) {
                $existingMod = $moduleModel->db()->fetchOne(
                    "SELECT module_id, module_name, level FROM `modules` WHERE TRIM(`module_code`) = ? LIMIT 1",
                    [$code],
                );
                if ($existingMod) {
                    $moduleIdByCode[$codeKey] = (int)$existingMod['module_id'];
                    if ($name !== '' && $name !== ($existingMod['module_name'] ?? '')) {
                        $moduleModel->update((int)$existingMod['module_id'], ['module_name' => $name]);
                    }
                } else {
                    $level = isset($r['level']) && $r['level'] !== '' ? (int)$r['level'] : 0;
                    $newId = $moduleModel->create([
                        'module_code'    => $code,
                        'module_name'    => $name !== '' ? $name : $code,
                        'module_credits' => 0,
                        'level'          => $level,
                        'department'     => $deptId ?? 0,
                    ]);
                    $moduleIdByCode[$codeKey] = (int)$newId;
                    $modulesCreated++;
                }
            }
            $moduleId = $moduleIdByCode[$codeKey];

            // Make sure the module is linked to the program — that's the
            // contract the rest of the system relies on.
            $moduleModel->db()->execute(
                'INSERT IGNORE INTO `module_programs` (`module_id`, `option_id`) VALUES (?, ?)',
                [$moduleId, $optionId],
            );

            // Clear existing blocks for this combo on the first time we
            // see it (only when replace=true).
            $combo = "{$moduleId}|{$optionId}|" . ($modeKey ?? '');
            if ($replace && !isset($wipedKeys[$combo])) {
                $del = $offModel->db()->execute(
                    "DELETE FROM `module_offerings`
                     WHERE module_id = ? AND option_id = ? AND `mode` <=> ?",
                    [$moduleId, $optionId, $modeKey],
                );
                $blocksReplaced += (int)$del;
                $wipedKeys[$combo] = true;
            }

            // Resolve campus by name (case-insensitive), instructor by full_name.
            $campusName = trim((string)($r['campus_name'] ?? ''));
            $campusId   = $campusName === '' ? null : ($campusByName[strtolower($campusName)] ?? null);
            if ($campusName !== '' && $campusId === null
                && !in_array($campusName, $unknownCampuses, true)
            ) {
                $unknownCampuses[] = $campusName;
            }
            $lecturer   = trim((string)($r['lecturer_name'] ?? ''));
            $instructorId   = $lecturer === '' ? null : ($instructorByName[strtolower($lecturer)] ?? null);
            $instructorName = $lecturer === '' ? null : ($instructorId === null ? $lecturer : null);
            if ($lecturer !== '' && $instructorId === null
                && !in_array($lecturer, $unknownStaff, true)
            ) {
                $unknownStaff[] = $lecturer;
            }

            $startDate = trim((string)($r['start_date'] ?? '')) ?: null;
            $endDate   = trim((string)($r['end_date']   ?? '')) ?: null;
            $startTime = trim((string)($r['start_time'] ?? '')) ?: null;
            $endTime   = trim((string)($r['end_time']   ?? '')) ?: null;
            if ($startTime !== null && strlen($startTime) === 5) $startTime .= ':00';
            if ($endTime   !== null && strlen($endTime)   === 5) $endTime   .= ':00';

            // Round-trip update: if the spreadsheet preserves the offering's
            // `id` (the one our export emits in the ID column), update that
            // row in place. Otherwise insert. This lets admins edit the
            // exported xlsx and re-upload without producing duplicates.
            $offeringId = isset($r['id']) && $r['id'] !== '' && $r['id'] !== null
                ? (int)$r['id']
                : null;

            $rawLevel = $r['level'] ?? null;
            $levelId  = $resolveLevelId($rawLevel);
            if ($rawLevel !== null && $rawLevel !== '' && $levelId === null) {
                $disp = (string)$rawLevel;
                if (!in_array($disp, $unknownLevels, true)) $unknownLevels[] = $disp;
            }

            $payload = [
                'module_id'       => $moduleId,
                'option_id'       => $optionId,
                'mode'            => $modeKey,
                'semesters'       => trim((string)($r['semesters'] ?? '')) ?: null,
                'start_date'      => $startDate,
                'end_date'        => $endDate,
                'start_time'      => $startTime,
                'end_time'        => $endTime,
                'activity'        => trim((string)($r['activity'] ?? '')) ?: null,
                'instructor_id'   => $instructorId,
                'instructor_name' => $instructorName,
                'level_id'        => $levelId,
                'year_of_study'   => isset($r['year_of_study']) && $r['year_of_study'] !== '' ? (int)$r['year_of_study'] : null,
                'campus_id'       => $campusId,
                'academic_year'   => $academicYear,
            ];

            try {
                if ($offeringId !== null && $offModel->find($offeringId)) {
                    $offModel->update($offeringId, $payload);
                    $blocksUpdated++;
                } else {
                    $offModel->create($payload);
                    $blocksCreated++;
                }
            } catch (\Throwable $e) {
                $failed[] = ['index' => $idx, 'error' => $e->getMessage()];
            }
        }

        $this->success($response, [
            'modules_created' => $modulesCreated,
            'blocks_created'  => $blocksCreated,
            'blocks_updated'  => $blocksUpdated,
            'blocks_replaced' => $blocksReplaced,
            'failed'          => $failed,
            'unknown_opts'    => array_values($unknownOpts),
            'unknown_staff'   => array_values($unknownStaff),
            'unknown_campuses'=> array_values($unknownCampuses),
            'unknown_levels'  => array_values($unknownLevels),
        ], 'Timetable imported.');
    }

    /**
     * GET /api/academics-management/schedules/export-timetable
     *
     * Returns every teaching block flattened with the surrounding context
     * (department, program, module, lecturer, campus). The frontend
     * formats the rows into a CSV that mirrors the source spreadsheet.
     */
    public function timetableExport(Request $request, Response $response): never
    {
        $sql = "SELECT
                    mo.id,
                    mo.start_date, mo.end_date, mo.start_time, mo.end_time,
                    mo.semesters, mo.activity, mo.year_of_study, mo.academic_year,
                    mo.`mode`,

                    m.module_code, m.module_name, m.module_credits, m.level,
                    -- `modules.level` is a `levels.id`; the exported sheet must
                    -- show the catalogue name, not the foreign key.
                    lv.name AS level_name,

                    o.acro AS option_acro, o.code AS option_code, o.name AS option_name,

                    d.dep_acronym, d.dep_code, d.dep_name,

                    e.full_name        AS instructor_full_name,
                    mo.instructor_name AS instructor_name_raw,

                    c.name AS campus_name
                FROM `module_offerings` mo
                JOIN `modules`      m ON m.module_id   = mo.module_id
                JOIN `options`      o ON o.id          = mo.option_id
                LEFT JOIN `departements` d ON d.dep_id = o.department_id
                LEFT JOIN `hr_employees` e ON e.id     = mo.instructor_id
                LEFT JOIN `campuses`     c ON c.id     = mo.campus_id
                LEFT JOIN `levels`       lv ON lv.id   = m.level
                ORDER BY mo.start_date ASC, mo.start_time ASC, m.module_code ASC, o.acro ASC";
        $rows = $this->models['module_offerings']->db()->fetchAll($sql);
        $this->success($response, ['rows' => $rows, 'count' => count($rows)], 'Timetable exported.');
    }

    /**
     * GET /api/academics-management/modules/curriculum-export
     *
     * Flattens every module_offerings row + its surrounding context
     * (module, option, department, faculty, level, campus) into one
     * record per placement — the inverse of `curriculumImport`. The
     * frontend writes this directly into the wide curriculum .xlsx.
     */
    public function curriculumExport(Request $request, Response $response): never
    {
        $sql = "SELECT
                    mo.id              AS offering_id,
                    mo.academic_year,
                    mo.mode,
                    mo.mode_order,
                    mo.semesters,
                    mo.module_order,
                    mo.campus_id,

                    m.module_code,
                    m.module_name,
                    m.module_credits,

                    o.code             AS option_code,
                    o.acro             AS option_acro,
                    o.name             AS option_name,
                    o.start_date       AS option_start,
                    o.end_date         AS option_end,

                    d.dep_code,
                    d.dep_acronym,
                    d.dep_name,

                    f.fac_code,
                    f.fac_acronym,
                    f.fac_name,

                    l.name             AS level_name,
                    c.name             AS campus_name

                FROM `module_offerings` mo
                LEFT JOIN `modules`      m ON m.module_id   = mo.module_id
                LEFT JOIN `options`      o ON o.id          = mo.option_id
                LEFT JOIN `departements` d ON d.dep_id      = o.department_id
                LEFT JOIN `faculty`      f ON f.fac_id      = d.fac_id
                LEFT JOIN `levels`       l ON l.id          = mo.level_id
                LEFT JOIN `campuses`     c ON c.id          = mo.campus_id
                ORDER BY
                    o.code        ASC,
                    mo.mode_order ASC,
                    mo.semesters  ASC,
                    mo.module_order ASC";
        $rows = $this->models['module_offerings']->db()->fetchAll($sql);
        $this->success($response, ['rows' => $rows, 'count' => count($rows)], 'Curriculum exported.');
    }

    /**
     * Per-entity whitelist of columns the `?q=` free-text search runs LIKE
     * against. Names must reference actual columns on the entity's table —
     * they are interpolated into SQL.
     */
    private function searchableColumns(string $entity): array
    {
        return match ($entity) {
            'faculties'   => ['fac_name', 'fac_code', 'fac_acronym', 'fac_descript'],
            'departments' => ['dep_name', 'dep_code', 'dep_acronym', 'dep_description'],
            'schools'     => ['school_name', 'school_descript', 'school_email', 'school_address'],
            'options'     => ['name', 'code', 'acro'],
            'levels'      => ['name'],
            'leave_types' => ['name'],
            'campuses'    => ['name', 'code', 'location', 'address', 'phone', 'email'],
            'intakes'     => ['name'],
            'degrees'     => ['code', 'name', 'degree_type'],
            'facility'    => ['name', 'building', 'room_type'],
            default       => [],
        };
    }

    /**
     * Fill in sensible defaults for columns that callers (especially bulk
     * imports) may legitimately omit. Only applied on insert paths — never
     * to updates, where missing keys mean "leave the column alone".
     */
    private function applyEntityDefaults(string $entity, array $data): array
    {
        $isMissing = static fn ($v) => $v === null || $v === '';

        if ($entity === 'faculties') {
            if (!array_key_exists('school_id', $data) || $isMissing($data['school_id'])) {
                $data['school_id'] = 1;
            }
            if (!array_key_exists('fac_reg_date', $data) || $isMissing($data['fac_reg_date'])) {
                $data['fac_reg_date'] = date('Y-m-d');
            }
        }

        return $data;
    }

    /**
     * Empty-string → null normalisation that's safe to apply on BOTH insert
     * and update paths. Strict-mode MySQL rejects '' on DATE columns; this
     * keeps frontend "clear this field" submissions working regardless of
     * whether the form sends `''` or `null`.
     */
    private function normalizeNullableColumns(string $entity, array $data): array
    {
        $nullableCols = match ($entity) {
            'options' => ['start_date', 'end_date'],
            default   => [],
        };
        foreach ($nullableCols as $col) {
            if (array_key_exists($col, $data) && $data[$col] === '') {
                $data[$col] = null;
            }
        }
        return $data;
    }

    /**
     * Enforce per-entity uniqueness for human-entered codes. Returns a
     * field-keyed error array on conflict, or null when fine. Empty/null
     * codes are skipped — multiple rows may legitimately have no code yet.
     *
     * @param int|null $excludeId Pass the row's PK on update so a row's own
     *                            code doesn't conflict with itself.
     */
    private function checkCodeUniqueness(string $entity, array $data, ?int $excludeId, ?array $levelIds = null): ?array
    {
        $config = match ($entity) {
            'faculties'   => ['column' => 'fac_code',    'pk' => 'fac_id',    'table' => 'faculty',      'label' => 'Faculty code'],
            'departments' => ['column' => 'dep_code',    'pk' => 'dep_id',    'table' => 'departements', 'label' => 'Department code'],
            'options'     => ['column' => 'code',        'pk' => 'id',        'table' => 'options',      'label' => 'Program code'],
            'modules'     => ['column' => 'module_code', 'pk' => 'module_id', 'table' => 'modules',      'label' => 'Module code'],
            default       => null,
        };
        if ($config === null) return null;

        $value = $data[$config['column']] ?? null;
        if ($value === null || $value === '') return null;

        // A module code is NOT globally unique: the same code names a different
        // module at another level, which is why ModulesManagementController has
        // `moduleCodeExistsInDepartmentLevel()`. This screen kept the global
        // check, so once a code existed on more than one row every one of those
        // rows became uneditable — saving any of them, even to change Hours,
        // came back "This Module code is already in use."
        if ($entity === 'modules') {
            return $this->checkModuleCodeUniqueness((string)$value, $data, $excludeId, $levelIds);
        }

        $sql = "SELECT 1 FROM `{$config['table']}` WHERE `{$config['column']}` = ?";
        $bindings = [$value];
        if ($excludeId !== null) {
            $sql .= " AND `{$config['pk']}` <> ?";
            $bindings[] = $excludeId;
        }
        $sql .= ' LIMIT 1';

        $hit = $this->models[$entity]->db()->fetchOne($sql, $bindings);
        if ($hit) {
            return [$config['column'] => ["This {$config['label']} is already in use."]];
        }
        return null;
    }

    /**
     * Module codes are unique per (department, level), not globally.
     *
     * This generalises `ModulesManagementController::moduleCodeExistsInDepartmentLevel()`
     * for modules that carry several levels: two modules sharing a code in the
     * same department clash only where their level sets OVERLAP. A module's
     * levels are `module_levels` when it has rows there, and the legacy
     * `modules.level` otherwise.
     *
     * Department is compared exactly, matching the helper above — a module with
     * no department is unplaced and conflicts with nothing, so the spare rows
     * left over from the old one-record-per-level workaround never block an
     * edit of the real one.
     *
     * @param  array<int,int|string>|null $levelIds levels being saved, if the caller sent any
     * @return array<string,array<int,string>>|null
     */
    private function checkModuleCodeUniqueness(
        string $code,
        array $data,
        ?int $excludeId,
        ?array $levelIds,
    ): ?array {
        $db = $this->models['modules']->db();

        $existing = $excludeId !== null
            ? $db->fetchOne('SELECT department, level FROM `modules` WHERE module_id = ?', [$excludeId])
            : null;

        $department = (int)($data['department'] ?? 0);
        if ($department <= 0) {
            $department = (int)($existing['department'] ?? 0);
        }
        // Unplaced module — nothing to scope against, so nothing to clash with.
        if ($department <= 0) {
            return null;
        }

        // Levels of the row being saved.
        $levels = array_values(array_unique(array_filter(
            array_map('intval', $levelIds ?? []),
            static fn (int $l) => $l > 0,
        )));
        if ($levels === [] && !empty($data['level'])) {
            $levels = [(int)$data['level']];
        }
        if ($levels === [] && $excludeId !== null) {
            foreach ($db->fetchAll('SELECT level_id FROM `module_levels` WHERE module_id = ?', [$excludeId]) as $r) {
                $levels[] = (int)$r['level_id'];
            }
            if ($levels === [] && !empty($existing['level'])) {
                $levels = [(int)$existing['level']];
            }
        }
        if ($levels === []) {
            return null;
        }

        // Same code, same department, anyone but us — and only rows that are
        // still on the catalogue. A hidden row is retired; it must not veto the
        // live record that replaces it, or the whole point of hiding the spare
        // duplicates (then giving the survivor all their levels) is defeated.
        $sql      = "SELECT module_id, level FROM `modules`
                     WHERE `module_code` = ? AND `department` = ?
                       AND (`status` IS NULL OR `status` <> 'archived')";
        $bindings = [$code, $department];
        if ($excludeId !== null) {
            $sql .= ' AND `module_id` <> ?';
            $bindings[] = $excludeId;
        }
        $rivals = $db->fetchAll($sql, $bindings);
        if ($rivals === []) {
            return null;
        }

        $clashes = [];
        foreach ($rivals as $rival) {
            $rivalLevels = array_map(
                static fn (array $r) => (int)$r['level_id'],
                $db->fetchAll('SELECT level_id FROM `module_levels` WHERE module_id = ?', [(int)$rival['module_id']]),
            );
            if ($rivalLevels === [] && !empty($rival['level'])) {
                $rivalLevels = [(int)$rival['level']];
            }
            foreach (array_intersect($levels, $rivalLevels) as $levelId) {
                $clashes[$levelId] = \App\Helpers\LevelHelper::name($levelId) ?: "level {$levelId}";
            }
        }

        if ($clashes === []) {
            return null;
        }

        return ['module_code' => [
            'Another module in this department already uses this code at '
            . implode(', ', $clashes)
            . '. Codes may repeat across levels, but not within one.',
        ]];
    }

    /**
     * Retire a catalogue row without touching a single mark.
     *
     * The registry ends up with spare `modules` rows — the old
     * one-record-per-level workaround, and the importer's whitespace twins
     * that migration 154 cleaned up once. Deleting them is destructive:
     * `module_marks` references `module_id`, so a delete either fails or
     * orphans results. Archiving takes the row off the catalogue list and out
     * of "modules still to take", while every mark recorded against it keeps
     * printing on the transcript at that module's own level — the transcript
     * query does not filter on `modules.status`, and the curriculum filter
     * keys on the module CODE, which the surviving twin shares.
     */
    public function archiveModule(Request $request, Response $response): never
    {
        $this->setModuleStatus($request, $response, 'archived');
    }

    /** Undo {@see self::archiveModule()} — puts the row back on the catalogue. */
    public function restoreModule(Request $request, Response $response): never
    {
        $this->setModuleStatus($request, $response, 'active');
    }

    private function setModuleStatus(Request $request, Response $response, string $status): never
    {
        $id     = (int)$request->param('id');
        $module = $this->models['modules']->find($id);
        if (!$module) {
            $this->error($response, 'Module not found.', 404);
        }

        $this->models['modules']->update($id, ['status' => $status]);

        $this->success(
            $response,
            ['module_id' => $id, 'status' => $status],
            $status === 'archived' ? 'Module hidden.' : 'Module restored.',
        );
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
                'dep_code'        => ['string'],
                'fac_id'          => ['required', 'numeric'],
                'dep_description' => ['string'],
            ],
            'faculties' => [
                'fac_name'     => ['required', 'min:3'],
                'fac_acronym'  => ['string'],
                'fac_code'     => ['string'],
                'fac_descript' => ['string'],
                // Optional at the API layer so bulk imports (FAC CODE / FAC
                // NAME / FAC ACRO only) succeed; manual UI creates still
                // require it via the form-level validator.
                'school_id'    => ['numeric'],
            ],
            'options' => [
                'name'          => ['required', 'min:3'],
                'code'          => ['string'],
                'acro'          => ['string'],
                'start_date'    => ['string'],
                'end_date'      => ['string'],
                // Optional at the API layer so bulk imports that pre-select
                // department via the import-context dialog still work even
                // if the row payload's `department_id` is filled in by us.
                'department_id' => ['numeric'],
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

<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Models\PgIntlFeeStructureModel;
use App\Models\FeeTypeModel;
use App\Services\SystemLogService;
use App\Helpers\ValidationHelper;

/**
 * Postgraduate Fees — International Students (Phase 5).
 *
 * Kept as its own controller with clearly namespaced methods (listPgIntlStructures,
 * createPgIntlStructure, ...) rather than overloading FeeController/FeeStructureModel's
 * findBestMatch() with cross-cutting conditionals, per the client's explicit instruction
 * to keep this fee type separate from the regular fee schedule.
 */
class PgIntlFeeStructureController extends BaseController
{
    private PgIntlFeeStructureModel $model;
    private FeeTypeModel            $feeTypeModel;

    private const PAYMENT_PLANS  = ['full_year', 'per_semester', 'per_installment'];
    private const SURCHARGE_TYPES = ['visa', 'insurance', 'other', 'none'];

    public function __construct()
    {
        $this->model        = new PgIntlFeeStructureModel();
        $this->feeTypeModel = new FeeTypeModel();
    }

    private ?array $_feeCodeCache = null;

    private function getActiveFeeCodes(): array
    {
        if ($this->_feeCodeCache === null) {
            $this->_feeCodeCache = array_column(
                array_filter($this->feeTypeModel->listAll(), fn ($t) => (int)$t['is_active'] === 1),
                'code'
            );
        }
        return $this->_feeCodeCache;
    }

    /**
     * GET /api/finance/pg-intl-structures
     */
    public function listPgIntlStructures(Request $request, Response $response): never
    {
        $filters = [
            'academic_year_id'   => (int)($request->query('academic_year_id') ?? 0) ?: null,
            'department_id'      => $request->query('department_id') !== null
                                        ? ((int)$request->query('department_id') ?: null) : null,
            'level_id'           => $request->query('level_id') !== null
                                        ? ((int)$request->query('level_id') ?: null) : null,
            'fee_type'           => $request->query('fee_type') ?? '',
            'nationality_region' => $request->query('nationality_region') ?? '',
            'surcharge_type'     => $request->query('surcharge_type') ?? '',
            'is_active'          => $request->query('is_active') !== null
                                        ? (int)$request->query('is_active') : null,
        ];
        $filters = array_filter($filters, fn ($v) => $v !== null && $v !== '');

        $this->success($response, $this->model->listWithJoins($filters), 'Postgraduate international fee structures retrieved.');
    }

    /**
     * POST /api/finance/pg-intl-structures
     */
    public function createPgIntlStructure(Request $request, Response $response): never
    {
        $data   = $request->body();
        $actor  = $request->param('_auth_user');
        $errors = ValidationHelper::validate($data, [
            'academic_year_id' => 'required|numeric',
            'fee_type'         => 'required|in:' . implode(',', $this->getActiveFeeCodes()),
            'label'            => 'required|string|max:120',
            'amount'           => 'required|numeric',
            'currency'         => 'nullable|string|max:10',
            'surcharge_type'   => 'nullable|in:' . implode(',', self::SURCHARGE_TYPES),
        ]);
        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        $paymentPlan = in_array($data['payment_plan'] ?? '', self::PAYMENT_PLANS, true)
            ? $data['payment_plan'] : 'full_year';

        $id = $this->model->create([
            'academic_year_id'   => (int)$data['academic_year_id'],
            'department_id'      => !empty($data['department_id']) ? (int)$data['department_id'] : null,
            'level_id'           => !empty($data['level_id']) ? (int)$data['level_id'] : null,
            'fee_type'           => $data['fee_type'],
            'label'              => $data['label'],
            'amount'             => (float)$data['amount'],
            'currency'           => !empty($data['currency']) ? strtoupper((string)$data['currency']) : 'USD',
            'semester'           => !empty($data['semester']) ? (int)$data['semester'] : null,
            'payment_plan'       => $paymentPlan,
            'installment_count'  => !empty($data['installment_count']) ? (int)$data['installment_count'] : null,
            'nationality_region' => !empty($data['nationality_region']) ? (string)$data['nationality_region'] : null,
            'surcharge_type'     => in_array($data['surcharge_type'] ?? '', self::SURCHARGE_TYPES, true)
                                        ? $data['surcharge_type'] : 'none',
            'is_active'          => 1,
            'created_by'         => isset($actor['id']) ? (int)$actor['id'] : null,
        ]);

        SystemLogService::log('CREATE', 'FINANCE', "Created postgraduate international fee structure '{$data['label']}' ({$data['fee_type']}) — amount {$data['amount']}.", (int)$id, 'postgraduate_international_fee_structure', ['fee_type' => $data['fee_type'], 'amount' => (float)$data['amount']], (array)$actor ?: null);
        $this->success($response, ['id' => (int)$id], 'Postgraduate international fee structure created.', 201);
    }

    /**
     * PUT /api/finance/pg-intl-structures/:id
     */
    public function updatePgIntlStructure(Request $request, Response $response): never
    {
        $id   = (int)$request->param('id');
        $data = $request->body();

        if (!$this->model->find($id)) {
            $this->error($response, 'Postgraduate international fee structure not found.', 404);
        }

        if (isset($data['surcharge_type']) && $data['surcharge_type'] !== '' && !in_array($data['surcharge_type'], self::SURCHARGE_TYPES, true)) {
            $this->error($response, 'Validation failed.', 422, ['surcharge_type' => ['The surcharge_type field must be one of: ' . implode(', ', self::SURCHARGE_TYPES) . '.']]);
        }

        $this->model->update($id, array_filter([
            'department_id'      => array_key_exists('department_id', $data) ? ((int)$data['department_id'] ?: null) : null,
            'level_id'           => array_key_exists('level_id', $data) ? ((int)$data['level_id'] ?: null) : null,
            'label'              => $data['label'] ?? null,
            'amount'             => isset($data['amount']) ? (float)$data['amount'] : null,
            'currency'           => isset($data['currency']) ? strtoupper((string)$data['currency']) : null,
            'semester'           => isset($data['semester']) ? (int)$data['semester'] : null,
            'payment_plan'       => isset($data['payment_plan']) && in_array($data['payment_plan'], self::PAYMENT_PLANS, true)
                                        ? $data['payment_plan'] : null,
            'installment_count'  => isset($data['installment_count']) ? ((int)$data['installment_count'] ?: null) : null,
            'nationality_region' => array_key_exists('nationality_region', $data) ? ($data['nationality_region'] ?: null) : null,
            'surcharge_type'     => $data['surcharge_type'] ?? null,
            'is_active'          => isset($data['is_active']) ? (int)$data['is_active'] : null,
        ], fn ($v) => $v !== null));

        $actor = $request->param('_auth_user');
        SystemLogService::log('UPDATE', 'FINANCE', "Updated postgraduate international fee structure ID {$id}.", $id, 'postgraduate_international_fee_structure', array_filter(['label' => $data['label'] ?? null, 'amount' => isset($data['amount']) ? (float)$data['amount'] : null], fn ($v) => $v !== null), (array)$actor ?: null);
        $this->success($response, null, 'Postgraduate international fee structure updated.');
    }

    /**
     * DELETE /api/finance/pg-intl-structures/:id
     */
    public function deletePgIntlStructure(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        if (!$this->model->find($id)) {
            $this->error($response, 'Postgraduate international fee structure not found.', 404);
        }
        $this->model->delete($id);

        $actor = $request->param('_auth_user');
        SystemLogService::log('DELETE', 'FINANCE', "Deleted postgraduate international fee structure ID {$id}.", $id, 'postgraduate_international_fee_structure', null, (array)$actor ?: null);
        $this->success($response, null, 'Postgraduate international fee structure deleted.');
    }
}

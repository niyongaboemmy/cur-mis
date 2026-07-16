<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Models\PaymentCalendarEventModel;
use App\Services\SystemLogService;
use App\Helpers\ValidationHelper;

class PaymentCalendarController extends BaseController
{
    private PaymentCalendarEventModel $model;

    private const EVENT_TYPES = [
        'registration_deadline', 'installment_due', 'penalty_start',
        'semester_start', 'semester_end',
    ];

    public function __construct()
    {
        $this->model = new PaymentCalendarEventModel();
    }

    /**
     * GET /api/finance/payment-calendar
     */
    public function listEvents(Request $request, Response $response): never
    {
        $filters = [
            'academic_year_id' => (int)($request->query('academic_year_id') ?? 0) ?: null,
            'event_type'       => $request->query('event_type') ?? '',
            'is_active'        => $request->query('is_active') !== null
                                    ? (int)$request->query('is_active') : null,
            'from_date'        => $request->query('from_date') ?? '',
            'to_date'          => $request->query('to_date') ?? '',
        ];
        $filters = array_filter($filters, fn ($v) => $v !== null && $v !== '');

        $this->success($response, $this->model->listWithFilters($filters), 'Payment calendar events retrieved.');
    }

    /**
     * GET /api/finance/my/payment-calendar
     * Read-only student-facing variant — only active events, no admin metadata leak.
     */
    public function listMyEvents(Request $request, Response $response): never
    {
        $filters = [
            'academic_year_id' => (int)($request->query('academic_year_id') ?? 0) ?: null,
            'is_active'        => 1,
        ];
        $filters = array_filter($filters, fn ($v) => $v !== null && $v !== '');

        $events = $this->model->listWithFilters($filters);
        $events = array_map(fn ($e) => [
            'id'                  => $e['id'],
            'academic_year_id'    => $e['academic_year_id'],
            'academic_year_label' => $e['academic_year_label'],
            'event_type'          => $e['event_type'],
            'label'               => $e['label'],
            'event_date'          => $e['event_date'],
            'fee_structure_id'    => $e['fee_structure_id'],
            'fee_structure_label' => $e['fee_structure_label'],
        ], $events);

        $this->success($response, $events, 'Payment calendar retrieved.');
    }

    /**
     * POST /api/finance/payment-calendar
     */
    public function createEvent(Request $request, Response $response): never
    {
        $data   = $request->body();
        $actor  = $request->param('_auth_user');
        $errors = ValidationHelper::validate($data, [
            'academic_year_id' => 'required|numeric',
            'event_type'       => 'required|in:' . implode(',', self::EVENT_TYPES),
            'label'            => 'required|string|max:150',
            'event_date'       => 'required|string',
        ]);
        if ($errors) $this->error($response, 'Validation failed.', 422, $errors);

        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$data['event_date'])
            || !checkdate((int)substr($data['event_date'], 5, 2), (int)substr($data['event_date'], 8, 2), (int)substr($data['event_date'], 0, 4))
        ) {
            $this->error($response, 'Validation failed.', 422, ['event_date' => 'Must be a valid date in YYYY-MM-DD format.']);
        }

        $id = $this->model->create([
            'academic_year_id' => (int)$data['academic_year_id'],
            'event_type'       => $data['event_type'],
            'label'            => $data['label'],
            'event_date'       => $data['event_date'],
            'fee_structure_id' => !empty($data['fee_structure_id']) ? (int)$data['fee_structure_id'] : null,
            'is_active'        => isset($data['is_active']) ? (int)(bool)$data['is_active'] : 1,
            'created_by'       => isset($actor['id']) ? (int)$actor['id'] : null,
        ]);

        SystemLogService::log('CREATE', 'FINANCE', "Created payment calendar event '{$data['label']}' ({$data['event_type']}) on {$data['event_date']}.", (int)$id, 'payment_calendar_event', ['event_type' => $data['event_type'], 'event_date' => $data['event_date']], (array)$actor ?: null);

        $this->success($response, $this->model->find((int)$id), 'Payment calendar event created.', 201);
    }

    /**
     * PUT /api/finance/payment-calendar/:id
     */
    public function updateEvent(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        if (!$this->model->find($id)) $this->error($response, 'Payment calendar event not found.', 404);

        $data   = $request->body();
        $actor  = $request->param('_auth_user');

        if (isset($data['event_type']) && !in_array($data['event_type'], self::EVENT_TYPES, true)) {
            $this->error($response, 'Validation failed.', 422, ['event_type' => 'Invalid event type.']);
        }

        $update = array_filter([
            'academic_year_id' => isset($data['academic_year_id']) ? (int)$data['academic_year_id'] : null,
            'event_type'       => $data['event_type'] ?? null,
            'label'            => $data['label'] ?? null,
            'event_date'       => $data['event_date'] ?? null,
            'fee_structure_id' => array_key_exists('fee_structure_id', $data)
                                    ? (!empty($data['fee_structure_id']) ? (int)$data['fee_structure_id'] : null)
                                    : null,
            'is_active'        => isset($data['is_active']) ? (int)(bool)$data['is_active'] : null,
        ], fn ($v) => $v !== null);

        if ($update) {
            $this->model->update($id, $update);
            SystemLogService::log('UPDATE', 'FINANCE', "Updated payment calendar event ID {$id}.", $id, 'payment_calendar_event', $update, (array)$actor ?: null);
        }

        $this->success($response, $this->model->find($id), 'Payment calendar event updated.');
    }

    /**
     * DELETE /api/finance/payment-calendar/:id
     */
    public function deleteEvent(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        if (!$this->model->find($id)) $this->error($response, 'Payment calendar event not found.', 404);

        $actor = $request->param('_auth_user');
        $this->model->delete($id);

        SystemLogService::log('DELETE', 'FINANCE', "Deleted payment calendar event ID {$id}.", $id, 'payment_calendar_event', null, (array)$actor ?: null);

        $this->success($response, null, 'Payment calendar event deleted.');
    }
}

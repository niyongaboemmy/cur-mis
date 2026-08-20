<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Models\PaymentCalendarDocumentModel;
use App\Services\SystemLogService;
use App\Helpers\ValidationHelper;
use App\Helpers\PaymentCalendarPdf;

class PaymentCalendarController extends BaseController
{
    private PaymentCalendarDocumentModel $model;

    private const EVENT_TYPES = [
        'registration_deadline', 'installment_due', 'penalty_start',
        'semester_start', 'semester_end',
    ];

    public function __construct()
    {
        $this->model = new PaymentCalendarDocumentModel();
    }

    private function withItems(array $document): array
    {
        $document['items'] = $this->model->getItems((int)$document['id']);
        return $document;
    }

    /**
     * GET /api/finance/payment-calendar
     */
    public function listDocuments(Request $request, Response $response): never
    {
        $filters = [
            'academic_year_id' => (int)($request->query('academic_year_id') ?? 0) ?: null,
            'faculty_id'       => (int)($request->query('faculty_id') ?? 0) ?: null,
            'is_active'        => $request->query('is_active') !== null
                                    ? (int)$request->query('is_active') : null,
        ];
        $filters = array_filter($filters, fn ($v) => $v !== null);

        $documents = array_map([$this, 'withItems'], $this->model->listWithFilters($filters));

        $this->success($response, $documents, 'Payment calendar documents retrieved.');
    }

    /**
     * GET /api/finance/payment-calendar/:id
     */
    public function showDocument(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        $document = $this->model->findWithMeta($id);
        if (!$document) $this->error($response, 'Payment calendar document not found.', 404);

        $this->success($response, $this->withItems($document), 'Payment calendar document retrieved.');
    }

    /**
     * GET /api/finance/my/payment-calendar
     * Read-only student-facing variant — only active documents.
     */
    public function listMyDocuments(Request $request, Response $response): never
    {
        $filters = [
            'academic_year_id' => (int)($request->query('academic_year_id') ?? 0) ?: null,
            'is_active'        => 1,
        ];
        $filters = array_filter($filters, fn ($v) => $v !== null);

        $documents = array_map([$this, 'withItems'], $this->model->listWithFilters($filters));

        $this->success($response, $documents, 'Payment calendar retrieved.');
    }

    /**
     * GET /api/finance/payment-calendar/:id/pdf
     */
    public function downloadPdf(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        $document = $this->model->findWithMeta($id);
        if (!$document) $this->error($response, 'Payment calendar document not found.', 404);

        $actor = $request->param('_auth_user');
        $items = $this->model->getItems($id);

        SystemLogService::log('EXPORT', 'FINANCE', "Exported payment calendar PDF for document {$id}.", $id, 'payment_calendar_document', null, (array)$actor ?: null);

        $facSlug = $document['faculty_name'] ? '-' . preg_replace('/[^A-Za-z0-9]+/', '-', $document['faculty_name']) : '';
        $filename = 'Payment-Calendar' . $facSlug . '-' . ($document['academic_year_label'] ?? date('Y')) . '.pdf';
        $filename = str_replace('/', '-', $filename);

        PaymentCalendarPdf::streamPdf($document, $items, [], $filename);
    }

    /**
     * POST /api/finance/payment-calendar
     */
    public function createDocument(Request $request, Response $response): never
    {
        $data   = $request->body();
        $actor  = $request->param('_auth_user');
        $errors = ValidationHelper::validate($data, [
            'academic_year_id' => 'required|numeric',
        ]);
        if ($errors) $this->error($response, 'Validation failed.', 422, $errors);

        $id = $this->model->create([
            'academic_year_id'     => (int)$data['academic_year_id'],
            'faculty_id'           => !empty($data['faculty_id']) ? (int)$data['faculty_id'] : null,
            'title'                => trim((string)($data['title'] ?? '')) ?: 'PAYMENT CALENDAR',
            'intake_label'         => $data['intake_label'] ?? null,
            'department_label'     => $data['department_label'] ?? null,
            'level_label'          => $data['level_label'] ?? null,
            'notes'                => $data['notes'] ?? null,
            'bank_account_note'    => $data['bank_account_note'] ?? null,
            'cursu_account_note'   => $data['cursu_account_note'] ?? null,
            'payment_method_note'  => $data['payment_method_note'] ?? null,
            'fine_notice'          => $data['fine_notice'] ?? null,
            'prepared_by_name'     => $data['prepared_by_name'] ?? null,
            'prepared_by_title'    => $data['prepared_by_title'] ?? null,
            'verified_by_name'     => $data['verified_by_name'] ?? null,
            'verified_by_title'    => $data['verified_by_title'] ?? null,
            'approved_by_name'     => $data['approved_by_name'] ?? null,
            'approved_by_title'    => $data['approved_by_title'] ?? null,
            'is_active'            => isset($data['is_active']) ? (int)(bool)$data['is_active'] : 1,
            'created_by'           => isset($actor['id']) ? (int)$actor['id'] : null,
        ]);

        if (!empty($data['items']) && is_array($data['items'])) {
            foreach ($data['items'] as $i => $item) {
                if (empty($item['item_label']) || empty($item['deadline_date'])) continue;
                $this->model->createItem((int)$id, [
                    'group_label'   => $item['group_label'] ?? null,
                    'item_label'    => $item['item_label'],
                    'event_type'    => in_array($item['event_type'] ?? '', self::EVENT_TYPES, true) ? $item['event_type'] : 'installment_due',
                    'start_date'    => $item['start_date'] ?? null,
                    'deadline_date' => $item['deadline_date'],
                    'amount'        => isset($item['amount']) && $item['amount'] !== '' ? (float)$item['amount'] : null,
                    'is_active'     => isset($item['is_active']) ? (int)(bool)$item['is_active'] : 1,
                    'sort_order'    => $i,
                ]);
            }
        }

        SystemLogService::log('CREATE', 'FINANCE', "Created payment calendar document '{$data['title']}'.", (int)$id, 'payment_calendar_document', null, (array)$actor ?: null);

        $this->success($response, $this->withItems($this->model->findWithMeta((int)$id)), 'Payment calendar document created.', 201);
    }

    /**
     * POST /api/finance/payment-calendar/:id
     */
    public function updateDocument(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        if (!$this->model->find($id)) $this->error($response, 'Payment calendar document not found.', 404);

        $data  = $request->body();
        $actor = $request->param('_auth_user');

        $fields = [
            'academic_year_id', 'faculty_id', 'title', 'intake_label', 'department_label', 'level_label',
            'notes', 'bank_account_note', 'cursu_account_note', 'payment_method_note', 'fine_notice',
            'prepared_by_name', 'prepared_by_title', 'verified_by_name', 'verified_by_title',
            'approved_by_name', 'approved_by_title',
        ];
        $update = [];
        foreach ($fields as $f) {
            if (array_key_exists($f, $data)) $update[$f] = $data[$f];
        }
        if (isset($data['academic_year_id'])) $update['academic_year_id'] = (int)$data['academic_year_id'];
        if (array_key_exists('faculty_id', $data)) $update['faculty_id'] = !empty($data['faculty_id']) ? (int)$data['faculty_id'] : null;
        if (isset($data['is_active'])) $update['is_active'] = (int)(bool)$data['is_active'];

        if ($update) {
            $this->model->update($id, $update);
            SystemLogService::log('UPDATE', 'FINANCE', "Updated payment calendar document ID {$id}.", $id, 'payment_calendar_document', null, (array)$actor ?: null);
        }

        $this->success($response, $this->withItems($this->model->findWithMeta($id)), 'Payment calendar document updated.');
    }

    /**
     * DELETE /api/finance/payment-calendar/:id
     */
    public function deleteDocument(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        if (!$this->model->find($id)) $this->error($response, 'Payment calendar document not found.', 404);

        $actor = $request->param('_auth_user');
        $this->model->delete($id);

        SystemLogService::log('DELETE', 'FINANCE', "Deleted payment calendar document ID {$id}.", $id, 'payment_calendar_document', null, (array)$actor ?: null);

        $this->success($response, null, 'Payment calendar document deleted.');
    }

    /**
     * POST /api/finance/payment-calendar/:id/items
     */
    public function createItem(Request $request, Response $response): never
    {
        $documentId = (int)$request->param('id');
        if (!$this->model->find($documentId)) $this->error($response, 'Payment calendar document not found.', 404);

        $data   = $request->body();
        $actor  = $request->param('_auth_user');
        $errors = ValidationHelper::validate($data, [
            'item_label'    => 'required|string|max:250',
            'deadline_date' => 'required|string',
        ]);
        if ($errors) $this->error($response, 'Validation failed.', 422, $errors);

        if (isset($data['event_type']) && !in_array($data['event_type'], self::EVENT_TYPES, true)) {
            $this->error($response, 'Validation failed.', 422, ['event_type' => 'Invalid event type.']);
        }

        $itemId = $this->model->createItem($documentId, [
            'group_label'   => $data['group_label'] ?? null,
            'item_label'    => $data['item_label'],
            'event_type'    => $data['event_type'] ?? 'installment_due',
            'start_date'    => $data['start_date'] ?? null,
            'deadline_date' => $data['deadline_date'],
            'amount'        => isset($data['amount']) && $data['amount'] !== '' ? (float)$data['amount'] : null,
            'is_active'     => isset($data['is_active']) ? (int)(bool)$data['is_active'] : 1,
            'sort_order'    => isset($data['sort_order']) ? (int)$data['sort_order'] : 0,
        ]);

        SystemLogService::log('CREATE', 'FINANCE', "Added payment calendar item to document {$documentId}: {$data['item_label']}.", (int)$itemId, 'payment_calendar_item', null, (array)$actor ?: null);

        $this->success($response, $this->withItems($this->model->findWithMeta($documentId)), 'Payment calendar item created.', 201);
    }

    /**
     * POST /api/finance/payment-calendar/items/:itemId
     */
    public function updateItem(Request $request, Response $response): never
    {
        $itemId = (int)$request->param('itemId');
        $data   = $request->body();
        $actor  = $request->param('_auth_user');

        if (isset($data['event_type']) && !in_array($data['event_type'], self::EVENT_TYPES, true)) {
            $this->error($response, 'Validation failed.', 422, ['event_type' => 'Invalid event type.']);
        }

        $update = [];
        foreach (['group_label', 'item_label', 'event_type', 'start_date', 'deadline_date'] as $f) {
            if (array_key_exists($f, $data)) $update[$f] = $data[$f];
        }
        if (array_key_exists('amount', $data)) {
            $update['amount'] = $data['amount'] !== '' && $data['amount'] !== null ? (float)$data['amount'] : null;
        }
        if (isset($data['is_active'])) $update['is_active'] = (int)(bool)$data['is_active'];
        if (isset($data['sort_order'])) $update['sort_order'] = (int)$data['sort_order'];

        $this->model->updateItem($itemId, $update);

        SystemLogService::log('UPDATE', 'FINANCE', "Updated payment calendar item ID {$itemId}.", $itemId, 'payment_calendar_item', null, (array)$actor ?: null);

        $this->success($response, null, 'Payment calendar item updated.');
    }

    /**
     * DELETE /api/finance/payment-calendar/items/:itemId
     */
    public function deleteItem(Request $request, Response $response): never
    {
        $itemId = (int)$request->param('itemId');
        $actor  = $request->param('_auth_user');

        $this->model->deleteItem($itemId);

        SystemLogService::log('DELETE', 'FINANCE', "Deleted payment calendar item ID {$itemId}.", $itemId, 'payment_calendar_item', null, (array)$actor ?: null);

        $this->success($response, null, 'Payment calendar item deleted.');
    }
}

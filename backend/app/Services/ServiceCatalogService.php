<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\ServiceCatalogModel;
use App\Models\ServiceCatalogStageModel;

class ServiceCatalogService
{
    private ServiceCatalogModel      $catalogModel;
    private ServiceCatalogStageModel $stageModel;

    public function __construct()
    {
        $this->catalogModel = new ServiceCatalogModel();
        $this->stageModel   = new ServiceCatalogStageModel();
    }

    public function listPublic(): array
    {
        $services = $this->catalogModel->listActive();

        return array_map(static function (array $s): array {
            return [
                'id'                  => (int)$s['id'],
                'code'                => $s['code'],
                'name'                => $s['name'],
                'slug'                => $s['slug'],
                'category'            => $s['category'],
                'short_description'   => $s['short_description'],
                'fee_amount'          => (float)$s['fee_amount'],
                'fee_currency'        => $s['fee_currency'],
                'requires_payment'    => (bool)$s['requires_payment'],
                'processing_sla_days' => $s['processing_sla_days'] !== null ? (int)$s['processing_sla_days'] : null,
            ];
        }, $services);
    }

    public function getPublicDetail(string $slug): ?array
    {
        $service = $this->catalogModel->findActiveBySlug($slug);
        if (!$service) {
            return null;
        }

        $stages = $this->stageModel->findByServiceOrdered((int)$service['id']);

        return [
            'id'                    => (int)$service['id'],
            'code'                  => $service['code'],
            'name'                  => $service['name'],
            'slug'                  => $service['slug'],
            'category'              => $service['category'],
            'short_description'     => $service['short_description'],
            'full_description'      => $service['full_description'],
            'requirements'          => json_decode($service['requirements'] ?? '[]', true) ?: [],
            'required_attachments'  => json_decode($service['required_attachments'] ?? '[]', true) ?: [],
            'fee_amount'            => (float)$service['fee_amount'],
            'fee_currency'          => $service['fee_currency'],
            'requires_payment'      => (bool)$service['requires_payment'],
            'processing_sla_days'   => $service['processing_sla_days'] !== null ? (int)$service['processing_sla_days'] : null,
            'stage_count'           => count($stages),
            // Label-only — never expose required_permission_slug publicly.
            'stages'                => array_map(static fn(array $s): array => [
                'stage_order' => (int)$s['stage_order'],
                'stage_label' => $s['stage_label'],
            ], $stages),
        ];
    }

    public function listForAdmin(): array
    {
        $services = $this->catalogModel->listAllForAdmin();

        foreach ($services as &$s) {
            $s['requirements']         = json_decode($s['requirements'] ?? '[]', true) ?: [];
            $s['required_attachments'] = json_decode($s['required_attachments'] ?? '[]', true) ?: [];
            $s['stages']               = $this->stageModel->findByServiceOrdered((int)$s['id']);
        }

        return $services;
    }

    public function getForAdmin(int $id): ?array
    {
        $service = $this->catalogModel->find($id);
        if (!$service) {
            return null;
        }

        $service['requirements']         = json_decode($service['requirements'] ?? '[]', true) ?: [];
        $service['required_attachments'] = json_decode($service['required_attachments'] ?? '[]', true) ?: [];
        $service['stages']               = $this->stageModel->findByServiceOrdered($id);

        return $service;
    }

    /**
     * @param array $data must include 'stages' => [{stage_order, stage_key, stage_label, required_permission_slug, is_final_approval}, ...]
     */
    public function create(array $data, int $actorId): int
    {
        $stages = $data['stages'] ?? [];
        $this->assertValidStages($stages);
        $this->assertUniqueCodeAndSlug($data['code'] ?? null, $data['slug'] ?? null);

        $id = (int)$this->catalogModel->create([
            'code'                    => $data['code'],
            'name'                    => $data['name'],
            'slug'                    => $data['slug'],
            'category'                => $data['category'] ?? null,
            'short_description'       => $data['short_description'] ?? null,
            'full_description'        => $data['full_description'] ?? null,
            'requirements'            => json_encode($data['requirements'] ?? []),
            'required_attachments'    => json_encode($data['required_attachments'] ?? []),
            'document_template_type'  => $data['document_template_type'] ?? 'generic_service_letter',
            'document_type_id'        => !empty($data['document_type_id']) ? (int)$data['document_type_id'] : null,
            'fee_amount'              => $data['fee_amount'] ?? 0,
            'fee_currency'            => $data['fee_currency'] ?? 'RWF',
            'requires_payment'        => !empty($data['requires_payment']) ? 1 : 0,
            'payment_stage'           => $data['payment_stage'] ?? 'after_final_approval',
            'processing_sla_days'     => $data['processing_sla_days'] ?? null,
            'is_active'               => array_key_exists('is_active', $data) ? (!empty($data['is_active']) ? 1 : 0) : 1,
            'created_by'              => $actorId,
            'updated_by'              => $actorId,
        ]);

        $this->replaceStages($id, $stages);

        return $id;
    }

    public function update(int $id, array $data, int $actorId): void
    {
        $this->assertUniqueCodeAndSlug(
            array_key_exists('code', $data) ? $data['code'] : null,
            array_key_exists('slug', $data) ? $data['slug'] : null,
            $id
        );

        $update = ['updated_by' => $actorId];

        foreach ([
            'code', 'name', 'slug', 'category', 'short_description', 'full_description',
            'document_template_type', 'fee_amount', 'fee_currency', 'payment_stage', 'processing_sla_days',
        ] as $field) {
            if (array_key_exists($field, $data)) {
                $update[$field] = $data[$field];
            }
        }
        if (array_key_exists('document_type_id', $data)) {
            $update['document_type_id'] = !empty($data['document_type_id']) ? (int)$data['document_type_id'] : null;
        }
        if (array_key_exists('requirements', $data)) {
            $update['requirements'] = json_encode($data['requirements']);
        }
        if (array_key_exists('required_attachments', $data)) {
            $update['required_attachments'] = json_encode($data['required_attachments']);
        }
        if (array_key_exists('requires_payment', $data)) {
            $update['requires_payment'] = !empty($data['requires_payment']) ? 1 : 0;
        }
        if (array_key_exists('is_active', $data)) {
            $update['is_active'] = !empty($data['is_active']) ? 1 : 0;
        }

        $this->catalogModel->update($id, $update);

        if (array_key_exists('stages', $data)) {
            $this->assertValidStages($data['stages']);
            $this->replaceStages($id, $data['stages']);
        }
    }

    public function deactivate(int $id, int $actorId): void
    {
        $this->catalogModel->update($id, ['is_active' => 0, 'updated_by' => $actorId]);
    }

    private function assertValidStages(array $stages): void
    {
        if (empty($stages)) {
            throw new \RuntimeException('At least one approval stage is required.');
        }

        $orders = [];
        $sawFinal = false;
        foreach ($stages as $stage) {
            if (empty($stage['stage_key']) || empty($stage['stage_label']) || empty($stage['required_permission_slug'])) {
                throw new \RuntimeException('Each stage requires a stage_key, stage_label, and required_permission_slug.');
            }
            $orders[] = (int)($stage['stage_order'] ?? 0);
            if (!empty($stage['is_final_approval'])) {
                $sawFinal = true;
            }
        }

        if (!$sawFinal) {
            throw new \RuntimeException('Exactly one stage must be marked as the final approval stage.');
        }

        if (count(array_unique($orders)) !== count($orders)) {
            throw new \RuntimeException('Stage orders must be unique per service.');
        }
    }

    private function replaceStages(int $serviceId, array $stages): void
    {
        $this->stageModel->deleteByService($serviceId);

        foreach ($stages as $stage) {
            $this->stageModel->create([
                'service_id'               => $serviceId,
                'stage_order'              => (int)($stage['stage_order']),
                'stage_key'                => $stage['stage_key'],
                'stage_label'              => $stage['stage_label'],
                'required_permission_slug' => $stage['required_permission_slug'],
                'stage_type'               => $stage['stage_type'] ?? 'approval',
                'is_final_approval'        => !empty($stage['is_final_approval']) ? 1 : 0,
                'sla_hours'                => $stage['sla_hours'] ?? null,
            ]);
        }
    }

    /**
     * `service_catalog.code` and `.slug` are both UNIQUE. Check them up front
     * so a clash comes back as a readable validation error instead of a 500
     * from the duplicate-key PDOException.
     */
    private function assertUniqueCodeAndSlug(?string $code, ?string $slug, ?int $ignoreId = null): void
    {
        foreach (['code' => $code, 'slug' => $slug] as $field => $value) {
            $value = trim((string) $value);
            if ($value === '') continue;

            if ($this->catalogModel->findConflict($field, $value, $ignoreId)) {
                throw new \RuntimeException("A service with this {$field} already exists.");
            }
        }
    }
}

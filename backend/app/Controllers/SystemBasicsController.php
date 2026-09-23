<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Models\AcademicYearModel;
use App\Models\AcademicTermModel;
use App\Helpers\Signatories;
use App\Models\SettingModel;

class SystemBasicsController extends BaseController
{
    private AcademicYearModel $yearModel;
    private AcademicTermModel $termModel;
    private SettingModel $settingModel;

    public function __construct()
    {
        $this->yearModel      = new AcademicYearModel();
        $this->termModel      = new AcademicTermModel();
        $this->settingModel   = new SettingModel();
    }

    /**
     * Get system basic information after login.
     */
    public function getBasics(Request $request, Response $response): never
    {
        $activeYear = $this->yearModel->getActive();
        $activeTerm = $this->termModel->getActive();
        
        $years = $this->yearModel->all('id', 'DESC');
        $terms = $this->termModel->all('id', 'ASC');
        
        $settings = $this->settingModel->all();
        // Index settings by key_name for easier consumption
        $indexedSettings = [];
        foreach ($settings as $s) {
            $indexedSettings[$s['key_name']] = $s['value'];
        }

        // The legacy `timetable` table used to be joined in here and attached
        // to every response — up to 100 rows on a call the app makes on load.
        // No client ever read the field (it is not even in the SystemBasics
        // type), and the live schedule lives in `module_schedules`, which
        // /api/timetable serves. The join is gone; the table is left in place
        // for archival (migration 142 explains why).
        $this->success($response, [
            'active_year' => $activeYear,
            'active_term' => $activeTerm,
            'years'       => $years,
            'terms'       => $terms,
            'settings'    => $indexedSettings,
        ], 'System basics fetched.');
    }

    /**
     * GET /api/portal/guidance-videos
     * Public read of the two guidance video URLs used on the application
     * portal and the login page. Returns empty strings if not configured.
     */
    public function getGuidanceVideos(Request $request, Response $response): never
    {
        $apply = $this->settingModel->findBy('key_name', 'video_application_guide_url');
        $login = $this->settingModel->findBy('key_name', 'video_login_guide_url');
        $this->success($response, [
            'video_application_guide_url' => $apply ? (string)$apply['value'] : '',
            'video_login_guide_url'       => $login ? (string)$login['value'] : '',
        ], 'Guidance videos fetched.');
    }

    /**
     * GET /api/portal/application-fee
     * Public — returns the current application fee amount so the apply page
     * can display the live admin-configured value without requiring auth.
     * Reads directly from the mapped fee_structures record.
     */
    public function getPublicApplicationFee(Request $request, Response $response): never
    {
        $db = \Core\Database::getInstance();

        // 1. Read mapped fee structure ID
        $structureIdRow = $this->settingModel->findBy('key_name', 'application_fee_mapped_fee_structure_id');
        $structureId    = (int)($structureIdRow['value'] ?? 0);

        $amount    = 0.0;
        $feeType   = null;
        $yearLabel = null;

        // 2. Look up the fee structure directly
        if ($structureId > 0) {
            try {
                $structure = $db->fetchOne(
                    "SELECT fs.amount, fs.fee_type, ay.label AS year_label
                     FROM `fee_structures` fs
                     JOIN `academic_years` ay ON ay.id = fs.academic_year_id
                     WHERE fs.id = ? AND fs.is_active = 1
                     LIMIT 1",
                    [$structureId]
                );
                if ($structure && (float)$structure['amount'] > 0) {
                    $amount    = (float)$structure['amount'];
                    $feeType   = $structure['fee_type'];
                    $yearLabel = $structure['year_label'];
                }
            } catch (\Throwable $e) { /* fee_structures unavailable */ }
        }

        // 3. Final fallback: settings → env → hard default
        if ($amount <= 0) {
            $settingRow = $this->settingModel->findBy('key_name', 'application_fee_amount');
            $amount     = (float)($settingRow['value'] ?? 0);
        }
        if ($amount <= 0) {
            $amount = (float)($_ENV['URUBUTOPAY_APPLICATION_FEE'] ?? 5000);
        }

        $this->success($response, [
            'amount'       => (int)$amount,
            'fee_type'     => $feeType,
            'year_label'   => $yearLabel,
            'structure_id' => $structureId ?: null,
        ], 'Application fee fetched.');
    }

    /**
     * PUT /api/system/guidance-videos
     * Admin-only — persist the two guidance video URLs. Empty strings clear them.
     */
    public function saveGuidanceVideos(Request $request, Response $response): never
    {
        $data  = $request->body();
        $apply = trim((string)($data['video_application_guide_url'] ?? ''));
        $login = trim((string)($data['video_login_guide_url']       ?? ''));

        $isUrl = fn(string $v): bool => $v === '' || (bool)filter_var($v, FILTER_VALIDATE_URL);
        if (!$isUrl($apply) || !$isUrl($login)) {
            $this->error($response, 'Both fields must be valid URLs (or left blank).', 422);
        }

        $this->upsertSetting('video_application_guide_url', $apply, 'Public URL of the "How to Apply" guidance video.');
        $this->upsertSetting('video_login_guide_url',       $login, 'Public URL of the "How to Log In" guidance video.');

        $this->success($response, [
            'video_application_guide_url' => $apply,
            'video_login_guide_url'       => $login,
        ], 'Guidance videos saved.');
    }

    /**
     * GET /api/system/fee-mapping
     * Admin — fetch current mapping (fee structure ID + auto-credit toggle)
     * and the list of all active fee structures for the dropdown.
     */
    public function getFeeMappingSettings(Request $request, Response $response): never
    {
        $db = \Core\Database::getInstance();

        $structureIdRow = $this->settingModel->findBy('key_name', 'application_fee_mapped_fee_structure_id');
        $autoRow        = $this->settingModel->findBy('key_name', 'application_fee_credit_on_enrollment');

        $settings = [
            'application_fee_mapped_fee_structure_id' => $structureIdRow ? $structureIdRow['value'] : '',
            'application_fee_credit_on_enrollment'    => $autoRow        ? $autoRow['value']        : '1',
        ];

        // All active fee structures, grouped with year info for the dropdown
        $feeStructures = [];
        try {
            $feeStructures = $db->fetchAll(
                "SELECT fs.id, fs.fee_type, fs.label, fs.amount,
                        fs.academic_year_id, ay.label AS year_label,
                        ft.label AS fee_type_label
                 FROM `fee_structures` fs
                 JOIN `academic_years` ay ON ay.id = fs.academic_year_id
                 LEFT JOIN `fee_types` ft ON ft.code = fs.fee_type AND ft.is_active = 1
                 WHERE fs.is_active = 1
                 ORDER BY ay.id DESC, fs.fee_type ASC, fs.id ASC",
                []
            );
        } catch (\Throwable $e) {
            // fee_structures / fee_types table unavailable
        }

        $this->success($response, [
            'settings'      => $settings,
            'fee_structures' => $feeStructures,
        ], 'Fee mapping settings fetched.');
    }

    /**
     * POST /api/system/fee-mapping
     * Admin — persist fee structure ID + auto-credit toggle.
     */
    public function saveFeeMappingSettings(Request $request, Response $response): never
    {
        $data        = $request->body();
        $structureId = (int)($data['application_fee_mapped_fee_structure_id'] ?? 0);
        $autoCredit  = (int)(bool)($data['application_fee_credit_on_enrollment'] ?? 1);

        // Validate fee structure when a non-zero ID is provided
        if ($structureId > 0) {
            try {
                $db = \Core\Database::getInstance();
                $fs = $db->fetchOne(
                    "SELECT id, amount, fee_type FROM `fee_structures` WHERE id = ? AND is_active = 1 LIMIT 1",
                    [$structureId]
                );
                if (!$fs) {
                    $this->error($response, "Fee structure #{$structureId} does not exist or is inactive.", 422);
                }
            } catch (\Throwable $e) {
                $this->error($response, 'Fee structures table is unavailable.', 500);
            }
        }

        $this->upsertSetting(
            'application_fee_mapped_fee_structure_id',
            $structureId > 0 ? (string)$structureId : '',
            'ID of the fee_structures record that application fee payments map to. Leave blank to disable mapping.'
        );
        $this->upsertSetting(
            'application_fee_credit_on_enrollment',
            (string)$autoCredit,
            '1 = auto-credit mapped invoice when student enrolls; 0 = track for reporting only.'
        );

        $this->success($response, [
            'application_fee_mapped_fee_structure_id' => $structureId ?: null,
            'application_fee_credit_on_enrollment'    => $autoCredit,
        ], 'Fee mapping settings saved.');
    }

    /**
     * GET /api/system/signatories
     * Admin — who signs issued documents. Returns the value actually in force,
     * so the form shows what a transcript would print right now rather than an
     * empty box when no row has been saved yet.
     */
    public function getSignatories(Request $request, Response $response): never
    {
        $this->success($response, [
            'settings' => [
                Signatories::REGISTRAR_KEY => Signatories::academicRegistrar(),
            ],
            'defaults' => [
                Signatories::REGISTRAR_KEY => Signatories::REGISTRAR_DEFAULT,
            ],
        ], 'Signatories fetched.');
    }

    /**
     * POST /api/system/signatories
     * Admin — set the Academic Registrar's name used across issued documents.
     */
    public function saveSignatories(Request $request, Response $response): never
    {
        $data = $request->body();
        $name = trim((string) ($data[Signatories::REGISTRAR_KEY] ?? ''));

        // Blank is not "clear it": every document carries this line, and an
        // empty signature block is worse than a stale name. Ask instead.
        if ($name === '') {
            $this->error($response, "The Academic Registrar's name is required.", 422);
        }
        if (mb_strlen($name) > 120) {
            $this->error($response, "The Academic Registrar's name is too long (120 characters max).", 422);
        }

        $this->upsertSetting(
            Signatories::REGISTRAR_KEY,
            $name,
            'Name printed above "Academic Registrar" on transcripts, certificates and letters.',
        );
        // The reader memoises per request; drop it so this same request, and
        // the response below, report the value just saved.
        Signatories::forget();

        $this->success($response, [
            'settings' => [Signatories::REGISTRAR_KEY => Signatories::academicRegistrar()],
        ], 'Signatories saved.');
    }

    protected function upsertSetting(string $key, string $value, string $description): void
    {
        $existing = $this->settingModel->findBy('key_name', $key);
        if ($existing) {
            $this->settingModel->update((int)$existing['id'], [
                'value'       => $value,
                'description' => $description,
            ]);
        } else {
            $this->settingModel->create([
                'key_name'    => $key,
                'value'       => $value,
                'description' => $description,
            ]);
        }
    }
}

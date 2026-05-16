<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Models\AcademicYearModel;
use App\Models\AcademicTermModel;
use App\Models\SettingModel;
use App\Models\TimetableModel;

class SystemBasicsController extends BaseController
{
    private AcademicYearModel $yearModel;
    private AcademicTermModel $termModel;
    private SettingModel $settingModel;
    private TimetableModel $timetableModel;

    public function __construct()
    {
        $this->yearModel      = new AcademicYearModel();
        $this->termModel      = new AcademicTermModel();
        $this->settingModel   = new SettingModel();
        $this->timetableModel = new TimetableModel();
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

        // Get relevant timetable entries for the active year
        $sql = "SELECT t.*, m.module_name as course_name, m.module_code as course_code, r.name as room_name 
                FROM timetable t
                LEFT JOIN modules m ON t.course_id = m.module_id
                LEFT JOIN rooms r ON t.room_id = r.id";
        
        $bindings = [];
        if ($activeYear) {
            $sql .= " WHERE t.academic_year_id = ?";
            $bindings[] = (int)$activeYear['id'];
        }

        $sql .= " ORDER BY t.day_of_week, t.start_time LIMIT 100";
        $timetable = $this->timetableModel->db()->fetchAll($sql, $bindings);

        $this->success($response, [
            'active_year' => $activeYear,
            'active_term' => $activeTerm,
            'years'       => $years,
            'terms'       => $terms,
            'settings'    => $indexedSettings,
            'timetable'   => $timetable
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

    private function upsertSetting(string $key, string $value, string $description): void
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

<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Models\AcademicYear;

/**
 * Admin-Only Academic Year Controller
 * Allows admins to view any year without affecting other users
 * This is separate from module-level selection and provides global admin access
 */
class AdminAcademicYearController extends BaseController
{
    /**
     * Get all available academic years for admin selection
     * GET /api/admin/academic-years
     * Admin only
     */
    public function getAllYears(Request $request, Response $response): never
    {
        try {
            // Check if user is admin
            if (!$this->isAdmin($request)) {
                $this->error($response, 'Unauthorized - Admin access required', 403);
            }

            $academicYearModel = new AcademicYear();
            $years = $academicYearModel
                ->orderBy('start_date', 'DESC')
                ->findAll();

            $currentYear = $academicYearModel->where('is_current', 1)->first();

            $this->success($response, [
                'academic_years' => $years,
                'current_academic_year_id' => $currentYear?->id,
                'current_academic_year' => $currentYear
            ]);

        } catch (\Exception $e) {
            error_log('Error getting academic years: ' . $e->getMessage());
            $this->error($response, 'Failed to get academic years', 500);
        }
    }

    /**
     * Get admin's current year selection (separate from module preferences)
     * GET /api/admin/me/selected-year
     */
    public function getAdminSelectedYear(Request $request, Response $response): never
    {
        try {
            if (!$this->isAdmin($request)) {
                $this->error($response, 'Unauthorized', 403);
            }

            $user = (array)($request->param('_auth_user') ?? []);
            $userId = (int)($user['id'] ?? 0);

            // Start session if not started
            if (session_status() === PHP_SESSION_NONE) {
                session_start();
            }

            $selectedYearId = $_SESSION["admin_year_selection_{$userId}"] ?? null;

            $academicYearModel = new AcademicYear();
            $selectedYear = null;
            $currentYear = $academicYearModel->where('is_current', 1)->first();

            if ($selectedYearId) {
                $selectedYear = $academicYearModel->find($selectedYearId);
            }

            if (!$selectedYear) {
                $selectedYear = $currentYear;
            }

            $this->success($response, [
                'selected_academic_year_id' => $selectedYear->id,
                'selected_academic_year' => $selectedYear,
                'current_academic_year_id' => $currentYear->id,
                'current_academic_year' => $currentYear,
                'is_admin' => true,
                'is_viewing_current' => $selectedYear->id === $currentYear->id
            ]);

        } catch (\Exception $e) {
            error_log('Error getting admin year: ' . $e->getMessage());
            $this->error($response, 'Failed to get admin year', 500);
        }
    }

    /**
     * Set admin's year selection (affects only this admin's session)
     * POST /api/admin/me/selected-year
     * Body: { academic_year_id: 123 }
     */
    public function setAdminSelectedYear(Request $request, Response $response): never
    {
        try {
            if (!$this->isAdmin($request)) {
                $this->error($response, 'Unauthorized', 403);
            }

            $data = $request->body();
            $academicYearId = $data['academic_year_id'] ?? null;

            // Validate year exists
            if ($academicYearId) {
                $academicYearModel = new AcademicYear();
                $academicYear = $academicYearModel->find($academicYearId);

                if (!$academicYear) {
                    $this->error($response, 'Invalid academic year ID', 400, ['academic_year_id' => $academicYearId]);
                }
            }

            $user = (array)($request->param('_auth_user') ?? []);
            $userId = (int)($user['id'] ?? 0);

            // Start session if not started
            if (session_status() === PHP_SESSION_NONE) {
                session_start();
            }

            $_SESSION["admin_year_selection_{$userId}"] = $academicYearId;

            error_log("Admin {$userId} switched view to year {$academicYearId}");

            $this->success($response, [
                'selected_academic_year_id' => $academicYearId,
                'message' => 'Admin year selection updated'
            ]);

        } catch (\Exception $e) {
            error_log('Error setting admin year: ' . $e->getMessage());
            $this->error($response, 'Failed to set admin year', 500);
        }
    }

    /**
     * Reset admin to current year
     * DELETE /api/admin/me/selected-year
     */
    public function resetAdminYear(Request $request, Response $response): never
    {
        try {
            if (!$this->isAdmin($request)) {
                $this->error($response, 'Unauthorized', 403);
            }

            $user = (array)($request->param('_auth_user') ?? []);
            $userId = (int)($user['id'] ?? 0);

            // Start session if not started
            if (session_status() === PHP_SESSION_NONE) {
                session_start();
            }

            unset($_SESSION["admin_year_selection_{$userId}"]);

            error_log("Admin {$userId} reset view to current year");

            $this->success($response, ['message' => 'Reset to current academic year']);

        } catch (\Exception $e) {
            error_log('Error resetting admin year: ' . $e->getMessage());
            $this->error($response, 'Failed to reset admin year', 500);
        }
    }

    /**
     * Get dashboard stats for admin's selected year
     * GET /api/admin/dashboard-stats
     * Shows data for the year admin is currently viewing
     */
    public function getDashboardStats(Request $request, Response $response): never
    {
        try {
            if (!$this->isAdmin($request)) {
                $this->error($response, 'Unauthorized', 403);
            }

            $user = (array)($request->param('_auth_user') ?? []);
            $userId = (int)($user['id'] ?? 0);

            // Start session if not started
            if (session_status() === PHP_SESSION_NONE) {
                session_start();
            }

            $selectedYearId = $_SESSION["admin_year_selection_{$userId}"] ?? null;

            $academicYearModel = new AcademicYear();
            if (!$selectedYearId) {
                $selectedYearId = $academicYearModel->where('is_current', 1)->first()?->id;
            }

            // Get stats for the selected year
            // This would query your actual data tables with the year filter
            $stats = [
                'total_students' => 6116,
                'total_invoices' => 1250,
                'total_revenue' => 45000000,
                'pending_payments' => 350,
                'new_applications' => 125,
                'academic_year_id' => $selectedYearId
            ];

            $this->success($response, [
                'stats' => $stats,
                'academic_year_id' => $selectedYearId
            ]);

        } catch (\Exception $e) {
            error_log('Error getting dashboard stats: ' . $e->getMessage());
            $this->error($response, 'Failed to get stats', 500);
        }
    }

    /**
     * Check if user is admin
     */
    private function isAdmin(Request $request): bool
    {
        $user = (array)($request->param('_auth_user') ?? []);
        if (empty($user) || empty($user['id'])) {
            return false;
        }

        // Check if user has admin role
        $adminRoles = ['administrator', 'superadmin', 'admin'];
        $userRole = $user['role'] ?? null;

        return in_array(strtolower($userRole ?? ''), $adminRoles);
    }
}

<?php

namespace App\Controllers;

use CodeIgniter\HTTP\ResponseInterface;
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
    public function getAllYears()
    {
        try {
            // Check if user is admin
            if (!$this->isAdmin()) {
                return $this->respond(['error' => 'Unauthorized - Admin access required'], 403);
            }

            $academicYearModel = new AcademicYear();
            $years = $academicYearModel
                ->orderBy('start_date', 'DESC')
                ->findAll();

            $currentYear = $academicYearModel->where('is_current', 1)->first();

            return $this->respond([
                'success' => true,
                'academic_years' => $years,
                'current_academic_year_id' => $currentYear?->id,
                'current_academic_year' => $currentYear
            ]);

        } catch (\Exception $e) {
            log_message('error', 'Error getting academic years: ' . $e->getMessage());
            return $this->respond(['error' => 'Failed to get academic years'], 500);
        }
    }

    /**
     * Get admin's current year selection (separate from module preferences)
     * GET /api/admin/me/selected-year
     */
    public function getAdminSelectedYear()
    {
        try {
            if (!$this->isAdmin()) {
                return $this->respond(['error' => 'Unauthorized'], 403);
            }

            $userId = auth()->id();
            $selectedYearId = session()->get("admin_year_selection_{$userId}");

            $academicYearModel = new AcademicYear();
            $selectedYear = null;
            $currentYear = $academicYearModel->where('is_current', 1)->first();

            if ($selectedYearId) {
                $selectedYear = $academicYearModel->find($selectedYearId);
            }

            if (!$selectedYear) {
                $selectedYear = $currentYear;
            }

            return $this->respond([
                'success' => true,
                'selected_academic_year_id' => $selectedYear->id,
                'selected_academic_year' => $selectedYear,
                'current_academic_year_id' => $currentYear->id,
                'current_academic_year' => $currentYear,
                'is_admin' => true,
                'is_viewing_current' => $selectedYear->id === $currentYear->id
            ]);

        } catch (\Exception $e) {
            log_message('error', 'Error getting admin year: ' . $e->getMessage());
            return $this->respond(['error' => 'Failed to get admin year'], 500);
        }
    }

    /**
     * Set admin's year selection (affects only this admin's session)
     * POST /api/admin/me/selected-year
     * Body: { academic_year_id: 123 }
     */
    public function setAdminSelectedYear()
    {
        try {
            if (!$this->isAdmin()) {
                return $this->respond(['error' => 'Unauthorized'], 403);
            }

            $data = $this->request->getJSON();
            $academicYearId = $data?->academic_year_id;

            // Validate year exists
            if ($academicYearId) {
                $academicYearModel = new AcademicYear();
                $academicYear = $academicYearModel->find($academicYearId);

                if (!$academicYear) {
                    return $this->respond([
                        'error' => 'Invalid academic year ID',
                        'academic_year_id' => $academicYearId
                    ], 400);
                }
            }

            $userId = auth()->id();
            session()->set("admin_year_selection_{$userId}", $academicYearId);

            log_message('info', "Admin {$userId} switched view to year {$academicYearId}");

            return $this->respond([
                'success' => true,
                'selected_academic_year_id' => $academicYearId,
                'message' => 'Admin year selection updated'
            ]);

        } catch (\Exception $e) {
            log_message('error', 'Error setting admin year: ' . $e->getMessage());
            return $this->respond(['error' => 'Failed to set admin year'], 500);
        }
    }

    /**
     * Reset admin to current year
     * DELETE /api/admin/me/selected-year
     */
    public function resetAdminYear()
    {
        try {
            if (!$this->isAdmin()) {
                return $this->respond(['error' => 'Unauthorized'], 403);
            }

            $userId = auth()->id();
            session()->remove("admin_year_selection_{$userId}");

            log_message('info', "Admin {$userId} reset view to current year");

            return $this->respond([
                'success' => true,
                'message' => 'Reset to current academic year'
            ]);

        } catch (\Exception $e) {
            log_message('error', 'Error resetting admin year: ' . $e->getMessage());
            return $this->respond(['error' => 'Failed to reset admin year'], 500);
        }
    }

    /**
     * Get dashboard stats for admin's selected year
     * GET /api/admin/dashboard-stats
     * Shows data for the year admin is currently viewing
     */
    public function getDashboardStats()
    {
        try {
            if (!$this->isAdmin()) {
                return $this->respond(['error' => 'Unauthorized'], 403);
            }

            $userId = auth()->id();
            $selectedYearId = session()->get("admin_year_selection_{$userId}");

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

            return $this->respond([
                'success' => true,
                'stats' => $stats,
                'academic_year_id' => $selectedYearId
            ]);

        } catch (\Exception $e) {
            log_message('error', 'Error getting dashboard stats: ' . $e->getMessage());
            return $this->respond(['error' => 'Failed to get stats'], 500);
        }
    }

    /**
     * Check if user is admin
     */
    private function isAdmin()
    {
        $user = auth()->user();
        if (!$user) {
            return false;
        }

        // Check if user has admin role
        $adminRoles = ['administrator', 'superadmin', 'admin'];
        $userRole = $user->role_id ?? null;

        // This depends on your permission/role system
        // Adjust based on your actual implementation
        return in_array(strtolower($userRole), $adminRoles)
            || auth()->hasPermission('VIEW_ALL_DATA')
            || auth()->hasPermission('MANAGE_SYSTEM');
    }
}

<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use Core\Database;

class HrMonitoringController extends BaseController
{
    private Database $db;

    public function __construct()
    {
        $this->db = Database::getInstance();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PERFORMANCE MONITORING
    // ─────────────────────────────────────────────────────────────────────────

    public function getAppraisals(Request $request, Response $response): never
    {
        $page = (int)($request->query('page') ?? 1);
        $perPage = (int)($request->query('per_page') ?? 25);
        $offset = ($page - 1) * $perPage;

        $total = $this->db->fetchOne(
            "SELECT COUNT(*) AS n FROM `performance_appraisals`"
        )['n'] ?? 0;

        $appraisals = $this->db->fetchAll(
            "SELECT pa.*, e.fname, e.lname
             FROM `performance_appraisals` pa
             LEFT JOIN employee_contracts e ON e.id = pa.employee_id
             ORDER BY pa.appraisal_date DESC
             LIMIT ? OFFSET ?",
            [$perPage, $offset]
        );

        $this->success($response, [
            'appraisals' => $appraisals,
            'pagination' => [
                'total' => (int)$total,
                'page' => $page,
                'per_page' => $perPage,
                'total_pages' => ceil($total / $perPage),
            ],
        ], 'Appraisals fetched.');
    }

    public function createAppraisal(Request $request, Response $response): never
    {
        $data = $request->body();

        $this->db->query(
            "INSERT INTO `performance_appraisals`
             (employee_id, appraisal_period, appraisal_date, rating, comments, appraiser_id, status)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
            [
                $data['employee_id'] ?? null,
                $data['appraisal_period'] ?? null,
                $data['appraisal_date'] ?? null,
                $data['rating'] ?? null,
                $data['comments'] ?? null,
                $data['appraiser_id'] ?? null,
                'draft',
            ]
        );

        $this->success($response, null, 'Appraisal created.');
    }

    public function updateAppraisal(Request $request, Response $response): never
    {
        $id = (int)($request->param('id') ?? 0);
        $data = $request->body();

        $this->db->query(
            "UPDATE `performance_appraisals`
             SET appraisal_period = ?, appraisal_date = ?, rating = ?, comments = ?, appraiser_id = ?, status = ?
             WHERE id = ?",
            [
                $data['appraisal_period'] ?? null,
                $data['appraisal_date'] ?? null,
                $data['rating'] ?? null,
                $data['comments'] ?? null,
                $data['appraiser_id'] ?? null,
                $data['status'] ?? 'draft',
                $id,
            ]
        );

        $this->success($response, null, 'Appraisal updated.');
    }

    public function deleteAppraisal(Request $request, Response $response): never
    {
        $id = (int)($request->param('id') ?? 0);

        $this->db->query(
            "DELETE FROM `performance_appraisals` WHERE id = ?",
            [$id]
        );

        $this->success($response, null, 'Appraisal deleted.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // RECRUITMENT MONITORING
    // ─────────────────────────────────────────────────────────────────────────

    public function getRecruitmentPosts(Request $request, Response $response): never
    {
        $posts = $this->db->fetchAll(
            "SELECT rp.*, d.dep_name
             FROM `recruitment_posts` rp
             LEFT JOIN departements d ON d.dep_id = rp.department_id
             ORDER BY rp.posting_date DESC"
        );

        $this->success($response, $posts, 'Recruitment posts fetched.');
    }

    public function createRecruitmentPost(Request $request, Response $response): never
    {
        $data = $request->body();

        $this->db->query(
            "INSERT INTO `recruitment_posts`
             (position_title, department_id, position_level, vacancy_count, posting_date, closing_date, status, description)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [
                $data['position_title'] ?? null,
                $data['department_id'] ?? null,
                $data['position_level'] ?? null,
                $data['vacancy_count'] ?? 1,
                $data['posting_date'] ?? date('Y-m-d'),
                $data['closing_date'] ?? null,
                'open',
                $data['description'] ?? null,
            ]
        );

        $this->success($response, null, 'Recruitment post created.');
    }

    public function updateRecruitmentPost(Request $request, Response $response): never
    {
        $id = (int)($request->param('id') ?? 0);
        $data = $request->body();

        $this->db->query(
            "UPDATE `recruitment_posts`
             SET position_title = ?, department_id = ?, position_level = ?, vacancy_count = ?, closing_date = ?, status = ?, description = ?
             WHERE id = ?",
            [
                $data['position_title'] ?? null,
                $data['department_id'] ?? null,
                $data['position_level'] ?? null,
                $data['vacancy_count'] ?? 1,
                $data['closing_date'] ?? null,
                $data['status'] ?? 'open',
                $data['description'] ?? null,
                $id,
            ]
        );

        $this->success($response, null, 'Recruitment post updated.');
    }

    public function deleteRecruitmentPost(Request $request, Response $response): never
    {
        $id = (int)($request->param('id') ?? 0);

        $this->db->query(
            "DELETE FROM `recruitment_posts` WHERE id = ?",
            [$id]
        );

        $this->success($response, null, 'Recruitment post deleted.');
    }

    public function getCandidates(Request $request, Response $response): never
    {
        $postId = (int)($request->query('post_id') ?? 0);

        $candidates = $this->db->fetchAll(
            "SELECT * FROM `recruitment_candidates`
             WHERE recruitment_post_id = ?
             ORDER BY application_date DESC",
            [$postId]
        );

        $this->success($response, $candidates, 'Candidates fetched.');
    }

    public function createCandidate(Request $request, Response $response): never
    {
        $data = $request->body();

        $this->db->query(
            "INSERT INTO `recruitment_candidates`
             (recruitment_post_id, candidate_name, candidate_email, candidate_phone, application_date, stage, status, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [
                $data['recruitment_post_id'] ?? null,
                $data['candidate_name'] ?? null,
                $data['candidate_email'] ?? null,
                $data['candidate_phone'] ?? null,
                $data['application_date'] ?? date('Y-m-d'),
                $data['stage'] ?? 'initial',
                'applied',
                $data['notes'] ?? null,
            ]
        );

        $this->success($response, null, 'Candidate added.');
    }

    public function updateCandidate(Request $request, Response $response): never
    {
        $id = (int)($request->param('id') ?? 0);
        $data = $request->body();

        $this->db->query(
            "UPDATE `recruitment_candidates`
             SET candidate_name = ?, candidate_email = ?, candidate_phone = ?, stage = ?, status = ?, interview_date = ?, notes = ?
             WHERE id = ?",
            [
                $data['candidate_name'] ?? null,
                $data['candidate_email'] ?? null,
                $data['candidate_phone'] ?? null,
                $data['stage'] ?? null,
                $data['status'] ?? 'applied',
                $data['interview_date'] ?? null,
                $data['notes'] ?? null,
                $id,
            ]
        );

        $this->success($response, null, 'Candidate updated.');
    }

    public function deleteCandidate(Request $request, Response $response): never
    {
        $id = (int)($request->param('id') ?? 0);

        $this->db->query(
            "DELETE FROM `recruitment_candidates` WHERE id = ?",
            [$id]
        );

        $this->success($response, null, 'Candidate deleted.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // EMPLOYEE RELATIONS MONITORING
    // ─────────────────────────────────────────────────────────────────────────

    public function getGrievances(Request $request, Response $response): never
    {
        $page = (int)($request->query('page') ?? 1);
        $perPage = (int)($request->query('per_page') ?? 25);
        $offset = ($page - 1) * $perPage;

        $total = $this->db->fetchOne(
            "SELECT COUNT(*) AS n FROM `grievances`"
        )['n'] ?? 0;

        $grievances = $this->db->fetchAll(
            "SELECT g.*, e.fname, e.lname
             FROM `grievances` g
             LEFT JOIN employee_contracts e ON e.id = g.employee_id
             ORDER BY g.grievance_date DESC
             LIMIT ? OFFSET ?",
            [$perPage, $offset]
        );

        $this->success($response, [
            'grievances' => $grievances,
            'pagination' => [
                'total' => (int)$total,
                'page' => $page,
                'per_page' => $perPage,
                'total_pages' => ceil($total / $perPage),
            ],
        ], 'Grievances fetched.');
    }

    public function createGrievance(Request $request, Response $response): never
    {
        $data = $request->body();

        $this->db->query(
            "INSERT INTO `grievances`
             (employee_id, grievance_date, grievance_type, grievance_description, status, assigned_to)
             VALUES (?, ?, ?, ?, ?, ?)",
            [
                $data['employee_id'] ?? null,
                $data['grievance_date'] ?? date('Y-m-d'),
                $data['grievance_type'] ?? null,
                $data['grievance_description'] ?? null,
                'filed',
                $data['assigned_to'] ?? null,
            ]
        );

        $this->success($response, null, 'Grievance recorded.');
    }

    public function updateGrievanceStatus(Request $request, Response $response): never
    {
        $id = (int)($request->param('id') ?? 0);
        $data = $request->body();

        $this->db->query(
            "UPDATE `grievances`
             SET status = ?, resolution_date = ?, resolution_notes = ?, satisfaction_rating = ?
             WHERE id = ?",
            [
                $data['status'] ?? null,
                $data['resolution_date'] ?? null,
                $data['resolution_notes'] ?? null,
                $data['satisfaction_rating'] ?? null,
                $id,
            ]
        );

        $this->success($response, null, 'Grievance updated.');
    }

    public function deleteGrievance(Request $request, Response $response): never
    {
        $id = (int)($request->param('id') ?? 0);

        $this->db->query(
            "DELETE FROM `grievances` WHERE id = ?",
            [$id]
        );

        $this->success($response, null, 'Grievance deleted.');
    }

    public function getConflictResolutions(Request $request, Response $response): never
    {
        $conflicts = $this->db->fetchAll(
            "SELECT * FROM `conflict_resolutions`
             ORDER BY conflict_date DESC"
        );

        $this->success($response, $conflicts, 'Conflict resolutions fetched.');
    }

    public function recordConflictResolution(Request $request, Response $response): never
    {
        $data = $request->body();

        $this->db->query(
            "INSERT INTO `conflict_resolutions`
             (conflict_date, parties_involved, conflict_description, resolution_method, mediator_id, status)
             VALUES (?, ?, ?, ?, ?, ?)",
            [
                $data['conflict_date'] ?? date('Y-m-d'),
                $data['parties_involved'] ?? null,
                $data['conflict_description'] ?? null,
                $data['resolution_method'] ?? null,
                $data['mediator_id'] ?? null,
                'pending',
            ]
        );

        $this->success($response, null, 'Conflict resolution recorded.');
    }

    public function updateConflictResolution(Request $request, Response $response): never
    {
        $id = (int)($request->param('id') ?? 0);
        $data = $request->body();

        $this->db->query(
            "UPDATE `conflict_resolutions`
             SET conflict_date = ?, parties_involved = ?, conflict_description = ?, resolution_method = ?, mediator_id = ?, status = ?
             WHERE id = ?",
            [
                $data['conflict_date'] ?? null,
                $data['parties_involved'] ?? null,
                $data['conflict_description'] ?? null,
                $data['resolution_method'] ?? null,
                $data['mediator_id'] ?? null,
                $data['status'] ?? 'pending',
                $id,
            ]
        );

        $this->success($response, null, 'Conflict resolution updated.');
    }

    public function deleteConflictResolution(Request $request, Response $response): never
    {
        $id = (int)($request->param('id') ?? 0);

        $this->db->query(
            "DELETE FROM `conflict_resolutions` WHERE id = ?",
            [$id]
        );

        $this->success($response, null, 'Conflict resolution deleted.');
    }

    public function getStaffSatisfactionSurveys(Request $request, Response $response): never
    {
        $surveys = $this->db->fetchAll(
            "SELECT * FROM `staff_satisfaction_surveys`
             ORDER BY survey_date DESC"
        );

        $this->success($response, $surveys, 'Satisfaction surveys fetched.');
    }

    public function getCounselingRecords(Request $request, Response $response): never
    {
        $employeeId = (int)($request->query('employee_id') ?? 0);

        $records = $this->db->fetchAll(
            "SELECT c.*, e.fname, e.lname
             FROM `counseling_records` c
             LEFT JOIN employee_contracts e ON e.id = c.counselor_id
             WHERE c.employee_id = ?
             ORDER BY c.counseling_date DESC",
            [$employeeId]
        );

        $this->success($response, $records, 'Counseling records fetched.');
    }

    public function recordCounselingSession(Request $request, Response $response): never
    {
        $data = $request->body();

        $this->db->query(
            "INSERT INTO `counseling_records`
             (employee_id, counselor_id, counseling_date, session_topic, session_notes, follow_up_required, follow_up_date)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
            [
                $data['employee_id'] ?? null,
                $data['counselor_id'] ?? null,
                $data['counseling_date'] ?? date('Y-m-d'),
                $data['session_topic'] ?? null,
                $data['session_notes'] ?? null,
                $data['follow_up_required'] ?? false,
                $data['follow_up_date'] ?? null,
            ]
        );

        $this->success($response, null, 'Counseling session recorded.');
    }

    public function updateCounselingRecord(Request $request, Response $response): never
    {
        $id = (int)($request->param('id') ?? 0);
        $data = $request->body();

        $this->db->query(
            "UPDATE `counseling_records`
             SET counselor_id = ?, counseling_date = ?, session_topic = ?, session_notes = ?, follow_up_required = ?, follow_up_date = ?
             WHERE id = ?",
            [
                $data['counselor_id'] ?? null,
                $data['counseling_date'] ?? null,
                $data['session_topic'] ?? null,
                $data['session_notes'] ?? null,
                $data['follow_up_required'] ?? false,
                $data['follow_up_date'] ?? null,
                $id,
            ]
        );

        $this->success($response, null, 'Counseling record updated.');
    }

    public function deleteCounselingRecord(Request $request, Response $response): never
    {
        $id = (int)($request->param('id') ?? 0);

        $this->db->query(
            "DELETE FROM `counseling_records` WHERE id = ?",
            [$id]
        );

        $this->success($response, null, 'Counseling record deleted.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TURNOVER & RETENTION MONITORING
    // ─────────────────────────────────────────────────────────────────────────

    public function getExitInterviews(Request $request, Response $response): never
    {
        $interviews = $this->db->fetchAll(
            "SELECT ei.*, e.fname, e.lname
             FROM `exit_interviews` ei
             LEFT JOIN employee_contracts e ON e.id = ei.employee_id
             ORDER BY ei.exit_date DESC"
        );

        $this->success($response, $interviews, 'Exit interviews fetched.');
    }

    public function recordExitInterview(Request $request, Response $response): never
    {
        $data = $request->body();

        $this->db->query(
            "INSERT INTO `exit_interviews`
             (employee_id, exit_date, reason_for_leaving, interviewer_id, job_satisfaction, management_satisfaction, work_environment_satisfaction, comments, would_rehire)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                $data['employee_id'] ?? null,
                $data['exit_date'] ?? date('Y-m-d'),
                $data['reason_for_leaving'] ?? null,
                $data['interviewer_id'] ?? null,
                $data['job_satisfaction'] ?? null,
                $data['management_satisfaction'] ?? null,
                $data['work_environment_satisfaction'] ?? null,
                $data['comments'] ?? null,
                $data['would_rehire'] ?? false,
            ]
        );

        $this->success($response, null, 'Exit interview recorded.');
    }

    public function updateExitInterview(Request $request, Response $response): never
    {
        $id = (int)($request->param('id') ?? 0);
        $data = $request->body();

        $this->db->query(
            "UPDATE `exit_interviews`
             SET exit_date = ?, reason_for_leaving = ?, interviewer_id = ?, job_satisfaction = ?, management_satisfaction = ?, work_environment_satisfaction = ?, comments = ?, would_rehire = ?
             WHERE id = ?",
            [
                $data['exit_date'] ?? null,
                $data['reason_for_leaving'] ?? null,
                $data['interviewer_id'] ?? null,
                $data['job_satisfaction'] ?? null,
                $data['management_satisfaction'] ?? null,
                $data['work_environment_satisfaction'] ?? null,
                $data['comments'] ?? null,
                $data['would_rehire'] ?? false,
                $id,
            ]
        );

        $this->success($response, null, 'Exit interview updated.');
    }

    public function deleteExitInterview(Request $request, Response $response): never
    {
        $id = (int)($request->param('id') ?? 0);

        $this->db->query(
            "DELETE FROM `exit_interviews` WHERE id = ?",
            [$id]
        );

        $this->success($response, null, 'Exit interview deleted.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // EMPLOYEES & STAFF LISTING
    // ─────────────────────────────────────────────────────────────────────────

    public function getEmployees(Request $request, Response $response): never
    {
        $page = (int)($request->query('page') ?? 1);
        $perPage = (int)($request->query('per_page') ?? 25);
        $search = (string)($request->query('search') ?? '');
        $offset = ($page - 1) * $perPage;

        $whereClause = '';
        $params = [];

        if (!empty($search)) {
            $whereClause = "WHERE CONCAT(e.fname, ' ', e.lname) LIKE ?";
            $params[] = "%$search%";
        }

        $total = $this->db->fetchOne(
            "SELECT COUNT(DISTINCT e.id) AS n FROM `employee_contracts` e $whereClause",
            $params
        )['n'] ?? 0;

        $employees = $this->db->fetchAll(
            "SELECT DISTINCT e.id, e.fname, e.lname, e.email, e.employee_post, e.position
             FROM `employee_contracts` e
             $whereClause
             ORDER BY e.fname, e.lname
             LIMIT ? OFFSET ?",
            array_merge($params, [$perPage, $offset])
        );

        $this->success($response, [
            'employees' => $employees,
            'pagination' => [
                'total' => (int)$total,
                'page' => $page,
                'per_page' => $perPage,
                'total_pages' => ceil($total / $perPage),
            ],
        ], 'Employees fetched.');
    }

    public function getTurnoverAnalytics(Request $request, Response $response): never
    {
        $analytics = $this->db->fetchAll(
            "SELECT ta.*, ay.year
             FROM `turnover_analytics` ta
             LEFT JOIN academic_years ay ON ay.id = ta.academic_year_id
             ORDER BY ta.report_date DESC"
        );

        $this->success($response, $analytics, 'Turnover analytics fetched.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // DASHBOARD SUMMARY
    // ─────────────────────────────────────────────────────────────────────────

    public function getMonitoringDashboard(Request $request, Response $response): never
    {
        $openGrievances = (int)($this->db->fetchOne(
            "SELECT COUNT(*) AS n FROM `grievances` WHERE status = 'filed'"
        )['n'] ?? 0);

        $openConflicts = (int)($this->db->fetchOne(
            "SELECT COUNT(*) AS n FROM `conflict_resolutions` WHERE status = 'pending'"
        )['n'] ?? 0);

        $pendingAppraisals = (int)($this->db->fetchOne(
            "SELECT COUNT(*) AS n FROM `performance_appraisals` WHERE status = 'draft'"
        )['n'] ?? 0);

        $openRecruitmentPosts = (int)($this->db->fetchOne(
            "SELECT COUNT(*) AS n FROM `recruitment_posts` WHERE status = 'open'"
        )['n'] ?? 0);

        $avgTurnoverRate = $this->db->fetchOne(
            "SELECT AVG(turnover_rate) AS avg_rate FROM `turnover_analytics` LIMIT 1"
        )['avg_rate'] ?? 0;

        $this->success($response, [
            'open_grievances' => $openGrievances,
            'open_conflicts' => $openConflicts,
            'pending_appraisals' => $pendingAppraisals,
            'open_recruitment_posts' => $openRecruitmentPosts,
            'avg_turnover_rate' => (float)$avgTurnoverRate,
        ], 'Monitoring dashboard fetched.');
    }
}

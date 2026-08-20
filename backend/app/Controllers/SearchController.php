<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Constants\Permissions;
use App\Services\AuthService;
use Core\Request;
use Core\Response;
use Core\Database;

/**
 * Cross-entity global search — powers the top-navbar search box.
 *
 * Unlike the frontend's static page-navigation index, this looks inside
 * actual records (students, staff, applications, announcements, forum
 * threads). Each entity is only searched if the requesting user holds the
 * relevant view permission — superadmin bypass, matching
 * PermissionMiddleware's own rule. A user with no matching permissions
 * simply gets fewer groups back, never a 403.
 */
class SearchController extends BaseController
{
    private const MIN_QUERY_LENGTH = 2;
    private const DEFAULT_LIMIT = 5;

    public function query(Request $request, Response $response): never
    {
        $user = (array) $request->param('_auth_user');
        $q = trim((string) $request->query('q', ''));
        $limit = max(1, min(20, (int) $request->query('limit', self::DEFAULT_LIMIT)));

        if (mb_strlen($q) < self::MIN_QUERY_LENGTH) {
            $this->success($response, [
                'students' => [], 'staff' => [], 'applications' => [],
                'announcements' => [], 'forums' => [],
            ], 'Query too short.');
        }

        $permissions = (array) ($user['permissions'] ?? []);
        $isBypass = AuthService::isSuperadmin($user);
        $can = static fn (string $perm): bool => $isBypass || in_array($perm, $permissions, true);

        $db = Database::getInstance();
        $like = '%' . $q . '%';

        $data = [
            'students' => $can(Permissions::VIEW_STUDENTS)
                ? $this->searchStudents($db, $like, $limit)
                : [],
            'staff' => $can(Permissions::VIEW_HR_EMPLOYEES)
                ? $this->searchStaff($db, $like, $limit)
                : [],
            'applications' => ($can(Permissions::MANAGE_STUDENT_APPLICATIONS) || $can(Permissions::VIEW_MERIT_LIST))
                ? $this->searchApplications($db, $like, $limit)
                : [],
            'announcements' => $can(Permissions::VIEW_ANNOUNCEMENTS)
                ? $this->searchAnnouncements($db, $like, $limit)
                : [],
            'forums' => $can(Permissions::VIEW_FORUMS)
                ? $this->searchForumThreads($db, $like, $limit)
                : [],
        ];

        $this->success($response, $data, 'Search results fetched.');
    }

    private function searchStudents(Database $db, string $like, int $limit): array
    {
        $rows = $db->fetchAll(
            "SELECT id, fname, lname, regnumber, email
             FROM student
             WHERE fname LIKE ? OR lname LIKE ? OR regnumber LIKE ? OR email LIKE ?
             ORDER BY lname ASC
             LIMIT " . $limit,
            [$like, $like, $like, $like]
        );

        return array_map(static fn (array $r) => [
            'id' => (int) $r['id'],
            'title' => trim($r['fname'] . ' ' . $r['lname']),
            'subtitle' => $r['regnumber'] ?? $r['email'] ?? '',
            'to' => '/students/' . $r['id'],
        ], $rows);
    }

    private function searchStaff(Database $db, string $like, int $limit): array
    {
        $rows = $db->fetchAll(
            "SELECT employee_id, employee_fname, employee_lname, employee_position
             FROM employees
             WHERE employee_fname LIKE ? OR employee_lname LIKE ? OR employee_position LIKE ?
             ORDER BY employee_lname ASC
             LIMIT " . $limit,
            [$like, $like, $like]
        );

        return array_map(static fn (array $r) => [
            'id' => (int) $r['employee_id'],
            'title' => trim($r['employee_fname'] . ' ' . $r['employee_lname']),
            'subtitle' => $r['employee_position'] ?? '',
            'to' => '/hr/staff/' . $r['employee_id'],
        ], $rows);
    }

    private function searchApplications(Database $db, string $like, int $limit): array
    {
        $rows = $db->fetchAll(
            "SELECT id, first_name, last_name, application_number, status
             FROM student_applications
             WHERE first_name LIKE ? OR last_name LIKE ? OR application_number LIKE ? OR email LIKE ?
             ORDER BY submitted_at DESC
             LIMIT " . $limit,
            [$like, $like, $like, $like]
        );

        return array_map(static fn (array $r) => [
            'id' => (int) $r['id'],
            'title' => trim($r['first_name'] . ' ' . $r['last_name']),
            'subtitle' => ($r['application_number'] ?? '') . ' · ' . ($r['status'] ?? ''),
            'to' => '/admin/applications/' . $r['id'],
        ], $rows);
    }

    private function searchAnnouncements(Database $db, string $like, int $limit): array
    {
        $rows = $db->fetchAll(
            "SELECT id, title
             FROM announcements
             WHERE title LIKE ? OR body LIKE ?
             ORDER BY created_at DESC
             LIMIT " . $limit,
            [$like, $like]
        );

        return array_map(static fn (array $r) => [
            'id' => (int) $r['id'],
            'title' => $r['title'],
            'subtitle' => 'Announcement',
            'to' => '/announcements',
        ], $rows);
    }

    private function searchForumThreads(Database $db, string $like, int $limit): array
    {
        $rows = $db->fetchAll(
            "SELECT id, title
             FROM forum_threads
             WHERE title LIKE ? AND is_deleted = 0
             ORDER BY COALESCE(last_post_at, created_at) DESC
             LIMIT " . $limit,
            [$like]
        );

        return array_map(static fn (array $r) => [
            'id' => (int) $r['id'],
            'title' => $r['title'],
            'subtitle' => 'Forum thread',
            'to' => '/forums/threads/' . $r['id'],
        ], $rows);
    }
}

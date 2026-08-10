<?php

declare(strict_types=1);

use App\Controllers\TeacherController;
use App\Middleware\AuthMiddleware;
use App\Middleware\TeacherPortalMiddleware;

/**
 * Teacher (lecturer) self-service portal.
 *
 * Every endpoint is scoped to the LOGGED-IN lecturer through
 * App\Helpers\LecturerScope — a lecturer only ever sees their own assigned
 * modules, those modules' students, their own timetable and their own exams.
 *
 * Gated by TeacherPortalMiddleware: ACCESS_TEACHER_PORTAL *or* an actual module
 * assignment. That means anyone put in front of a class gets the workspace even
 * if their role is not lecturer/HOD — while VIEW_MY_MODULES is deliberately not
 * accepted, since the student role holds it too.
 */
$router->group('/api/teacher', function ($router) {

    // Dashboard aggregate — stat tiles, today's classes, upcoming exams,
    // marks progress and the latest payslip in a single call.
    $router->get('/summary', [TeacherController::class, 'summary']);

    // My assigned courses, each with enrolment / marks / attendance figures.
    $router->get('/courses', [TeacherController::class, 'courses']);

    // One course, same shape as a list row — lets the detail page deep-link.
    $router->get('/courses/:moduleId', [TeacherController::class, 'courseDetail']);

    // The class list for one of my courses.
    $router->get('/courses/:moduleId/students', [TeacherController::class, 'courseStudents']);

    // Sessions held + per-student tally, for the course's Attendance tab.
    $router->get('/courses/:moduleId/attendance', [TeacherController::class, 'courseAttendance']);

    // Every student I teach, deduplicated across my modules.
    $router->get('/students', [TeacherController::class, 'students']);

    // Class blocks + exam sittings + my own leave, over a date window.
    $router->get('/calendar', [TeacherController::class, 'calendar']);

    // Exams for my modules, or that I am assigned to invigilate.
    $router->get('/exams', [TeacherController::class, 'exams']);
    $router->get('/exams/:id/attendance',  [TeacherController::class, 'examAttendance']);
    $router->post('/exams/:id/attendance', [TeacherController::class, 'saveExamAttendance']);

}, [AuthMiddleware::class, TeacherPortalMiddleware::class]);

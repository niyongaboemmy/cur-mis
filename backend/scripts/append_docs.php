<?php
$newRoutes = "";

// Helper to generate a route entry
function route(string $group, string $method, string $path, string $summary, string $desc = '') {
    return "  [
    'group'       => '$group',
    'method'      => '$method',
    'path'        => '$path',
    'summary'     => '$summary',
    'description' => '$desc',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Success', 'data' => null],
    'errors'      => [],
  ],
";
}

// 1. Academics
$newRoutes .= <<<'PHP'
  // ── Academics Registry ─────────────────────────────────────────────────────
PHP;
$newRoutes .= "\n" . route('Academics', 'GET', '/api/academic/years', 'List academic years');
$newRoutes .= route('Academics', 'POST', '/api/academic/years', 'Create academic year');
$newRoutes .= route('Academics', 'PUT', '/api/academic/years/:id', 'Update academic year');
$newRoutes .= route('Academics', 'DELETE', '/api/academic/years/:id', 'Delete academic year');
$newRoutes .= route('Academics', 'PATCH', '/api/academic/years/:id/activate', 'Activate academic year');

$newRoutes .= route('Academics', 'GET', '/api/academic/terms', 'List academic terms');
$newRoutes .= route('Academics', 'POST', '/api/academic/terms', 'Create academic term');
$newRoutes .= route('Academics', 'PUT', '/api/academic/terms/:id', 'Update academic term');
$newRoutes .= route('Academics', 'DELETE', '/api/academic/terms/:id', 'Delete academic term');
$newRoutes .= route('Academics', 'PATCH', '/api/academic/terms/:id/activate', 'Activate academic term');

// 2. Application Portal (Public)
$newRoutes .= <<<'PHP'

  // ── Application Portal (Public) ───────────────────────────────────────────
PHP;
$newRoutes .= "\n" . "  [
    'group'       => 'Application Portal (Public)',
    'method'      => 'GET',
    'path'        => '/api/portal/active-year',
    'summary'     => 'Get active application round',
    'description' => 'Checks if the admissions system is currently open.',
    'auth'        => false,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Active year fetched.', 'data' => ['id' => 1, 'label' => '2026/2027']],
    'errors'      => [],
  ],\n";
$newRoutes .= route('Application Portal (Public)', 'GET', '/api/portal/faculties', 'List faculties');
$newRoutes .= route('Application Portal (Public)', 'GET', '/api/portal/faculties/:faculty_id/programs', 'List programs for faculty');
$newRoutes .= route('Application Portal (Public)', 'GET', '/api/portal/faculties/:faculty_id/requirements', 'List document requirements');
$newRoutes .= route('Application Portal (Public)', 'POST', '/api/portal/applications', 'Submit application');
$newRoutes .= route('Application Portal (Public)', 'GET', '/api/portal/applications/:application_number', 'Track application status');
$newRoutes .= route('Application Portal (Public)', 'POST', '/api/portal/applications/:application_number/documents', 'Upload document to existing application');
$newRoutes .= route('Application Portal (Public)', 'POST', '/api/portal/applications/:application_number/respond', 'Accept or decline admission offer');

// 3. Document Types
$newRoutes .= <<<'PHP'

  // ── Document Types ────────────────────────────────────────────────────────
PHP;
$newRoutes .= "\n" . route('Admissions Settings', 'GET', '/api/admin/document-types', 'List document types');
$newRoutes .= route('Admissions Settings', 'POST', '/api/admin/document-types', 'Create document type');
$newRoutes .= route('Admissions Settings', 'GET', '/api/admin/document-types/:id', 'Show document type');
$newRoutes .= route('Admissions Settings', 'PUT', '/api/admin/document-types/:id', 'Update document type');
$newRoutes .= route('Admissions Settings', 'DELETE', '/api/admin/document-types/:id', 'Delete document type');

// 4. Admission Requirements
$newRoutes .= <<<'PHP'

  // ── Admission Requirements ──────────────────────────────────────────────
PHP;
$newRoutes .= "\n" . route('Admissions Settings', 'GET', '/api/admin/admission-requirements', 'List admission requirements');
$newRoutes .= route('Admissions Settings', 'POST', '/api/admin/admission-requirements', 'Create admission requirement');
$newRoutes .= route('Admissions Settings', 'POST', '/api/admin/admission-requirements/copy', 'Copy requirements from one year to another');
$newRoutes .= route('Admissions Settings', 'GET', '/api/admin/admission-requirements/faculty/:faculty_id/year/:year_id', 'Get requirements for faculty and year');
$newRoutes .= route('Admissions Settings', 'GET', '/api/admin/admission-requirements/:id', 'Show admission requirement');
$newRoutes .= route('Admissions Settings', 'PUT', '/api/admin/admission-requirements/:id', 'Update admission requirement');
$newRoutes .= route('Admissions Settings', 'DELETE', '/api/admin/admission-requirements/:id', 'Delete admission requirement');

// 5. Application Management
$newRoutes .= <<<'PHP'

  // ── Application Management ──────────────────────────────────────────────
PHP;
$newRoutes .= "\n" . route('Admissions', 'GET', '/api/admin/applications', 'List all student applications');
$newRoutes .= route('Admissions', 'GET', '/api/admin/applications/:id', 'Show full application details');
$newRoutes .= route('Admissions', 'PATCH', '/api/admin/applications/:id/status', 'Update application status');
$newRoutes .= route('Admissions', 'POST', '/api/admin/applications/:id/notes', 'Add internal notes to application');

// 6. Document Verification
$newRoutes .= <<<'PHP'

  // ── Document Verification ───────────────────────────────────────────────
PHP;
$newRoutes .= "\n" . route('Admissions', 'GET', '/api/admin/verifications', 'List applications pending document verification');
$newRoutes .= route('Admissions', 'GET', '/api/admin/verifications/:application_id/documents', 'Get documents for verification');
$newRoutes .= route('Admissions', 'PATCH', '/api/admin/verifications/:application_id/documents/:document_id', 'Verify or reject individual document');
$newRoutes .= route('Admissions', 'GET', '/api/admin/verifications/:application_id/documents/:document_id/download', 'Download document file');

// 7. Merit Lists
$newRoutes .= <<<'PHP'

  // ── Merit List Management ───────────────────────────────────────────────
PHP;
$newRoutes .= "\n" . route('Admissions', 'GET', '/api/admin/merit/criteria', 'Get merit calculation criteria');
$newRoutes .= route('Admissions', 'POST', '/api/admin/merit/criteria', 'Save merit criteria');
$newRoutes .= route('Admissions', 'POST', '/api/admin/merit/generate', 'Trigger merit list generation');
$newRoutes .= route('Admissions', 'GET', '/api/admin/merit/list', 'List generated merit list rankings');
$newRoutes .= route('Admissions', 'PATCH', '/api/admin/merit/publish', 'Publish merit list results');

// 8. Offers
$newRoutes .= <<<'PHP'

  // ── Admission Offers ────────────────────────────────────────────────────
PHP;
$newRoutes .= "\n" . route('Admissions', 'GET', '/api/admin/admissions/offers', 'List admission offers');
$newRoutes .= route('Admissions', 'POST', '/api/admin/admissions/offers', 'Create individual offer');
$newRoutes .= route('Admissions', 'POST', '/api/admin/admissions/offers/bulk', 'Bulk create offers from a generated merit list');
$newRoutes .= route('Admissions', 'GET', '/api/admin/admissions/offers/:offer_id', 'Get specific offer details');
$newRoutes .= route('Admissions', 'POST', '/api/admin/admissions/offers/:offer_id/enroll', 'Convert accepted application into enrolled student record');


// Others missed previously
$newRoutes .= <<<'PHP'

  // ── Miscellaneous ────────────────────────────────────────────────────
PHP;
$newRoutes .= "\n" . route('User Management', 'GET', '/api/users/:id', 'Show single user details');
$newRoutes .= route('Student Registry', 'GET', '/api/students/:id', 'Show single student details');
$newRoutes .= route('HR Management', 'GET', '/api/employees/:id', 'Show HR employee details');
$newRoutes .= route('Role Management', 'GET', '/api/roles/:id', 'Show specific role');
$newRoutes .= route('Role Management', 'PUT', '/api/roles/:id', 'Update specific role');
$newRoutes .= route('Role Management', 'DELETE', '/api/roles/:id', 'Delete specific role');
$newRoutes .= route('Role Management', 'POST', '/api/roles/:id/permissions', 'Assign permissions to an existing role');

$docFile = 'public/api-docs.php';
$content = file_get_contents($docFile);
$marker = '];' . "\n\n" . '// Group routes by category';

$newContent = str_replace($marker, "\n" . $newRoutes . "\n" . $marker, $content);
file_put_contents($docFile, $newContent);

echo "Success.";

<?php
declare(strict_types=1);

// Only allow access in non-production environments (or when explicitly enabled)
define('BASE_PATH', dirname(__DIR__));
require BASE_PATH . '/vendor/autoload.php';
$dotenv = Dotenv\Dotenv::createImmutable(BASE_PATH);
$dotenv->safeLoad();

$env = $_ENV['APP_ENV'] ?? 'production';
$debug = ($_ENV['APP_DEBUG'] ?? 'false') === 'true';
$show = ($_ENV['API_DOCS_PUBLIC'] ?? 'false') === 'true';

if ($env === 'production' && !$show) {
  http_response_code(403);
  echo json_encode(['success' => false, 'message' => 'API docs are disabled in production. Set API_DOCS_PUBLIC=true to enable.']);
  exit;
}

$appName = $_ENV['APP_NAME'] ?? 'API';
$appUrl = rtrim($_ENV['APP_URL'] ?? 'http://localhost', '/');
$version = $_ENV['APP_VERSION'] ?? '1.0.0';

// ── Route definitions (single source of truth for the docs) ──────────────────
$routes = [
  [
    'group' => 'System',
    'method' => 'GET',
    'path' => '/api/health',
    'summary' => 'Health check',
    'description' => 'Returns API status and server timestamp. No authentication required. Use this to verify the API is reachable.',
    'auth' => false,
    'rateLimit' => false,
    'request' => null,
    'response' => [
      'success' => true,
      'message' => 'API is healthy.',
      'data' => ['status' => 'ok', 'timestamp' => 1713600000, 'version' => '1.0.0'],
    ],
    'errors' => [],
  ],
  [
    'group' => 'Authentication',
    'method' => 'POST',
    'path' => '/api/auth/login',
    'summary' => 'Log in with email and password',
    'description' => 'Authenticates a user. If two-step auth is enabled, it returns `otp_required: true`. Otherwise, it returns a JWT token.',
    'auth' => false,
    'rateLimit' => true,
    'request' => [
      'fields' => [
        ['name' => 'email', 'type' => 'string', 'required' => true, 'notes' => ''],
        ['name' => 'password', 'type' => 'string', 'required' => true, 'notes' => ''],
      ],
      'example' => ['email' => 'alice@example.com', 'password' => 'secret123'],
    ],
    'response' => [
      'success' => true,
      'message' => 'Verification code sent to your email.',
      'otp_required' => true,
      'data' => ['email' => 'alice@example.com'],
    ],
    'errors' => [
      ['status' => 422, 'message' => 'Validation failed.', 'notes' => ''],
      ['status' => 401, 'message' => 'Invalid credentials.', 'notes' => ''],
    ],
  ],
  [
    'group' => 'Authentication',
    'method' => 'POST',
    'path' => '/api/auth/verify-otp',
    'summary' => 'Verify OTP code',
    'description' => 'Validates the 6-digit code sent to the email. Returns a JWT token on success.',
    'auth' => false,
    'rateLimit' => true,
    'request' => [
      'fields' => [
        ['name' => 'email', 'type' => 'string', 'required' => true, 'notes' => ''],
        ['name' => 'otp', 'type' => 'string', 'required' => true, 'notes' => '6-digit code'],
      ],
      'example' => ['email' => 'alice@example.com', 'otp' => '123456'],
    ],
    'response' => [
      'success' => true,
      'message' => 'Verification successful.',
      'data' => ['token' => 'eyJhbGci...', 'user' => ['id' => 1, 'name' => 'Alice Doe', 'email' => 'alice@example.com']],
    ],
    'errors' => [
      ['status' => 422, 'message' => 'Validation failed.', 'notes' => ''],
      ['status' => 401, 'message' => 'Invalid or expired OTP.', 'notes' => ''],
    ],
  ],
  [
    'group' => 'Authentication',
    'method' => 'POST',
    'path' => '/api/auth/resend-otp',
    'summary' => 'Resend OTP code',
    'description' => 'Generates and sends a new OTP code to the requested email.',
    'auth' => false,
    'rateLimit' => true,
    'request' => [
      'fields' => [
        ['name' => 'email', 'type' => 'string', 'required' => true, 'notes' => ''],
      ],
      'example' => ['email' => 'alice@example.com'],
    ],
    'response' => [
      'success' => true,
      'message' => 'New verification code sent.',
      'data' => null,
    ],
    'errors' => [
      ['status' => 422, 'message' => 'Validation failed.', 'notes' => ''],
      ['status' => 500, 'message' => 'Failed to send OTP.', 'notes' => 'Server error while sending mail'],
    ],
  ],

  [
    'group' => 'Authentication',
    'method' => 'POST',
    'path' => '/api/auth/logout',
    'summary' => 'Log out',
    'description' => 'Stateless JWT logout. The server acknowledges the request; the client must discard the token.',
    'auth' => true,
    'rateLimit' => false,
    'request' => null,
    'response' => ['success' => true, 'message' => 'Logged out successfully.', 'data' => null],
    'errors' => [
      ['status' => 401, 'message' => 'Unauthorized.', 'notes' => 'Missing or invalid token'],
    ],
  ],
  [
    'group' => 'Authentication',
    'method' => 'GET',
    'path' => '/api/auth/me',
    'summary' => 'Get current user',
    'description' => 'Returns the authenticated user decoded from the JWT token. No database call is made.',
    'auth' => true,
    'rateLimit' => false,
    'request' => null,
    'response' => [
      'success' => true,
      'message' => 'Authenticated user.',
      'data' => ['id' => 1, 'name' => 'Alice Doe', 'email' => 'alice@example.com'],
    ],
    'errors' => [
      ['status' => 401, 'message' => 'Unauthorized. No token provided.', 'notes' => ''],
      ['status' => 401, 'message' => 'Unauthorized. Invalid or expired token.', 'notes' => ''],
    ],
  ],
  [
    'group' => 'Authentication',
    'method' => 'POST',
    'path' => '/api/auth/forgot-password',
    'summary' => 'Request password reset',
    'description' => 'Sends a password reset link to the user email if it exists in the system. Rate-limited.',
    'auth' => false,
    'rateLimit' => true,
    'request' => [
      'fields' => [
        ['name' => 'email', 'type' => 'string', 'required' => true, 'notes' => 'User account email'],
      ],
      'example' => ['email' => 'alice@example.com'],
    ],
    'response' => [
      'success' => true,
      'message' => 'If an account with that email exists, a reset link has been sent.',
      'data' => null,
    ],
    'errors' => [
      ['status' => 422, 'message' => 'Validation failed.', 'notes' => 'Invalid email format'],
      ['status' => 429, 'message' => 'Too many requests.', 'notes' => 'Wait and retry'],
    ],
  ],
  [
    'group' => 'Authentication',
    'method' => 'POST',
    'path' => '/api/auth/reset-password',
    'summary' => 'Reset password with token',
    'description' => 'Updates the user password using a valid reset token received via email. Rate-limited.',
    'auth' => false,
    'rateLimit' => true,
    'request' => [
      'fields' => [
        ['name' => 'token', 'type' => 'string', 'required' => true, 'notes' => 'The reset token from the email link'],
        ['name' => 'password', 'type' => 'string', 'required' => true, 'notes' => 'Minimum 6 characters'],
      ],
      'example' => ['token' => 'abcdef123456...', 'password' => 'new-secret-123'],
    ],
    'response' => [
      'success' => true,
      'message' => 'Password reset successfully.',
      'data' => null,
    ],
    'errors' => [
      ['status' => 422, 'message' => 'Validation failed.', 'notes' => 'Invalid token or short password'],
      ['status' => 400, 'message' => 'Invalid or expired reset token.', 'notes' => 'The token is either wrong or too old'],
      ['status' => 429, 'message' => 'Too many requests.', 'notes' => 'Wait and retry'],
    ],
  ],

  // ── Roles Management ────────────────────────────────────────────────────────
  [
    'group' => 'Roles Management',
    'method' => 'GET',
    'path' => '/api/roles',
    'summary' => 'List all roles',
    'description' => 'Returns a list of all roles including their assigned permission slugs.',
    'auth' => true,
    'rateLimit' => false,
    'request' => null,
    'response' => [
      'success' => true,
      'message' => 'Roles fetched successfully.',
      'data' => [
        ['id' => 1, 'name' => 'superadmin', 'description' => 'Full access', 'permissions' => ['MANAGE_ROLES', 'MANAGE_PERMISSIONS']],
        ['id' => 2, 'name' => 'admin', 'description' => 'Admin access', 'permissions' => []],
      ],
    ],
    'errors' => [['status' => 401, 'message' => 'Unauthorized.', 'notes' => '']],
  ],
  [
    'group' => 'Roles Management',
    'method' => 'POST',
    'path' => '/api/roles',
    'summary' => 'Create new role',
    'description' => 'Creates a new dynamic role in the system.',
    'auth' => true,
    'rateLimit' => false,
    'request' => [
      'fields' => [
        ['name' => 'name', 'type' => 'string', 'required' => true, 'notes' => 'Unique role name'],
        ['name' => 'description', 'type' => 'string', 'required' => false, 'notes' => ''],
      ],
      'example' => ['name' => 'registrar', 'description' => 'Academic management'],
    ],
    'response' => [
      'success' => true,
      'message' => 'Role created successfully.',
      'data' => ['id' => 5],
    ],
    'errors' => [
      ['status' => 422, 'message' => 'Validation failed.', 'notes' => ''],
      ['status' => 409, 'message' => 'Role name already exists.', 'notes' => ''],
    ],
  ],
  [
    'group' => 'Roles Management',
    'method' => 'POST',
    'path' => '/api/roles/:id/permissions',
    'summary' => 'Assign permissions to role',
    'description' => 'Replaces all permissions for a role with the provided list of IDs.',
    'auth' => true,
    'rateLimit' => false,
    'request' => [
      'fields' => [
        ['name' => 'permissions', 'type' => 'array', 'required' => true, 'notes' => 'Array of permission IDs'],
      ],
      'example' => ['permissions' => [1, 2, 5]],
    ],
    'response' => [
      'success' => true,
      'message' => 'Permissions assigned successfully.',
      'data' => null,
    ],
    'errors' => [['status' => 404, 'message' => 'Role not found.', 'notes' => '']],
  ],

  // ── Permissions Management ──────────────────────────────────────────────────
  [
    'group' => 'Permissions Management',
    'method' => 'GET',
    'path' => '/api/permissions',
    'summary' => 'List all permissions',
    'description' => 'Returns all permission categories with their nested permissions.',
    'auth' => true,
    'rateLimit' => false,
    'request' => null,
    'response' => [
      'success' => true,
      'message' => 'Permissions fetched successfully.',
      'data' => [
        [
          'id' => 1,
          'name' => 'System',
          'description' => 'Core permissions',
          'permissions' => [
            ['id' => 1, 'name' => 'MANAGE_ROLES', 'slug' => 'MANAGE_ROLES', 'description' => '...'],
          ]
        ],
      ],
    ],
    'errors' => [['status' => 401, 'message' => 'Unauthorized.', 'notes' => '']],
  ],
  [
    'group' => 'Permissions Management',
    'method' => 'POST',
    'path' => '/api/permissions',
    'summary' => 'Create permission',
    'description' => 'Adds a new permission to a category.',
    'auth' => true,
    'rateLimit' => false,
    'request' => [
      'fields' => [
        ['name' => 'category_id', 'type' => 'number', 'required' => true, 'notes' => ''],
        ['name' => 'name', 'type' => 'string', 'required' => true, 'notes' => 'Display name'],
        ['name' => 'slug', 'type' => 'string', 'required' => true, 'notes' => 'UPPER_CASE identifier'],
      ],
      'example' => ['category_id' => 1, 'name' => 'Delete Users', 'slug' => 'DELETE_USERS'],
    ],
    'response' => [
      'success' => true,
      'message' => 'Permission created successfully.',
      'data' => ['id' => 10],
    ],
    'errors' => [
      ['status' => 409, 'message' => 'Permission slug already exists.', 'notes' => ''],
    ],
  ],
  [
    'group' => 'Permissions',
    'method' => 'DELETE',
    'path' => '/api/permissions/:id',
    'summary' => 'Delete permission',
    'description' => 'Removes a permission from the system.',
    'auth' => true,
    'rateLimit' => false,
    'request' => null,
    'response' => ['success' => true, 'message' => 'Permission deleted.', 'data' => null],
    'errors' => [['status' => 404, 'message' => 'Permission not found.']],
  ],
  // ── User Management ────────────────────────────────────────────────────────
  [
    'group' => 'User Management',
    'method' => 'GET',
    'path' => '/api/users',
    'summary' => 'List all users',
    'description' => 'Returns a paginated list of users with their role names.',
    'auth' => true,
    'rateLimit' => false,
    'request' => null,
    'response' => [
      'success' => true,
      'message' => 'Users fetched successfully.',
      'data' => [
        'data' => [
          ['id' => 1, 'full_name' => 'Admin User', 'email' => 'admin@test.com', 'role_id' => 1, 'role_name' => 'superadmin', 'is_active' => 1],
        ],
        'total' => 1,
        'per_page' => 15,
        'current_page' => 1,
        'last_page' => 1
      ],
    ],
    'errors' => [['status' => 403, 'message' => 'Forbidden.', 'notes' => 'Requires MANAGE_USERS permission']],
  ],
  [
    'group' => 'User Management',
    'method' => 'POST',
    'path' => '/api/users',
    'summary' => 'Create new user (Admin)',
    'description' => 'Administrative registration of new users with role assignment.',
    'auth' => true,
    'rateLimit' => false,
    'request' => [
      'fields' => [
        ['name' => 'full_name', 'type' => 'string', 'required' => true, 'notes' => ''],
        ['name' => 'email', 'type' => 'string', 'required' => true, 'notes' => ''],
        ['name' => 'username', 'type' => 'string', 'required' => true, 'notes' => ''],
        ['name' => 'password', 'type' => 'string', 'required' => true, 'notes' => ''],
        ['name' => 'role_id', 'type' => 'number', 'required' => true, 'notes' => ''],
      ],
      'example' => ['full_name' => 'John Doe', 'email' => 'john@test.com', 'username' => 'johndoe', 'password' => 'secret', 'role_id' => 2],
    ],
    'response' => [
      'success' => true,
      'message' => 'User created successfully.',
      'data' => ['id' => 15],
    ],
    'errors' => [['status' => 409, 'message' => 'Email already registered.', 'notes' => '']],
  ],
  [
    'group' => 'User Management',
    'method' => 'PUT',
    'path' => '/api/users/:id',
    'summary' => 'Update user details',
    'description' => 'Modify user profile, role, or status.',
    'auth' => true,
    'rateLimit' => false,
    'request' => [
      'fields' => [
        ['name' => 'full_name', 'type' => 'string', 'required' => true, 'notes' => ''],
        ['name' => 'email', 'type' => 'string', 'required' => true, 'notes' => ''],
        ['name' => 'role_id', 'type' => 'number', 'required' => true, 'notes' => ''],
        ['name' => 'password', 'type' => 'string', 'required' => false, 'notes' => 'Optional: provide to change password'],
        ['name' => 'is_active', 'type' => 'number', 'required' => false, 'notes' => '1 or 0'],
      ],
      'example' => ['full_name' => 'John Doe updated', 'email' => 'john.new@test.com', 'role_id' => 3],
    ],
    'response' => [
      'success' => true,
      'message' => 'User updated successfully.',
      'data' => null,
    ],
    'errors' => [['status' => 404, 'message' => 'User not found.', 'notes' => '']],
  ],
  [
    'group' => 'User Management',
    'method' => 'PATCH',
    'path' => '/api/users/:id/toggle-status',
    'summary' => 'Toggle user active status',
    'description' => 'Fast toggle between enabled and disabled status.',
    'auth' => true,
    'rateLimit' => false,
    'request' => null,
    'response' => [
      'success' => true,
      'message' => 'User status toggled.',
      'data' => ['is_active' => 0],
    ],
    'errors' => [['status' => 404, 'message' => 'User not found.', 'notes' => '']],
  ],

  // ── Academic Years & Terms ──────────────────────────────────────────────────
  [
    'group' => 'Academic Settings',
    'method' => 'GET',
    'path' => '/api/academic/years',
    'summary' => 'List academic years',
    'description' => 'Returns all academic years defined in the system.',
    'auth' => true,
    'rateLimit' => false,
    'request' => null,
    'response' => [
      'success' => true,
      'message' => 'Academic years fetched.',
      'data' => [['id' => 1, 'label' => '2024/2025', 'is_current' => 1]]
    ],
    'errors' => [],
  ],
  [
    'group' => 'Academic Settings',
    'method' => 'POST',
    'path' => '/api/academic/years',
    'summary' => 'Create academic year',
    'description' => 'Creates a new academic year with validation.',
    'auth' => true,
    'rateLimit' => false,
    'request' => [
      'fields' => [
        ['name' => 'label', 'type' => 'string', 'required' => true, 'notes' => 'Format: YYYY/YYYY (e.g. 2024/2025)'],
        ['name' => 'start_date', 'type' => 'string', 'required' => true, 'notes' => 'Format: YYYY-MM-DD'],
        ['name' => 'end_date', 'type' => 'string', 'required' => true, 'notes' => 'Format: YYYY-MM-DD'],
      ],
      'example' => ['label' => '2025/2026', 'start_date' => '2025-09-01', 'end_date' => '2026-08-31']
    ],
    'response' => ['success' => true, 'message' => 'Academic year created.', 'data' => ['id' => 5]],
    'errors' => [['status' => 422, 'message' => 'Validation failed.']],
  ],
  [
    'group' => 'Academic Settings',
    'method' => 'PATCH',
    'path' => '/api/academic/years/:id/activate',
    'summary' => 'Activate academic year',
    'description' => 'Sets the specified year as current and deactivates all others.',
    'auth' => true,
    'rateLimit' => false,
    'request' => null,
    'response' => ['success' => true, 'message' => 'Academic year activated.'],
    'errors' => [['status' => 404, 'message' => 'Year not found.']],
  ],
  [
    'group' => 'Academic Settings',
    'method' => 'GET',
    'path' => '/api/academic/terms',
    'summary' => 'List academic terms',
    'description' => 'Returns terms/semesters, optionally filtered by academic_year_id.',
    'auth' => true,
    'rateLimit' => false,
    'request' => null,
    'response' => [
      'success' => true,
      'message' => 'Academic terms fetched.',
      'data' => [['id' => 1, 'label' => 'Semester 1', 'is_current' => 1]]
    ],
    'errors' => [],
  ],
  [
    'group' => 'Academic Settings',
    'method' => 'POST',
    'path' => '/api/academic/terms',
    'summary' => 'Create academic term',
    'description' => 'Creates a new term within an academic year.',
    'auth' => true,
    'rateLimit' => false,
    'request' => [
      'fields' => [
        ['name' => 'academic_year_id', 'type' => 'number', 'required' => true, 'notes' => 'Valid ID from /academic/years'],
        ['name' => 'label', 'type' => 'string', 'required' => true, 'notes' => 'Min 3 characters'],
        ['name' => 'start_date', 'type' => 'string', 'required' => true, 'notes' => 'YYYY-MM-DD'],
        ['name' => 'end_date', 'type' => 'string', 'required' => true, 'notes' => 'YYYY-MM-DD'],
      ],
      'example' => ['academic_year_id' => 1, 'label' => 'Semester 1', 'start_date' => '2024-09-01', 'end_date' => '2025-02-28']
    ],
    'response' => ['success' => true, 'message' => 'Academic term created.', 'data' => ['id' => 10]],
    'errors' => [['status' => 422, 'message' => 'Validation failed.']],
  ],

  // ── Academics Management ────────────────────────────────────────────────────
  [
    'group' => 'Academics Management',
    'method' => 'GET',
    'path' => '/api/academics-management/:entity',
    'summary' => 'Generic CRUD for academic entities',
    'description' => 'Supports: degrees, facility, departments, options, levels, leave_types, modules, schools.',
    'auth' => true,
    'rateLimit' => false,
    'request' => null,
    'response' => [
      'success' => true,
      'message' => 'Entity fetched.',
      'data' => ['data' => [], 'total' => 0]
    ],
    'errors' => [['status' => 404, 'message' => 'Entity not found.']],
  ],
  [
    'group' => 'Academics Management',
    'method' => 'POST',
    'path' => '/api/academics-management/departments',
    'summary' => 'Create a department',
    'description' => 'Add a new department to a faculty.',
    'auth' => true,
    'rateLimit' => false,
    'request' => [
      'fields' => [
        ['name' => 'name', 'type' => 'string', 'required' => true, 'notes' => 'Min 3 chars'],
        ['name' => 'faculty_id', 'type' => 'number', 'required' => true, 'notes' => ''],
        ['name' => 'description', 'type' => 'string', 'required' => false, 'notes' => ''],
      ],
      'example' => ['name' => 'Information Technology', 'faculty_id' => 1]
    ],
    'response' => ['success' => true, 'message' => 'Departments created.', 'data' => ['id' => 10]],
    'errors' => [['status' => 422, 'message' => 'Validation failed.']],
  ],
  [
    'group' => 'Academics Management',
    'method' => 'POST',
    'path' => '/api/academics-management/degrees',
    'summary' => 'Create an academic program (degree)',
    'description' => 'Add a new academic program to a department.',
    'auth' => true,
    'rateLimit' => false,
    'request' => [
      'fields' => [
        ['name' => 'department_id', 'type' => 'number', 'required' => true, 'notes' => 'Valid department ID'],
        ['name' => 'code', 'type' => 'string', 'required' => true, 'notes' => 'e.g. BIT'],
        ['name' => 'name', 'type' => 'string', 'required' => true, 'notes' => 'e.g. Business Information Technology'],
        ['name' => 'degree_type', 'type' => 'string', 'required' => true, 'notes' => 'Certificate, Diploma, Bachelor, Master, PhD'],
        ['name' => 'duration_years', 'type' => 'number', 'required' => true, 'notes' => 'e.g. 3'],
      ],
      'example' => ['department_id' => 1, 'code' => 'BIT', 'name' => 'Business IT', 'degree_type' => 'Bachelor', 'duration_years' => 3]
    ],
    'response' => ['success' => true, 'message' => 'Degrees created.', 'data' => ['id' => 5]],
    'errors' => [['status' => 422, 'message' => 'Validation failed.']],
  ],
  [
    'group' => 'Academics Management',
    'method' => 'POST',
    'path' => '/api/academics-management/leave_types',
    'summary' => 'Create a leave type',
    'description' => 'Add a new type of staff leave.',
    'auth' => true,
    'rateLimit' => false,
    'request' => [
      'fields' => [
        ['name' => 'name', 'type' => 'string', 'required' => true, 'notes' => ''],
        ['name' => 'days_allowed', 'type' => 'number', 'required' => true, 'notes' => ''],
        ['name' => 'is_paid', 'type' => 'number', 'required' => false, 'notes' => '0 or 1'],
      ],
      'example' => ['name' => 'Annual Leave', 'days_allowed' => 30, 'is_paid' => 1]
    ],
    'response' => ['success' => true, 'message' => 'Leave_types created.', 'data' => ['id' => 2]],
    'errors' => [['status' => 422, 'message' => 'Validation failed.']],
  ],
  [
    'group' => 'Academics Management',
    'method' => 'POST',
    'path' => '/api/academics-management/modules',
    'summary' => 'Create a module',
    'description' => 'Add a new course module to the catalog.',
    'auth' => true,
    'rateLimit' => false,
    'request' => [
      'fields' => [
        ['name' => 'module_name', 'type' => 'string', 'required' => true, 'notes' => ''],
        ['name' => 'module_code', 'type' => 'string', 'required' => true, 'notes' => ''],
        ['name' => 'module_credits', 'type' => 'number', 'required' => true, 'notes' => ''],
        ['name' => 'department', 'type' => 'number', 'required' => true, 'notes' => 'Department ID'],
        ['name' => 'level', 'type' => 'number', 'required' => true, 'notes' => 'Level ID'],
      ],
      'example' => ['module_name' => 'English', 'module_code' => 'ENGL1220', 'module_credits' => 5, 'department' => 8, 'level' => 1]
    ],
    'response' => ['success' => true, 'message' => 'Modules created.', 'data' => ['id' => 94]],
    'errors' => [['status' => 422, 'message' => 'Validation failed.']],
  ],
  [
    'group' => 'Academics Management',
    'method' => 'POST',
    'path' => '/api/academics-management/schools',
    'summary' => 'Create a school/branch',
    'description' => 'Configure a new school or university branch.',
    'auth' => true,
    'rateLimit' => false,
    'request' => [
      'fields' => [
        ['name' => 'school_name', 'type' => 'string', 'required' => true, 'notes' => ''],
        ['name' => 'school_descript', 'type' => 'string', 'required' => false, 'notes' => ''],
        ['name' => 'school_address', 'type' => 'string', 'required' => false, 'notes' => ''],
        ['name' => 'school_phone', 'type' => 'string', 'required' => false, 'notes' => ''],
        ['name' => 'school_email', 'type' => 'string', 'required' => false, 'notes' => ''],
        ['name' => 'url', 'type' => 'string', 'required' => false, 'notes' => 'Website URL'],
      ],
      'example' => ['school_name' => 'Catholic University', 'url' => 'www.cur.ac.rw']
    ],
    'response' => ['success' => true, 'message' => 'Schools created.', 'data' => ['id' => 1]],
    'errors' => [['status' => 422, 'message' => 'Validation failed.']],
  ],
  [
    'group' => 'Academics Management',
    'method' => 'POST',
    'path' => '/api/academics-management/facility',
    'summary' => 'Create a facility (Room)',
    'description' => 'Add a new classroom or lab.',
    'auth' => true,
    'rateLimit' => false,
    'request' => [
      'fields' => [
        ['name' => 'name', 'type' => 'string', 'required' => true, 'notes' => 'Room name/number'],
        ['name' => 'building', 'type' => 'string', 'required' => false, 'notes' => 'Building name'],
        ['name' => 'capacity', 'type' => 'number', 'required' => true, 'notes' => 'Seating capacity'],
        ['name' => 'room_type', 'type' => 'string', 'required' => false, 'notes' => 'lecture, lab, seminar, exam_hall'],
      ],
      'example' => ['name' => 'Room 101', 'building' => 'Block A', 'capacity' => 40, 'room_type' => 'lecture']
    ],
    'response' => ['success' => true, 'message' => 'Facility created.', 'data' => ['id' => 1]],
    'errors' => [['status' => 422, 'message' => 'Validation failed.']],
  ],

  // ── System Basics ───────────────────────────────────────────────────────────
  [
    'group' => 'System Basics',
    'method' => 'GET',
    'path' => '/api/system/basics',
    'summary' => 'Get system initialization data',
    'description' => 'Returns active year/term, all years/terms, settings, and timetable.',
    'auth' => true,
    'rateLimit' => false,
    'request' => null,
    'response' => [
      'success' => true,
      'message' => 'System basics fetched.',
      'data' => [
        'active_year' => ['id' => 1, 'label' => '2024/2025'],
        'active_term' => ['id' => 1, 'label' => 'Semester 1'],
        'settings' => ['APP_NAME' => 'CUR-MIS'],
        'timetable' => []
      ]
    ],
    'errors' => [],
  ],

  // ── Student & HR Registry ───────────────────────────────────────────────────
  [
    'group' => 'Student Registry',
    'method' => 'GET',
    'path' => '/api/students',
    'summary' => 'List students (Paginated)',
    'description' => 'Searchable and paginated list of students.',
    'auth' => true,
    'rateLimit' => false,
    'request' => null,
    'response' => [
      'success' => true,
      'message' => 'Students fetched.',
      'data' => ['data' => [], 'total' => 100]
    ],
    'errors' => [],
  ],
  [
    'group' => 'HR Management',
    'method' => 'GET',
    'path' => '/api/employees',
    'summary' => 'List HR employees (Paginated)',
    'description' => 'Searchable and paginated list of employees.',
    'auth' => true,
    'rateLimit' => false,
    'request' => null,
    'response' => [
      'success' => true,
      'message' => 'HR Employees fetched.',
      'data' => ['data' => [], 'total' => 10]
    ],
    'errors' => [],
  ],

  // ── Applicant Auth ──────────────────────────────────────────────────────────
  [
    'group'       => 'Applicant Auth',
    'method'      => 'POST',
    'path'        => '/api/auth/applicant/register',
    'summary'     => 'Applicant self-registration',
    'description' => 'Allows a prospective student to claim a login account by verifying their `application_number` + `email` match in `student_applications`. On success, creates a `users` row (is_applicant = 1), a stub `applicant_profiles` row, and triggers an OTP verification email. The client must then call `POST /api/auth/verify-otp` to complete the login.',
    'auth'        => false,
    'rateLimit'   => true,
    'request'     => [
      'fields' => [
        ['name' => 'application_number', 'type' => 'string', 'required' => true,  'notes' => 'e.g. APP-2026-00001'],
        ['name' => 'email',              'type' => 'string', 'required' => true,  'notes' => 'Must match the email on the application'],
        ['name' => 'password',           'type' => 'string', 'required' => true,  'notes' => 'Minimum 8 characters'],
      ],
      'example' => ['application_number' => 'APP-2026-00001', 'email' => 'john.doe@gmail.com', 'password' => 'secure123'],
    ],
    'response' => [
      'success' => true,
      'message' => 'Account created. A verification code has been sent to your email.',
      'data'    => ['email' => 'john.doe@gmail.com'],
    ],
    'errors' => [
      ['status' => 422, 'message' => 'Validation failed.',                                              'notes' => ''],
      ['status' => 422, 'message' => 'Application number and email do not match.',                      'notes' => ''],
      ['status' => 409, 'message' => 'An account already exists for this email. Please log in instead.', 'notes' => ''],
      ['status' => 500, 'message' => 'Account created but failed to send verification email.',           'notes' => 'Try logging in normally'],
    ],
  ],

  // ── Applicant Portal (Authenticated) ──────────────────────────────────────
  [
    'group'       => 'Applicant Portal',
    'method'      => 'GET',
    'path'        => '/api/applicant/profile',
    'summary'     => 'Get own profile',
    'description' => 'Returns the enriched applicant profile including joined application summary, user info, and profile extension fields. Requires a JWT with `is_applicant = true`. Permission: MANAGE_OWN_PROFILE.',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => [
      'success' => true,
      'message' => 'Profile fetched successfully.',
      'data'    => [
        'profile'     => ['id' => 1, 'middle_name' => null, 'id_type' => 'national_id', 'id_number' => '1199900012345', 'province' => 'Kigali', 'district' => 'Gasabo', 'sector' => 'Kacyiru', 'emergency_contact_name' => 'Jane Doe', 'emergency_contact_phone' => '+250788000000', 'profile_photo_id' => null],
        'user'        => ['email' => 'john.doe@gmail.com', 'full_name' => 'John Doe', 'username' => 'john.doe.123'],
        'application' => ['application_number' => 'APP-2026-00001', 'status' => 'submitted', 'document_status' => 'incomplete', 'program_name' => 'Computer Science', 'faculty_name' => 'ICT', 'intake' => '2026-A'],
      ],
    ],
    'errors' => [
      ['status' => 401, 'message' => 'Unauthorized.',                            'notes' => ''],
      ['status' => 403, 'message' => 'Access denied. This endpoint is for applicants only.', 'notes' => ''],
    ],
  ],
  [
    'group'       => 'Applicant Portal',
    'method'      => 'PUT',
    'path'        => '/api/applicant/profile',
    'summary'     => 'Update profile',
    'description' => 'Update personal details, address, emergency contact, and (if the application is in an editable status) application-level fields such as phone, address, nationality.',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => [
      'fields' => [
        ['name' => 'middle_name',             'type' => 'string', 'required' => false, 'notes' => ''],
        ['name' => 'id_type',                 'type' => 'string', 'required' => false, 'notes' => 'national_id | passport | birth_certificate'],
        ['name' => 'id_number',               'type' => 'string', 'required' => false, 'notes' => ''],
        ['name' => 'province',                'type' => 'string', 'required' => false, 'notes' => ''],
        ['name' => 'district',                'type' => 'string', 'required' => false, 'notes' => ''],
        ['name' => 'sector',                  'type' => 'string', 'required' => false, 'notes' => ''],
        ['name' => 'emergency_contact_name',  'type' => 'string', 'required' => false, 'notes' => ''],
        ['name' => 'emergency_contact_phone', 'type' => 'string', 'required' => false, 'notes' => ''],
        ['name' => 'phone',                   'type' => 'string', 'required' => false, 'notes' => 'Updates application phone if status is editable'],
        ['name' => 'address',                 'type' => 'string', 'required' => false, 'notes' => ''],
        ['name' => 'nationality',             'type' => 'string', 'required' => false, 'notes' => ''],
      ],
      'example' => ['middle_name' => 'Paul', 'province' => 'Kigali', 'district' => 'Gasabo', 'emergency_contact_name' => 'Jane Doe', 'emergency_contact_phone' => '+250788000000'],
    ],
    'response' => ['success' => true, 'message' => 'Profile updated successfully.', 'data' => null],
    'errors'   => [
      ['status' => 422, 'message' => 'Validation failed.', 'notes' => ''],
    ],
  ],
  [
    'group'       => 'Applicant Portal',
    'method'      => 'POST',
    'path'        => '/api/applicant/profile/photo',
    'summary'     => 'Upload profile photo',
    'description' => 'Upload or replace the applicant profile photo. Accepts `multipart/form-data` with field name `photo`. Allowed: JPEG, PNG, WebP.',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => [
      'fields' => [
        ['name' => 'photo', 'type' => 'file', 'required' => true, 'notes' => 'JPEG, PNG, or WebP; multipart/form-data'],
      ],
      'example' => null,
    ],
    'response' => [
      'success' => true,
      'message' => 'Profile photo uploaded successfully.',
      'data'    => ['profile_photo_id' => 'uuid-abc123', 'url' => 'https://files.example.com/uuid-abc123'],
    ],
    'errors' => [
      ['status' => 422, 'message' => 'No photo file provided.',                     'notes' => ''],
      ['status' => 422, 'message' => 'Invalid file type.',                           'notes' => 'Only JPEG, PNG, WebP'],
    ],
  ],
  [
    'group'       => 'Applicant Portal',
    'method'      => 'GET',
    'path'        => '/api/applicant/application',
    'summary'     => 'Get application status & checklist',
    'description' => 'Returns the full application details, required document checklist (with upload + verification status per document), merit score/rank if computed, and the full status change history.',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => [
      'success' => true,
      'message' => 'Application details fetched.',
      'data'    => [
        'application_number' => 'APP-2026-00001',
        'status'             => 'documents_under_review',
        'document_status'    => 'under_review',
        'merit_score'        => null,
        'merit_rank'         => null,
        'document_checklist' => [
          ['document_type_id' => 1, 'document_name' => 'National ID', 'is_required' => true, 'uploaded' => true, 'verification_status' => 'pending'],
        ],
        'status_log' => [
          ['from_status' => null, 'to_status' => 'submitted', 'actor_type' => 'applicant', 'created_at' => '2026-04-22 10:00:00'],
        ],
      ],
    ],
    'errors' => [['status' => 404, 'message' => 'Application not found.', 'notes' => '']],
  ],
  [
    'group'       => 'Applicant Portal',
    'method'      => 'GET',
    'path'        => '/api/applicant/academic-records',
    'summary'     => 'List academic history',
    'description' => 'Returns all academic history entries for the applicant. The primary record (is_primary = true) is the one used for merit score computation.',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => [
      'success' => true,
      'message' => 'Academic records fetched.',
      'data'    => [
        ['id' => 1, 'institution_name' => 'G.S. Remera', 'qualification' => 'Rwanda Leaving Certificate', 'grade' => '78%', 'combination' => 'MCB', 'year_completed' => 2023, 'is_primary' => true],
      ],
    ],
    'errors' => [],
  ],
  [
    'group'       => 'Applicant Portal',
    'method'      => 'POST',
    'path'        => '/api/applicant/academic-records',
    'summary'     => 'Add academic record',
    'description' => 'Add a new academic history entry. The first record created is automatically marked as primary. Subsequent records must be manually promoted with the set-primary endpoint.',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => [
      'fields' => [
        ['name' => 'institution_name', 'type' => 'string', 'required' => true,  'notes' => 'School or university name'],
        ['name' => 'qualification',    'type' => 'string', 'required' => true,  'notes' => 'e.g. Rwanda Leaving Certificate, Diploma, Bachelor'],
        ['name' => 'grade',            'type' => 'string', 'required' => true,  'notes' => 'Numeric % or letter grade (e.g. 78%, B+, DIV1)'],
        ['name' => 'year_completed',   'type' => 'number', 'required' => true,  'notes' => 'Four-digit year'],
        ['name' => 'combination',      'type' => 'string', 'required' => false, 'notes' => 'A-level combination e.g. MCB, PCB (if applicable)'],
      ],
      'example' => ['institution_name' => 'G.S. Remera', 'qualification' => 'Rwanda Leaving Certificate', 'grade' => '78%', 'year_completed' => 2023, 'combination' => 'MCB'],
    ],
    'response' => ['success' => true, 'message' => 'Academic record added successfully.', 'data' => ['id' => 1, 'is_primary' => true]],
    'errors'   => [['status' => 422, 'message' => 'Validation failed.', 'notes' => '']],
  ],
  [
    'group'       => 'Applicant Portal',
    'method'      => 'PUT',
    'path'        => '/api/applicant/academic-records/:id',
    'summary'     => 'Update academic record',
    'description' => 'Update an existing academic history entry. Only records owned by the authenticated applicant can be modified.',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => [
      'fields' => [
        ['name' => 'institution_name', 'type' => 'string', 'required' => true,  'notes' => ''],
        ['name' => 'qualification',    'type' => 'string', 'required' => true,  'notes' => ''],
        ['name' => 'grade',            'type' => 'string', 'required' => true,  'notes' => ''],
        ['name' => 'year_completed',   'type' => 'number', 'required' => true,  'notes' => ''],
        ['name' => 'combination',      'type' => 'string', 'required' => false, 'notes' => ''],
      ],
      'example' => ['institution_name' => 'G.S. Remera Updated', 'qualification' => 'Rwanda Leaving Certificate', 'grade' => '82%', 'year_completed' => 2023],
    ],
    'response' => ['success' => true, 'message' => 'Academic record updated successfully.', 'data' => null],
    'errors'   => [
      ['status' => 404, 'message' => 'Academic record not found.', 'notes' => ''],
      ['status' => 422, 'message' => 'Validation failed.',          'notes' => ''],
    ],
  ],
  [
    'group'       => 'Applicant Portal',
    'method'      => 'DELETE',
    'path'        => '/api/applicant/academic-records/:id',
    'summary'     => 'Delete academic record',
    'description' => 'Remove an academic history entry. The primary record cannot be deleted; promote another record first.',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Academic record deleted successfully.', 'data' => null],
    'errors'      => [
      ['status' => 404, 'message' => 'Academic record not found.',                                                            'notes' => ''],
      ['status' => 422, 'message' => 'Cannot delete the primary academic record. Set another record as primary first.',       'notes' => ''],
    ],
  ],
  [
    'group'       => 'Applicant Portal',
    'method'      => 'POST',
    'path'        => '/api/applicant/academic-records/:id/set-primary',
    'summary'     => 'Set primary academic record',
    'description' => 'Marks the specified record as the primary one used for merit score computation. Clears the flag from any previous primary record.',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Primary academic record updated.', 'data' => null],
    'errors'      => [['status' => 404, 'message' => 'Academic record not found.', 'notes' => '']],
  ],
  [
    'group'       => 'Applicant Portal',
    'method'      => 'GET',
    'path'        => '/api/applicant/documents',
    'summary'     => 'List documents & checklist',
    'description' => 'Returns the full document checklist for the applicant\'s faculty + academic year, with upload status and verification result for each document type. Also returns the overall document_status.',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => [
      'success' => true,
      'message' => 'Documents fetched.',
      'data'    => [
        'application_number' => 'APP-2026-00001',
        'document_status'    => 'incomplete',
        'checklist'          => [
          ['document_type_id' => 1, 'document_name' => 'National ID', 'is_required' => true, 'uploaded' => false, 'verification_status' => null],
          ['document_type_id' => 2, 'document_name' => 'Academic Transcript', 'is_required' => true, 'uploaded' => true, 'verification_status' => 'pending', 'document_id' => 3],
        ],
      ],
    ],
    'errors' => [],
  ],
  [
    'group'       => 'Applicant Portal',
    'method'      => 'POST',
    'path'        => '/api/applicant/documents',
    'summary'     => 'Upload or replace a document',
    'description' => 'Upload a required document. Accepts `multipart/form-data` with fields `document_type_id` + `document` (file). If a document for the same type already exists, it will be replaced. Only allowed when application status is `submitted`, `documents_under_review`, or `documents_rejected`. The overall `document_status` is recalculated automatically.',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => [
      'fields' => [
        ['name' => 'document_type_id', 'type' => 'number', 'required' => true, 'notes' => 'ID from the document checklist'],
        ['name' => 'document',         'type' => 'file',   'required' => true, 'notes' => 'multipart/form-data field'],
      ],
      'example' => null,
    ],
    'response' => [
      'success' => true,
      'message' => 'Document uploaded successfully.',
      'data'    => ['id' => 5, 'document_type_id' => 1, 'document_name' => 'National ID', 'verification_status' => 'pending', 'document_status' => 'under_review'],
    ],
    'errors' => [
      ['status' => 422, 'message' => 'Documents cannot be uploaded at this stage.',                                    'notes' => ''],
      ['status' => 422, 'message' => 'This document type is not required for your faculty and academic year.',          'notes' => ''],
      ['status' => 422, 'message' => 'No document file provided.',                                                     'notes' => ''],
    ],
  ],
  [
    'group'       => 'Applicant Portal',
    'method'      => 'DELETE',
    'path'        => '/api/applicant/documents/:id',
    'summary'     => 'Remove a document',
    'description' => 'Remove a pending or rejected document. Verified documents cannot be removed. The overall `document_status` is recalculated after deletion.',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Document removed successfully.', 'data' => ['document_status' => 'incomplete']],
    'errors'      => [
      ['status' => 404, 'message' => 'Document not found.',              'notes' => ''],
      ['status' => 422, 'message' => 'Verified documents cannot be removed.', 'notes' => ''],
    ],
  ],

  // ── Academics Registry ─────────────────────────────────────────────────────
  [
    'group'       => 'Academics',
    'method'      => 'GET',
    'path'        => '/api/academic/years',
    'summary'     => 'List academic years',
    'description' => '',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Success', 'data' => null],
    'errors'      => [],
  ],
  [
    'group'       => 'Academics',
    'method'      => 'POST',
    'path'        => '/api/academic/years',
    'summary'     => 'Create academic year',
    'description' => '',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Success', 'data' => null],
    'errors'      => [],
  ],
  [
    'group'       => 'Academics',
    'method'      => 'PUT',
    'path'        => '/api/academic/years/:id',
    'summary'     => 'Update academic year',
    'description' => '',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Success', 'data' => null],
    'errors'      => [],
  ],
  [
    'group'       => 'Academics',
    'method'      => 'DELETE',
    'path'        => '/api/academic/years/:id',
    'summary'     => 'Delete academic year',
    'description' => '',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Success', 'data' => null],
    'errors'      => [],
  ],
  [
    'group'       => 'Academics',
    'method'      => 'PATCH',
    'path'        => '/api/academic/years/:id/activate',
    'summary'     => 'Activate academic year',
    'description' => '',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Success', 'data' => null],
    'errors'      => [],
  ],
  [
    'group'       => 'Academics',
    'method'      => 'GET',
    'path'        => '/api/academic/terms',
    'summary'     => 'List academic terms',
    'description' => '',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Success', 'data' => null],
    'errors'      => [],
  ],
  [
    'group'       => 'Academics',
    'method'      => 'POST',
    'path'        => '/api/academic/terms',
    'summary'     => 'Create academic term',
    'description' => '',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Success', 'data' => null],
    'errors'      => [],
  ],
  [
    'group'       => 'Academics',
    'method'      => 'PUT',
    'path'        => '/api/academic/terms/:id',
    'summary'     => 'Update academic term',
    'description' => '',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Success', 'data' => null],
    'errors'      => [],
  ],
  [
    'group'       => 'Academics',
    'method'      => 'DELETE',
    'path'        => '/api/academic/terms/:id',
    'summary'     => 'Delete academic term',
    'description' => '',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Success', 'data' => null],
    'errors'      => [],
  ],
  [
    'group'       => 'Academics',
    'method'      => 'PATCH',
    'path'        => '/api/academic/terms/:id/activate',
    'summary'     => 'Activate academic term',
    'description' => '',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Success', 'data' => null],
    'errors'      => [],
  ],

  // ── Application Portal (Public) ───────────────────────────────────────────
  [
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
  ],
  [
    'group'       => 'Application Portal (Public)',
    'method'      => 'GET',
    'path'        => '/api/portal/faculties',
    'summary'     => 'List faculties',
    'description' => '',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Success', 'data' => null],
    'errors'      => [],
  ],
  [
    'group'       => 'Application Portal (Public)',
    'method'      => 'GET',
    'path'        => '/api/portal/faculties/:faculty_id/programs',
    'summary'     => 'List programs for faculty',
    'description' => '',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Success', 'data' => null],
    'errors'      => [],
  ],
  [
    'group'       => 'Application Portal (Public)',
    'method'      => 'GET',
    'path'        => '/api/portal/faculties/:faculty_id/requirements',
    'summary'     => 'List document requirements',
    'description' => '',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Success', 'data' => null],
    'errors'      => [],
  ],
  [
    'group'       => 'Application Portal (Public)',
    'method'      => 'POST',
    'path'        => '/api/portal/applications',
    'summary'     => 'Submit application',
    'description' => '',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Success', 'data' => null],
    'errors'      => [],
  ],
  [
    'group'       => 'Application Portal (Public)',
    'method'      => 'GET',
    'path'        => '/api/portal/applications/:application_number',
    'summary'     => 'Track application status',
    'description' => '',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Success', 'data' => null],
    'errors'      => [],
  ],
  [
    'group'       => 'Application Portal (Public)',
    'method'      => 'POST',
    'path'        => '/api/portal/applications/:application_number/documents',
    'summary'     => 'Upload document to existing application',
    'description' => '',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Success', 'data' => null],
    'errors'      => [],
  ],
  [
    'group'       => 'Application Portal (Public)',
    'method'      => 'POST',
    'path'        => '/api/portal/applications/:application_number/respond',
    'summary'     => 'Accept or decline admission offer',
    'description' => '',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Success', 'data' => null],
    'errors'      => [],
  ],

  // ── Document Types ────────────────────────────────────────────────────────
  [
    'group'       => 'Admissions Settings',
    'method'      => 'GET',
    'path'        => '/api/admin/document-types',
    'summary'     => 'List document types',
    'description' => '',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Success', 'data' => null],
    'errors'      => [],
  ],
  [
    'group'       => 'Admissions Settings',
    'method'      => 'POST',
    'path'        => '/api/admin/document-types',
    'summary'     => 'Create document type',
    'description' => '',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Success', 'data' => null],
    'errors'      => [],
  ],
  [
    'group'       => 'Admissions Settings',
    'method'      => 'GET',
    'path'        => '/api/admin/document-types/:id',
    'summary'     => 'Show document type',
    'description' => '',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Success', 'data' => null],
    'errors'      => [],
  ],
  [
    'group'       => 'Admissions Settings',
    'method'      => 'PUT',
    'path'        => '/api/admin/document-types/:id',
    'summary'     => 'Update document type',
    'description' => '',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Success', 'data' => null],
    'errors'      => [],
  ],
  [
    'group'       => 'Admissions Settings',
    'method'      => 'DELETE',
    'path'        => '/api/admin/document-types/:id',
    'summary'     => 'Delete document type',
    'description' => '',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Success', 'data' => null],
    'errors'      => [],
  ],

  // ── Admission Requirements ──────────────────────────────────────────────
  [
    'group'       => 'Admissions Settings',
    'method'      => 'GET',
    'path'        => '/api/admin/admission-requirements',
    'summary'     => 'List admission requirements',
    'description' => '',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Success', 'data' => null],
    'errors'      => [],
  ],
  [
    'group'       => 'Admissions Settings',
    'method'      => 'POST',
    'path'        => '/api/admin/admission-requirements',
    'summary'     => 'Create admission requirement',
    'description' => '',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Success', 'data' => null],
    'errors'      => [],
  ],
  [
    'group'       => 'Admissions Settings',
    'method'      => 'POST',
    'path'        => '/api/admin/admission-requirements/copy',
    'summary'     => 'Copy requirements from one year to another',
    'description' => '',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Success', 'data' => null],
    'errors'      => [],
  ],
  [
    'group'       => 'Admissions Settings',
    'method'      => 'GET',
    'path'        => '/api/admin/admission-requirements/faculty/:faculty_id/year/:year_id',
    'summary'     => 'Get requirements for faculty and year',
    'description' => '',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Success', 'data' => null],
    'errors'      => [],
  ],
  [
    'group'       => 'Admissions Settings',
    'method'      => 'GET',
    'path'        => '/api/admin/admission-requirements/:id',
    'summary'     => 'Show admission requirement',
    'description' => '',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Success', 'data' => null],
    'errors'      => [],
  ],
  [
    'group'       => 'Admissions Settings',
    'method'      => 'PUT',
    'path'        => '/api/admin/admission-requirements/:id',
    'summary'     => 'Update admission requirement',
    'description' => '',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Success', 'data' => null],
    'errors'      => [],
  ],
  [
    'group'       => 'Admissions Settings',
    'method'      => 'DELETE',
    'path'        => '/api/admin/admission-requirements/:id',
    'summary'     => 'Delete admission requirement',
    'description' => '',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Success', 'data' => null],
    'errors'      => [],
  ],

  // ── Application Management ──────────────────────────────────────────────
  [
    'group'       => 'Admissions',
    'method'      => 'GET',
    'path'        => '/api/admin/applications',
    'summary'     => 'List all student applications',
    'description' => '',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Success', 'data' => null],
    'errors'      => [],
  ],
  [
    'group'       => 'Admissions',
    'method'      => 'GET',
    'path'        => '/api/admin/applications/:id',
    'summary'     => 'Show full application details',
    'description' => '',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Success', 'data' => null],
    'errors'      => [],
  ],
  [
    'group'       => 'Admissions',
    'method'      => 'PATCH',
    'path'        => '/api/admin/applications/:id/status',
    'summary'     => 'Update application status',
    'description' => '',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Success', 'data' => null],
    'errors'      => [],
  ],
  [
    'group'       => 'Admissions',
    'method'      => 'POST',
    'path'        => '/api/admin/applications/:id/notes',
    'summary'     => 'Add internal notes to application',
    'description' => '',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Success', 'data' => null],
    'errors'      => [],
  ],

  // ── Document Verification ───────────────────────────────────────────────
  [
    'group'       => 'Admissions',
    'method'      => 'GET',
    'path'        => '/api/admin/verifications',
    'summary'     => 'List applications pending document verification',
    'description' => '',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Success', 'data' => null],
    'errors'      => [],
  ],
  [
    'group'       => 'Admissions',
    'method'      => 'GET',
    'path'        => '/api/admin/verifications/:application_id/documents',
    'summary'     => 'Get documents for verification',
    'description' => '',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Success', 'data' => null],
    'errors'      => [],
  ],
  [
    'group'       => 'Admissions',
    'method'      => 'PATCH',
    'path'        => '/api/admin/verifications/:application_id/documents/:document_id',
    'summary'     => 'Verify or reject individual document',
    'description' => '',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Success', 'data' => null],
    'errors'      => [],
  ],
  [
    'group'       => 'Admissions',
    'method'      => 'GET',
    'path'        => '/api/admin/verifications/:application_id/documents/:document_id/download',
    'summary'     => 'Download document file',
    'description' => '',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Success', 'data' => null],
    'errors'      => [],
  ],

  // ── Merit List Management ───────────────────────────────────────────────
  [
    'group'       => 'Admissions',
    'method'      => 'GET',
    'path'        => '/api/admin/merit/criteria',
    'summary'     => 'Get merit calculation criteria',
    'description' => '',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Success', 'data' => null],
    'errors'      => [],
  ],
  [
    'group'       => 'Admissions',
    'method'      => 'POST',
    'path'        => '/api/admin/merit/criteria',
    'summary'     => 'Save merit criteria',
    'description' => '',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Success', 'data' => null],
    'errors'      => [],
  ],
  [
    'group'       => 'Admissions',
    'method'      => 'POST',
    'path'        => '/api/admin/merit/generate',
    'summary'     => 'Trigger merit list generation',
    'description' => '',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Success', 'data' => null],
    'errors'      => [],
  ],
  [
    'group'       => 'Admissions',
    'method'      => 'GET',
    'path'        => '/api/admin/merit/list',
    'summary'     => 'List generated merit list rankings',
    'description' => '',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Success', 'data' => null],
    'errors'      => [],
  ],
  [
    'group'       => 'Admissions',
    'method'      => 'PATCH',
    'path'        => '/api/admin/merit/publish',
    'summary'     => 'Publish merit list results',
    'description' => '',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Success', 'data' => null],
    'errors'      => [],
  ],

  // ── Admission Offers ────────────────────────────────────────────────────
  [
    'group'       => 'Admissions',
    'method'      => 'GET',
    'path'        => '/api/admin/admissions/offers',
    'summary'     => 'List admission offers',
    'description' => '',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Success', 'data' => null],
    'errors'      => [],
  ],
  [
    'group'       => 'Admissions',
    'method'      => 'POST',
    'path'        => '/api/admin/admissions/offers',
    'summary'     => 'Create individual offer',
    'description' => '',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Success', 'data' => null],
    'errors'      => [],
  ],
  [
    'group'       => 'Admissions',
    'method'      => 'POST',
    'path'        => '/api/admin/admissions/offers/bulk',
    'summary'     => 'Bulk create offers from a generated merit list',
    'description' => '',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Success', 'data' => null],
    'errors'      => [],
  ],
  [
    'group'       => 'Admissions',
    'method'      => 'GET',
    'path'        => '/api/admin/admissions/offers/:offer_id',
    'summary'     => 'Get specific offer details',
    'description' => '',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Success', 'data' => null],
    'errors'      => [],
  ],
  [
    'group'       => 'Admissions',
    'method'      => 'POST',
    'path'        => '/api/admin/admissions/offers/:offer_id/enroll',
    'summary'     => 'Convert accepted application into enrolled student record',
    'description' => '',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Success', 'data' => null],
    'errors'      => [],
  ],

  // ── User Management (cont.) ──────────────────────────────────────────
  [
    'group'       => 'User Management',
    'method'      => 'GET',
    'path'        => '/api/users/:id',
    'summary'     => 'Show single user details',
    'description' => 'Returns the full profile for a specific user including role name.',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'User details fetched.', 'data' => ['id' => 1, 'full_name' => 'Alice Doe', 'email' => 'alice@example.com', 'role_id' => 1, 'role_name' => 'admin', 'is_active' => 1]],
    'errors'      => [['status' => 404, 'message' => 'User not found.', 'notes' => '']],
  ],
  [
    'group'       => 'User Management',
    'method'      => 'DELETE',
    'path'        => '/api/users/:id',
    'summary'     => 'Delete a user',
    'description' => 'Permanently removes a user account. Requires `MANAGE_USERS` permission. A user cannot delete their own account.',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'User deleted successfully.', 'data' => null],
    'errors'      => [
      ['status' => 403, 'message' => 'You cannot delete your own account.', 'notes' => ''],
      ['status' => 404, 'message' => 'User not found.',                     'notes' => ''],
    ],
  ],

  // ── Student Registry (cont.) ──────────────────────────────────────────
  [
    'group'       => 'Student Registry',
    'method'      => 'GET',
    'path'        => '/api/students/:id',
    'summary'     => 'Show single student details',
    'description' => 'Returns the full student record for the given ID.',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Student details fetched.', 'data' => ['id' => 1, 'regnumber' => 'CUR/2026/00001', 'fname' => 'Jean', 'lname' => 'Uwimana']],
    'errors'      => [['status' => 404, 'message' => 'Student not found.', 'notes' => '']],
  ],
  [
    'group'       => 'Student Registry',
    'method'      => 'POST',
    'path'        => '/api/students',
    'summary'     => 'Create a new student record',
    'description' => 'Registers a new student. `regnumber` is auto-generated if omitted. Requires `MANAGE_STUDENTS` permission.',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => [
      'fields' => [
        ['name' => 'fname',             'type' => 'string', 'required' => true,  'notes' => 'First name'],
        ['name' => 'lname',             'type' => 'string', 'required' => true,  'notes' => 'Last name'],
        ['name' => 'faculty',           'type' => 'string', 'required' => true,  'notes' => 'Faculty ID or code'],
        ['name' => 'regnumber',         'type' => 'string', 'required' => false, 'notes' => 'Auto-generated if omitted'],
        ['name' => 'phone',             'type' => 'string', 'required' => false, 'notes' => ''],
        ['name' => 'email',             'type' => 'string', 'required' => false, 'notes' => ''],
        ['name' => 'gender',            'type' => 'string', 'required' => false, 'notes' => 'M / F'],
        ['name' => 'birthdate',         'type' => 'string', 'required' => false, 'notes' => 'YYYY-MM-DD'],
        ['name' => 'nationality',       'type' => 'string', 'required' => false, 'notes' => 'Defaults to Rwandan'],
        ['name' => 'program',           'type' => 'string', 'required' => false, 'notes' => ''],
        ['name' => 'department',        'type' => 'string', 'required' => false, 'notes' => ''],
        ['name' => 'current_level',     'type' => 'string', 'required' => false, 'notes' => ''],
        ['name' => 'registration_date', 'type' => 'string', 'required' => false, 'notes' => 'Defaults to today'],
        ['name' => 'student_state',     'type' => 'string', 'required' => false, 'notes' => 'Defaults to active'],
      ],
      'example' => ['fname' => 'Jean', 'lname' => 'Uwimana', 'faculty' => '1', 'email' => 'jean@example.com', 'gender' => 'M'],
    ],
    'response'    => ['success' => true, 'message' => 'Student created successfully.', 'data' => ['id' => 42]],
    'errors'      => [
      ['status' => 422, 'message' => 'Validation failed.', 'notes' => 'fname, lname, and faculty are required'],
      ['status' => 403, 'message' => 'Forbidden.',         'notes' => 'Requires MANAGE_STUDENTS permission'],
    ],
  ],
  [
    'group'       => 'Student Registry',
    'method'      => 'PUT',
    'path'        => '/api/students/:id',
    'summary'     => 'Update a student record',
    'description' => 'Updates all editable fields of a student record. Requires `MANAGE_STUDENTS` permission.',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => [
      'fields' => [
        ['name' => 'fname',             'type' => 'string', 'required' => true,  'notes' => ''],
        ['name' => 'lname',             'type' => 'string', 'required' => true,  'notes' => ''],
        ['name' => 'faculty',           'type' => 'string', 'required' => true,  'notes' => ''],
        ['name' => 'regnumber',         'type' => 'string', 'required' => false, 'notes' => ''],
        ['name' => 'phone',             'type' => 'string', 'required' => false, 'notes' => ''],
        ['name' => 'email',             'type' => 'string', 'required' => false, 'notes' => ''],
        ['name' => 'gender',            'type' => 'string', 'required' => false, 'notes' => ''],
        ['name' => 'birthdate',         'type' => 'string', 'required' => false, 'notes' => ''],
        ['name' => 'nationality',       'type' => 'string', 'required' => false, 'notes' => ''],
        ['name' => 'program',           'type' => 'string', 'required' => false, 'notes' => ''],
        ['name' => 'department',        'type' => 'string', 'required' => false, 'notes' => ''],
        ['name' => 'current_level',     'type' => 'string', 'required' => false, 'notes' => ''],
        ['name' => 'registration_date', 'type' => 'string', 'required' => false, 'notes' => ''],
        ['name' => 'student_state',     'type' => 'string', 'required' => false, 'notes' => 'active / inactive'],
      ],
      'example' => ['fname' => 'Jean', 'lname' => 'Uwimana', 'faculty' => '1', 'current_level' => 'Year 2'],
    ],
    'response'    => ['success' => true, 'message' => 'Student updated successfully.', 'data' => null],
    'errors'      => [
      ['status' => 404, 'message' => 'Student not found.', 'notes' => ''],
      ['status' => 422, 'message' => 'Validation failed.', 'notes' => ''],
    ],
  ],
  [
    'group'       => 'Student Registry',
    'method'      => 'DELETE',
    'path'        => '/api/students/:id',
    'summary'     => 'Delete a student record',
    'description' => 'Permanently removes a student record. Requires `MANAGE_STUDENTS` permission.',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Student deleted successfully.', 'data' => null],
    'errors'      => [['status' => 404, 'message' => 'Student not found.', 'notes' => '']],
  ],

  // ── HR Management (cont.) ─────────────────────────────────────────────
  [
    'group'       => 'HR Management',
    'method'      => 'GET',
    'path'        => '/api/employees/:id',
    'summary'     => 'Show HR employee details',
    'description' => 'Returns the full record for a single HR employee.',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Employee details fetched.', 'data' => ['id' => 1, 'emp_code' => 'EMP-001', 'full_name' => 'Alice Doe', 'status' => 'Active']],
    'errors'      => [['status' => 404, 'message' => 'Employee not found.', 'notes' => '']],
  ],
  [
    'group'       => 'HR Management',
    'method'      => 'POST',
    'path'        => '/api/employees',
    'summary'     => 'Create a new HR employee',
    'description' => 'Registers a new employee in the HR system. Requires `MANAGE_HR_EMPLOYEES` permission.',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => [
      'fields' => [
        ['name' => 'emp_code',      'type' => 'string',  'required' => true,  'notes' => 'Unique employee code e.g. EMP-001'],
        ['name' => 'full_name',     'type' => 'string',  'required' => true,  'notes' => ''],
        ['name' => 'gender',        'type' => 'string',  'required' => true,  'notes' => 'M or F'],
        ['name' => 'department',    'type' => 'string',  'required' => true,  'notes' => ''],
        ['name' => 'position',      'type' => 'string',  'required' => true,  'notes' => ''],
        ['name' => 'contract_type', 'type' => 'string',  'required' => true,  'notes' => 'Permanent | Temporal | Part-time'],
        ['name' => 'start_date',    'type' => 'string',  'required' => true,  'notes' => 'YYYY-MM-DD'],
        ['name' => 'salary',        'type' => 'number',  'required' => true,  'notes' => ''],
        ['name' => 'staff_id',      'type' => 'number',  'required' => false, 'notes' => 'Link to legacy staff record'],
        ['name' => 'end_date',      'type' => 'string',  'required' => false, 'notes' => 'YYYY-MM-DD — null for open contracts'],
        ['name' => 'phone',         'type' => 'string',  'required' => false, 'notes' => ''],
        ['name' => 'email',         'type' => 'string',  'required' => false, 'notes' => ''],
        ['name' => 'status',        'type' => 'string',  'required' => false, 'notes' => 'Active | Inactive | Terminated — defaults to Active'],
      ],
      'example' => ['emp_code' => 'EMP-042', 'full_name' => 'Bob Mugisha', 'gender' => 'M', 'department' => 'Computer Science', 'position' => 'Lecturer', 'contract_type' => 'Permanent', 'start_date' => '2026-01-15', 'salary' => 850000],
    ],
    'response'    => ['success' => true, 'message' => 'Employee created successfully.', 'data' => ['id' => 42]],
    'errors'      => [
      ['status' => 409, 'message' => 'Employee code already in use.',  'notes' => ''],
      ['status' => 422, 'message' => 'Validation failed.',              'notes' => ''],
      ['status' => 403, 'message' => 'Forbidden.',                     'notes' => 'Requires MANAGE_HR_EMPLOYEES permission'],
    ],
  ],
  [
    'group'       => 'HR Management',
    'method'      => 'PUT',
    'path'        => '/api/employees/:id',
    'summary'     => 'Update an HR employee',
    'description' => 'Updates all editable fields of an employee record. Requires `MANAGE_HR_EMPLOYEES` permission.',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => [
      'fields' => [
        ['name' => 'emp_code',      'type' => 'string',  'required' => true,  'notes' => ''],
        ['name' => 'full_name',     'type' => 'string',  'required' => true,  'notes' => ''],
        ['name' => 'gender',        'type' => 'string',  'required' => true,  'notes' => 'M or F'],
        ['name' => 'department',    'type' => 'string',  'required' => true,  'notes' => ''],
        ['name' => 'position',      'type' => 'string',  'required' => true,  'notes' => ''],
        ['name' => 'contract_type', 'type' => 'string',  'required' => true,  'notes' => ''],
        ['name' => 'start_date',    'type' => 'string',  'required' => true,  'notes' => ''],
        ['name' => 'salary',        'type' => 'number',  'required' => true,  'notes' => ''],
        ['name' => 'end_date',      'type' => 'string',  'required' => false, 'notes' => ''],
        ['name' => 'phone',         'type' => 'string',  'required' => false, 'notes' => ''],
        ['name' => 'email',         'type' => 'string',  'required' => false, 'notes' => ''],
        ['name' => 'status',        'type' => 'string',  'required' => false, 'notes' => 'Active | Inactive | Terminated'],
      ],
      'example' => ['emp_code' => 'EMP-042', 'full_name' => 'Bob Mugisha', 'gender' => 'M', 'department' => 'ICT', 'position' => 'Senior Lecturer', 'contract_type' => 'Permanent', 'start_date' => '2026-01-15', 'salary' => 950000],
    ],
    'response'    => ['success' => true, 'message' => 'Employee updated successfully.', 'data' => null],
    'errors'      => [
      ['status' => 404, 'message' => 'Employee not found.',            'notes' => ''],
      ['status' => 409, 'message' => 'Employee code already in use.', 'notes' => ''],
      ['status' => 422, 'message' => 'Validation failed.',             'notes' => ''],
    ],
  ],
  [
    'group'       => 'HR Management',
    'method'      => 'PATCH',
    'path'        => '/api/employees/:id/toggle-status',
    'summary'     => 'Toggle employee active status',
    'description' => 'Flips an employee\'s status between `Active` and `Inactive`. Requires `MANAGE_HR_EMPLOYEES` permission.',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Employee status updated.', 'data' => ['status' => 'Inactive']],
    'errors'      => [['status' => 404, 'message' => 'Employee not found.', 'notes' => '']],
  ],
  [
    'group'       => 'HR Management',
    'method'      => 'DELETE',
    'path'        => '/api/employees/:id',
    'summary'     => 'Delete an HR employee',
    'description' => 'Permanently removes an employee record. Requires `MANAGE_HR_EMPLOYEES` permission.',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Employee deleted successfully.', 'data' => null],
    'errors'      => [['status' => 404, 'message' => 'Employee not found.', 'notes' => '']],
  ],
  [
    'group'       => 'Role Management',
    'method'      => 'GET',
    'path'        => '/api/roles/:id',
    'summary'     => 'Show specific role',
    'description' => '',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Success', 'data' => null],
    'errors'      => [],
  ],
  [
    'group'       => 'Role Management',
    'method'      => 'PUT',
    'path'        => '/api/roles/:id',
    'summary'     => 'Update specific role',
    'description' => '',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Success', 'data' => null],
    'errors'      => [],
  ],
  [
    'group'       => 'Role Management',
    'method'      => 'DELETE',
    'path'        => '/api/roles/:id',
    'summary'     => 'Delete specific role',
    'description' => '',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Success', 'data' => null],
    'errors'      => [],
  ],
  [
    'group'       => 'Role Management',
    'method'      => 'POST',
    'path'        => '/api/roles/:id/permissions',
    'summary'     => 'Assign permissions to an existing role',
    'description' => '',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => null,
    'response'    => ['success' => true, 'message' => 'Success', 'data' => null],
    'errors'      => [],
  ],

  // ── Modules — Catalog ─────────────────────────────────────────────────────
  [
    'group'       => 'Modules — Catalog',
    'method'      => 'GET',
    'path'        => '/api/modules',
    'summary'     => 'List modules (paginated)',
    'description' => 'Returns the module catalog with their prerequisites. Filterable by `department`, `level`, `status`, and free-text `q` over module_code / module_name. Accessible to users with MANAGE_MODULES or VIEW_MY_MODULES.',
    'auth'        => true,
    'rateLimit'   => false,
    'request'     => [
      'fields' => [
        ['name' => 'page',       'type' => 'integer', 'required' => false, 'notes' => 'Default 1'],
        ['name' => 'per_page',   'type' => 'integer', 'required' => false, 'notes' => 'Max 100, default 20'],
        ['name' => 'department', 'type' => 'integer', 'required' => false, 'notes' => ''],
        ['name' => 'level',      'type' => 'integer', 'required' => false, 'notes' => ''],
        ['name' => 'status',     'type' => 'string',  'required' => false, 'notes' => 'draft | active | archived'],
        ['name' => 'q',          'type' => 'string',  'required' => false, 'notes' => 'Substring match on code/name'],
      ],
      'example' => ['page' => 1, 'per_page' => 20, 'level' => 1],
    ],
    'response'    => [
      'success' => true,
      'message' => 'Modules fetched.',
      'data' => [
        'data' => [['module_id' => 1, 'module_code' => 'CS101', 'module_name' => 'Intro to CS', 'module_credits' => 6, 'prerequisites' => []]],
        'total' => 42, 'per_page' => 20, 'current_page' => 1, 'last_page' => 3,
      ],
    ],
    'errors' => [['status' => 401, 'message' => 'Unauthenticated.'], ['status' => 403, 'message' => 'Forbidden.']],
  ],
  [
    'group'       => 'Modules — Catalog',
    'method'      => 'GET',
    'path'        => '/api/modules/:id',
    'summary'     => 'Get one module with prerequisites',
    'description' => 'Fetches a single module by primary key; `prerequisites` is an array of { id, module_code, module_name } objects.',
    'auth'        => true, 'rateLimit' => false, 'request' => null,
    'response' => ['success' => true, 'message' => 'Module fetched.', 'data' => ['module_id' => 1, 'module_code' => 'CS101', 'prerequisites' => []]],
    'errors' => [['status' => 404, 'message' => 'Module not found.']],
  ],
  [
    'group'       => 'Modules — Catalog',
    'method'      => 'POST',
    'path'        => '/api/modules',
    'summary'     => 'Create a module',
    'description' => 'Creates a catalog entry. Pass `prerequisite_ids` to wire prerequisites in one shot. Requires MANAGE_MODULES.',
    'auth'        => true, 'rateLimit' => false,
    'request' => [
      'fields' => [
        ['name' => 'module_name',       'type' => 'string',  'required' => true,  'notes' => 'min 3 chars'],
        ['name' => 'module_code',       'type' => 'string',  'required' => true,  'notes' => 'Must be unique'],
        ['name' => 'module_credits',    'type' => 'number',  'required' => true,  'notes' => ''],
        ['name' => 'department',        'type' => 'integer', 'required' => true,  'notes' => 'Department id'],
        ['name' => 'level',             'type' => 'integer', 'required' => true,  'notes' => 'Year/level id'],
        ['name' => 'description',       'type' => 'string',  'required' => false, 'notes' => ''],
        ['name' => 'status',            'type' => 'string',  'required' => false, 'notes' => 'draft | active | archived (default active)'],
        ['name' => 'prerequisite_ids',  'type' => 'integer[]','required' => false, 'notes' => 'Other module_ids this one depends on'],
      ],
      'example' => ['module_name' => 'Algorithms', 'module_code' => 'CS201', 'module_credits' => 6, 'department' => 2, 'level' => 2, 'prerequisite_ids' => [1]],
    ],
    'response' => ['success' => true, 'message' => 'Module created.', 'data' => ['module_id' => 12]],
    'errors' => [['status' => 409, 'message' => 'module_code already exists.'], ['status' => 422, 'message' => 'Validation failed.']],
  ],
  [
    'group'       => 'Modules — Catalog',
    'method'      => 'PUT',
    'path'        => '/api/modules/:id',
    'summary'     => 'Update a module',
    'description' => 'Partial update. If `prerequisite_ids` is present, the prerequisite set is fully replaced.',
    'auth'        => true, 'rateLimit' => false, 'request' => null,
    'response' => ['success' => true, 'message' => 'Module updated.', 'data' => null],
    'errors' => [['status' => 404, 'message' => 'Module not found.']],
  ],
  [
    'group'       => 'Modules — Catalog',
    'method'      => 'DELETE',
    'path'        => '/api/modules/:id',
    'summary'     => 'Delete a module',
    'description' => 'Cascades to prerequisites, assignments, schedules, and registrations.',
    'auth'        => true, 'rateLimit' => false, 'request' => null,
    'response' => ['success' => true, 'message' => 'Module deleted.', 'data' => null],
    'errors' => [['status' => 404, 'message' => 'Module not found.']],
  ],

  // ── Modules — Scheduling ─────────────────────────────────────────────────
  [
    'group'       => 'Modules — Scheduling',
    'method'      => 'GET',
    'path'        => '/api/modules/schedules',
    'summary'     => 'List schedule entries',
    'description' => 'Lists weekly schedule entries joined with module + room + staff context. Filter by `term_id`, `module_id`, `room_id`, `staff_id`.',
    'auth'        => true, 'rateLimit' => false,
    'request' => [
      'fields' => [
        ['name' => 'term_id',   'type' => 'integer', 'required' => false, 'notes' => ''],
        ['name' => 'module_id', 'type' => 'integer', 'required' => false, 'notes' => ''],
        ['name' => 'room_id',   'type' => 'integer', 'required' => false, 'notes' => ''],
        ['name' => 'staff_id',  'type' => 'integer', 'required' => false, 'notes' => 'Matches via module_assignment_id'],
      ],
    ],
    'response' => ['success' => true, 'message' => 'Schedules fetched.', 'data' => []],
    'errors'   => [],
  ],
  [
    'group'       => 'Modules — Scheduling',
    'method'      => 'POST',
    'path'        => '/api/modules/schedules/check-conflicts',
    'summary'     => 'Dry-run conflict check for a schedule draft',
    'description' => 'Returns `{ conflicts: [{type:"room"|"faculty", conflict_with:{...}}] }` without persisting. Pass `ignore_id` to exclude a specific entry during updates.',
    'auth'        => true, 'rateLimit' => false,
    'request' => [
      'fields' => [
        ['name' => 'module_id',            'type' => 'integer', 'required' => true,  'notes' => ''],
        ['name' => 'academic_term_id',     'type' => 'integer', 'required' => true,  'notes' => ''],
        ['name' => 'room_id',              'type' => 'integer', 'required' => true,  'notes' => ''],
        ['name' => 'day_of_week',          'type' => 'integer', 'required' => true,  'notes' => '1 (Mon) … 7 (Sun)'],
        ['name' => 'start_time',           'type' => 'string',  'required' => true,  'notes' => 'HH:MM:SS'],
        ['name' => 'end_time',             'type' => 'string',  'required' => true,  'notes' => 'HH:MM:SS'],
        ['name' => 'module_assignment_id', 'type' => 'integer', 'required' => false, 'notes' => 'Required for faculty conflict detection'],
        ['name' => 'ignore_id',            'type' => 'integer', 'required' => false, 'notes' => 'Schedule id to exclude (on update)'],
      ],
    ],
    'response' => ['success' => true, 'message' => 'Conflict scan complete.', 'data' => ['conflicts' => []]],
    'errors'   => [['status' => 422, 'message' => 'Validation failed.']],
  ],
  [
    'group'       => 'Modules — Scheduling',
    'method'      => 'POST',
    'path'        => '/api/modules/schedules',
    'summary'     => 'Create a schedule entry',
    'description' => 'Runs conflict detection first; responds 409 with the `conflicts` list if any are found.',
    'auth'        => true, 'rateLimit' => false, 'request' => null,
    'response' => ['success' => true, 'message' => 'Schedule created.', 'data' => ['id' => 5]],
    'errors' => [['status' => 409, 'message' => 'Schedule conflicts detected.']],
  ],
  [
    'group'       => 'Modules — Scheduling',
    'method'      => 'PUT',
    'path'        => '/api/modules/schedules/:id',
    'summary'     => 'Update a schedule entry',
    'description' => 'Re-runs conflict detection excluding itself.',
    'auth'        => true, 'rateLimit' => false, 'request' => null,
    'response' => ['success' => true, 'message' => 'Schedule updated.', 'data' => null],
    'errors' => [['status' => 409, 'message' => 'Schedule conflicts detected.']],
  ],
  [
    'group'       => 'Modules — Scheduling',
    'method'      => 'DELETE',
    'path'        => '/api/modules/schedules/:id',
    'summary'     => 'Delete a schedule entry',
    'description' => '',
    'auth'        => true, 'rateLimit' => false, 'request' => null,
    'response' => ['success' => true, 'message' => 'Schedule deleted.', 'data' => null],
    'errors' => [['status' => 404, 'message' => 'Schedule not found.']],
  ],

  // ── Modules — Assignments ────────────────────────────────────────────────
  [
    'group'       => 'Modules — Assignments',
    'method'      => 'GET',
    'path'        => '/api/modules/assignments',
    'summary'     => 'List faculty-to-module assignments',
    'description' => 'Joined with module + staff + term. Filterable by `term_id`, `staff_id`, `module_id`.',
    'auth'        => true, 'rateLimit' => false, 'request' => null,
    'response' => ['success' => true, 'message' => 'Assignments fetched.', 'data' => []],
    'errors'   => [],
  ],
  [
    'group'       => 'Modules — Assignments',
    'method'      => 'GET',
    'path'        => '/api/modules/assignments/workload',
    'summary'     => 'Workload roll-up per staff for a term',
    'description' => 'Returns `{ staff_id, staff_name, module_count, total_hours }` for every assigned staff member in the term. Use `term_id` query param.',
    'auth'        => true, 'rateLimit' => false, 'request' => null,
    'response' => ['success' => true, 'message' => 'Workload summary fetched.', 'data' => [['staff_id' => 7, 'staff_name' => 'Dr. X', 'module_count' => 3, 'total_hours' => 12.0]]],
    'errors' => [['status' => 422, 'message' => 'term_id is required.']],
  ],
  [
    'group'       => 'Modules — Assignments',
    'method'      => 'POST',
    'path'        => '/api/modules/assignments',
    'summary'     => 'Assign a faculty member to a module',
    'description' => 'Unique per (module, staff, term).',
    'auth'        => true, 'rateLimit' => false,
    'request' => [
      'fields' => [
        ['name' => 'module_id',        'type' => 'integer', 'required' => true,  'notes' => ''],
        ['name' => 'staff_id',         'type' => 'integer', 'required' => true,  'notes' => 'hr_employees.id'],
        ['name' => 'academic_year_id', 'type' => 'integer', 'required' => true,  'notes' => ''],
        ['name' => 'academic_term_id', 'type' => 'integer', 'required' => true,  'notes' => ''],
        ['name' => 'role',             'type' => 'string',  'required' => false, 'notes' => 'primary | assistant (default primary)'],
        ['name' => 'hours_per_week',   'type' => 'number',  'required' => false, 'notes' => ''],
        ['name' => 'notes',            'type' => 'string',  'required' => false, 'notes' => ''],
      ],
    ],
    'response' => ['success' => true, 'message' => 'Assignment created.', 'data' => ['id' => 5]],
    'errors' => [['status' => 409, 'message' => 'This staff member is already assigned to this module in this term.']],
  ],
  [
    'group'       => 'Modules — Assignments',
    'method'      => 'PUT',
    'path'        => '/api/modules/assignments/:id',
    'summary'     => 'Update an assignment',
    'description' => '',
    'auth'        => true, 'rateLimit' => false, 'request' => null,
    'response' => ['success' => true, 'message' => 'Assignment updated.', 'data' => null],
    'errors' => [['status' => 404, 'message' => 'Assignment not found.']],
  ],
  [
    'group'       => 'Modules — Assignments',
    'method'      => 'DELETE',
    'path'        => '/api/modules/assignments/:id',
    'summary'     => 'Remove an assignment',
    'description' => '',
    'auth'        => true, 'rateLimit' => false, 'request' => null,
    'response' => ['success' => true, 'message' => 'Assignment deleted.', 'data' => null],
    'errors' => [['status' => 404, 'message' => 'Assignment not found.']],
  ],

  // ── Modules — Registrations (admin) ──────────────────────────────────────
  [
    'group'       => 'Modules — Registrations',
    'method'      => 'GET',
    'path'        => '/api/modules/registrations',
    'summary'     => 'List all student registrations (admin)',
    'description' => 'Filter by `term_id`, `module_id`, `regnumber`, `status`.',
    'auth'        => true, 'rateLimit' => false, 'request' => null,
    'response' => ['success' => true, 'message' => 'Registrations fetched.', 'data' => []],
    'errors'   => [],
  ],
  [
    'group'       => 'Modules — Registrations',
    'method'      => 'POST',
    'path'        => '/api/modules/registrations',
    'summary'     => 'Register a student (admin)',
    'description' => 'Admins may override eligibility checks by passing `force: true` in the body.',
    'auth'        => true, 'rateLimit' => false,
    'request' => [
      'fields' => [
        ['name' => 'module_id',         'type' => 'integer', 'required' => true,  'notes' => ''],
        ['name' => 'student_regnumber', 'type' => 'string',  'required' => true,  'notes' => ''],
        ['name' => 'academic_term_id',  'type' => 'integer', 'required' => true,  'notes' => ''],
        ['name' => 'status',            'type' => 'string',  'required' => false, 'notes' => 'registered | dropped | completed | failed'],
        ['name' => 'grade',             'type' => 'string',  'required' => false, 'notes' => ''],
        ['name' => 'force',             'type' => 'boolean', 'required' => false, 'notes' => 'Bypass eligibility checks'],
      ],
    ],
    'response' => ['success' => true, 'message' => 'Student registered.', 'data' => ['id' => 17]],
    'errors' => [
      ['status' => 409, 'message' => 'Student is already registered for this module in this term.'],
      ['status' => 422, 'message' => 'Prerequisites not satisfied.'],
    ],
  ],
  [
    'group'       => 'Modules — Registrations',
    'method'      => 'PUT',
    'path'        => '/api/modules/registrations/:id',
    'summary'     => 'Update a registration (status / grade)',
    'description' => 'Setting status=dropped automatically stamps `dropped_at`.',
    'auth'        => true, 'rateLimit' => false, 'request' => null,
    'response' => ['success' => true, 'message' => 'Registration updated.', 'data' => null],
    'errors' => [['status' => 404, 'message' => 'Registration not found.']],
  ],
  [
    'group'       => 'Modules — Registrations',
    'method'      => 'DELETE',
    'path'        => '/api/modules/registrations/:id',
    'summary'     => 'Delete a registration',
    'description' => '',
    'auth'        => true, 'rateLimit' => false, 'request' => null,
    'response' => ['success' => true, 'message' => 'Registration deleted.', 'data' => null],
    'errors' => [['status' => 404, 'message' => 'Registration not found.']],
  ],

  // ── Modules — Student self-service ───────────────────────────────────────
  [
    'group'       => 'Modules — Student self-service',
    'method'      => 'GET',
    'path'        => '/api/modules/my/eligible',
    'summary'     => 'List modules I am eligible to register for',
    'description' => 'Filters by the authenticated student\'s department + current_level, excludes modules where prerequisites are not yet completed, and excludes modules already registered in the given term. Requires VIEW_MY_MODULES.',
    'auth'        => true, 'rateLimit' => false,
    'request' => [
      'fields' => [['name' => 'term_id', 'type' => 'integer', 'required' => true, 'notes' => 'Target academic term']],
    ],
    'response' => ['success' => true, 'message' => 'Eligible modules fetched.', 'data' => []],
    'errors' => [['status' => 422, 'message' => 'term_id is required.']],
  ],
  [
    'group'       => 'Modules — Student self-service',
    'method'      => 'GET',
    'path'        => '/api/modules/my/registrations',
    'summary'     => 'List my registrations',
    'description' => 'Optional `term_id` query filter.',
    'auth'        => true, 'rateLimit' => false, 'request' => null,
    'response' => ['success' => true, 'message' => 'My registrations fetched.', 'data' => []],
    'errors'   => [],
  ],
  [
    'group'       => 'Modules — Student self-service',
    'method'      => 'POST',
    'path'        => '/api/modules/my/register',
    'summary'     => 'Self-register for a module',
    'description' => 'Enforces eligibility + schedule-clash detection against other currently-registered modules.',
    'auth'        => true, 'rateLimit' => false,
    'request' => [
      'fields' => [
        ['name' => 'module_id',        'type' => 'integer', 'required' => true, 'notes' => ''],
        ['name' => 'academic_term_id', 'type' => 'integer', 'required' => true, 'notes' => ''],
      ],
    ],
    'response' => ['success' => true, 'message' => 'Registered.', 'data' => ['id' => 9]],
    'errors' => [
      ['status' => 409, 'message' => 'Already registered or schedule conflict.'],
      ['status' => 422, 'message' => 'Prerequisites not satisfied.'],
    ],
  ],
  [
    'group'       => 'Modules — Student self-service',
    'method'      => 'POST',
    'path'        => '/api/modules/my/drop/:id',
    'summary'     => 'Drop one of my registrations',
    'description' => 'Soft-sets status=dropped. Only works on registrations owned by the authenticated student and currently in `registered` status.',
    'auth'        => true, 'rateLimit' => false, 'request' => null,
    'response' => ['success' => true, 'message' => 'Registration dropped.', 'data' => null],
    'errors' => [
      ['status' => 403, 'message' => 'You can only drop your own registrations.'],
      ['status' => 422, 'message' => 'Only active registrations can be dropped.'],
    ],
  ],

];

// Group routes by category
$groups = [];
foreach ($routes as $route) {
  $groups[$route['group']][] = $route;
}

$methodColors = [
  'GET' => '#22c55e',
  'POST' => '#3b82f6',
  'PUT' => '#f59e0b',
  'PATCH' => '#8b5cf6',
  'DELETE' => '#ef4444',
];

function badge(string $method, array $colors): string
{
  $bg = $colors[$method] ?? '#6b7280';
  return "<span class=\"method-badge\" style=\"background:{$bg}\">{$method}</span>";
}
?>
<!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title><?= htmlspecialchars($appName) ?> — API Docs v<?= htmlspecialchars($version) ?></title>
  <style>
    *,
    *::before,
    *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    :root {
      --bg: #0f172a;
      --surface: #1e293b;
      --border: #334155;
      --text: #f1f5f9;
      --muted: #94a3b8;
      --accent: #3b82f6;
      --success: #22c55e;
      --warning: #f59e0b;
      --error: #ef4444;
      --radius: 10px;
      --mono: 'JetBrains Mono', 'Fira Code', monospace;
    }

    body {
      font-family: 'Inter', system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      font-size: 14px;
    }

    /* ── Layout ──────────────────────────────────────────────── */
    .layout {
      display: flex;
      min-height: 100vh;
    }

    .sidebar {
      width: 260px;
      flex-shrink: 0;
      background: var(--surface);
      border-right: 1px solid var(--border);
      padding: 24px 0;
      position: sticky;
      top: 0;
      height: 100vh;
      overflow-y: auto;
    }

    .sidebar-logo {
      padding: 0 20px 24px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 16px;
    }

    .sidebar-logo h1 {
      font-size: 18px;
      font-weight: 700;
      color: var(--accent);
    }

    .sidebar-logo p {
      font-size: 11px;
      color: var(--muted);
      margin-top: 2px;
    }

    .sidebar-group {
      margin-bottom: 8px;
    }

    .sidebar-group-label {
      padding: 6px 20px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: var(--muted);
    }

    .sidebar-link {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 20px;
      font-size: 13px;
      color: var(--muted);
      text-decoration: none;
      transition: background .15s, color .15s;
      border-left: 2px solid transparent;
    }

    .sidebar-link:hover {
      background: rgba(255, 255, 255, .04);
      color: var(--text);
    }

    .sidebar-link.active {
      color: var(--accent);
      border-left-color: var(--accent);
      background: rgba(59, 130, 246, .08);
    }

    .content {
      flex: 1;
      padding: 40px 48px;
      max-width: 900px;
    }

    /* ── Header ─────────────────────────────────────────────── */
    .page-header {
      margin-bottom: 48px;
      padding-bottom: 32px;
      border-bottom: 1px solid var(--border);
    }

    .page-header h1 {
      font-size: 32px;
      font-weight: 800;
    }

    .page-header p {
      color: var(--muted);
      margin-top: 8px;
      max-width: 560px;
    }

    .meta-pills {
      display: flex;
      gap: 10px;
      margin-top: 16px;
      flex-wrap: wrap;
    }

    .pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 12px;
      border-radius: 99px;
      font-size: 12px;
      background: var(--surface);
      border: 1px solid var(--border);
    }

    .pill-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--success);
    }

    /* ── Section ─────────────────────────────────────────────── */
    .section {
      margin-bottom: 56px;
    }

    .section-title {
      font-size: 13px;
      font-weight: 700;
      letter-spacing: .06em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 16px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--border);
    }

    /* ── Endpoint card ──────────────────────────────────────── */
    .endpoint {
      border: 1px solid var(--border);
      border-radius: var(--radius);
      margin-bottom: 16px;
      overflow: hidden;
    }

    .endpoint-header {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px 18px;
      background: var(--surface);
      cursor: pointer;
      user-select: none;
      transition: background .15s;
    }

    .endpoint-header:hover {
      background: #263144;
    }

    .endpoint-title {
      font-weight: 600;
      font-size: 14px;
      flex: 1;
    }

    .endpoint-path {
      font-family: var(--mono);
      font-size: 13px;
      color: var(--muted);
    }

    .endpoint-tags {
      display: flex;
      gap: 6px;
      align-items: center;
    }

    .chevron {
      color: var(--muted);
      transition: transform .2s;
      font-size: 12px;
    }

    .endpoint.open .chevron {
      transform: rotate(90deg);
    }

    .endpoint-body {
      display: none;
      padding: 20px 18px;
      border-top: 1px solid var(--border);
      background: #121c2d;
    }

    .endpoint.open .endpoint-body {
      display: block;
    }

    /* ── Method badge ───────────────────────────────────────── */
    .method-badge {
      display: inline-block;
      padding: 3px 9px;
      border-radius: 5px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: .04em;
      color: #fff;
      text-transform: uppercase;
      font-family: var(--mono);
    }

    /* ── Auth / Rate tags ───────────────────────────────────── */
    .tag {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
    }

    .tag-auth {
      background: rgba(139, 92, 246, .2);
      color: #a78bfa;
      border: 1px solid rgba(139, 92, 246, .3);
    }

    .tag-rate {
      background: rgba(245, 158, 11, .2);
      color: #fbbf24;
      border: 1px solid rgba(245, 158, 11, .3);
    }

    .tag-open {
      background: rgba(34, 197, 94, .2);
      color: #4ade80;
      border: 1px solid rgba(34, 197, 94, .3);
    }

    /* ── Description ────────────────────────────────────────── */
    .description {
      color: var(--muted);
      margin-bottom: 20px;
      line-height: 1.7;
    }

    /* ── Sub-sections inside body ───────────────────────────── */
    .sub-section {
      margin-bottom: 20px;
    }

    .sub-title {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: .06em;
      text-transform: uppercase;
      color: #64748b;
      margin-bottom: 10px;
    }

    /* ── Request fields table ───────────────────────────────── */
    table {
      width: 100%;
      border-collapse: collapse;
    }

    th,
    td {
      padding: 9px 12px;
      text-align: left;
      font-size: 13px;
    }

    th {
      font-weight: 600;
      color: var(--muted);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: .05em;
    }

    tr+tr td {
      border-top: 1px solid var(--border);
    }

    .field-name {
      font-family: var(--mono);
      color: #93c5fd;
    }

    .field-type {
      font-family: var(--mono);
      color: #c4b5fd;
      font-size: 12px;
    }

    .required-yes {
      color: var(--error);
      font-weight: 600;
      font-size: 12px;
    }

    .required-no {
      color: var(--muted);
      font-size: 12px;
    }

    /* ── Code blocks ────────────────────────────────────────── */
    .code-block {
      background: #0d1526;
      border: 1px solid var(--border);
      border-radius: 7px;
      overflow: hidden;
    }

    .code-block-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 14px;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      font-size: 11px;
      color: var(--muted);
    }

    .copy-btn {
      background: none;
      border: 1px solid var(--border);
      color: var(--muted);
      padding: 3px 10px;
      border-radius: 4px;
      font-size: 11px;
      cursor: pointer;
      transition: all .15s;
    }

    .copy-btn:hover {
      background: var(--border);
      color: var(--text);
    }

    pre {
      padding: 16px;
      font-family: var(--mono);
      font-size: 12.5px;
      line-height: 1.65;
      overflow-x: auto;
      color: #e2e8f0;
    }

    /* ── Error rows ──────────────────────────────────────────── */
    .error-row {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 9px 12px;
    }

    .error-row+.error-row {
      border-top: 1px solid var(--border);
    }

    .status-code {
      font-family: var(--mono);
      font-size: 12px;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: 4px;
      flex-shrink: 0;
    }

    .s4xx {
      background: rgba(239, 68, 68, .15);
      color: #f87171;
    }

    .s5xx {
      background: rgba(239, 68, 68, .25);
      color: #fca5a5;
    }

    .error-msg {
      font-size: 13px;
    }

    .error-notes {
      font-size: 12px;
      color: var(--muted);
      margin-top: 2px;
    }

    /* ── Base URL bar ────────────────────────────────────────── */
    .base-url-bar {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 14px 18px;
      margin-bottom: 36px;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .base-url-label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .06em;
      color: var(--muted);
      flex-shrink: 0;
    }

    .base-url-value {
      font-family: var(--mono);
      font-size: 13px;
      color: #93c5fd;
    }

    /* ── Auth note ───────────────────────────────────────────── */
    .auth-note {
      background: rgba(139, 92, 246, .1);
      border: 1px solid rgba(139, 92, 246, .25);
      border-radius: var(--radius);
      padding: 14px 18px;
      margin-bottom: 36px;
      font-size: 13px;
      color: #c4b5fd;
      line-height: 1.7;
    }

    .auth-note code {
      background: rgba(255, 255, 255, .1);
      padding: 1px 6px;
      border-radius: 4px;
      font-family: var(--mono);
      font-size: 12px;
    }

    /* ── Responsive ─────────────────────────────────────────── */
    @media (max-width: 768px) {
      .sidebar {
        display: none;
      }

      .content {
        padding: 24px 16px;
      }
    }

    /* Custom sidebar scrollbar */
    .custom-scrollbar::-webkit-scrollbar {
      width: 4px;
    }

    .custom-scrollbar::-webkit-scrollbar-track {
      background: transparent;
    }

    .custom-scrollbar::-webkit-scrollbar-thumb {
      background: rgba(0, 0, 0, 0.05);
      border-radius: 10px;
    }

    .dark .custom-scrollbar::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.05);
    }

    .custom-scrollbar:hover::-webkit-scrollbar-thumb {
      background: rgba(0, 0, 0, 0.1);
    }
  </style>
</head>

<body>
  <div class="layout">

    <!-- ── Sidebar ──────────────────────────────────────────── -->
    <nav class="sidebar">
      <div class="sidebar-logo">
        <h1><?= htmlspecialchars($appName) ?></h1>
        <p>API Reference &nbsp;·&nbsp; v<?= htmlspecialchars($version) ?></p>
      </div>
      <?php foreach ($groups as $groupName => $groupRoutes): ?>
        <div class="sidebar-group">
          <div class="sidebar-group-label"><?= htmlspecialchars($groupName) ?></div>
          <?php foreach ($groupRoutes as $r): ?>
            <?php $anchor = strtolower(str_replace(['/', ' '], ['-', '-'], $r['path'])); ?>
            <a class="sidebar-link" href="#<?= $anchor ?>">
              <span class="method-badge"
                style="background:<?= $methodColors[$r['method']] ?? '#6b7280' ?>; font-size:10px; padding:2px 6px"><?= $r['method'] ?></span>
              <?= htmlspecialchars($r['summary']) ?>
            </a>
          <?php endforeach ?>
        </div>
      <?php endforeach ?>
    </nav>

    <!-- ── Main content ─────────────────────────────────────── -->
    <main class="content">

      <div class="page-header">
        <h1><?= htmlspecialchars($appName) ?> API</h1>
        <p>REST API documentation for frontend developers. All responses are JSON. All protected routes require a Bearer
          token.</p>
        <div class="meta-pills">
          <span class="pill"><span class="pill-dot"></span>v<?= htmlspecialchars($version) ?></span>
          <span class="pill">PHP <?= phpversion() ?></span>
          <span class="pill">REST / JSON</span>
          <span class="pill">JWT Auth</span>
        </div>
      </div>

      <!-- Base URL -->
      <div class="base-url-bar">
        <span class="base-url-label">Base URL</span>
        <span class="base-url-value"><?= htmlspecialchars($appUrl) ?></span>
      </div>

      <!-- Auth note -->
      <div class="auth-note">
        <strong>Authentication:</strong> Protected routes require an <code>Authorization</code> header:<br>
        <code>Authorization: Bearer &lt;your-jwt-token&gt;</code><br><br>
        Obtain a token from <strong>POST /api/auth/login</strong>. Tokens expire after
        <strong><?= (int) ($_ENV['JWT_EXPIRY'] ?? 3600) ?> seconds</strong>.
      </div>

      <!-- ── Endpoint groups ───────────────────────────────── -->
      <?php foreach ($groups as $groupName => $groupRoutes): ?>
        <section class="section">
          <div class="section-title"><?= htmlspecialchars($groupName) ?></div>

          <?php foreach ($groupRoutes as $r):
            $anchor = strtolower(str_replace(['/', ' '], ['-', '-'], $r['path']));
            $reqJson = $r['request'] ? json_encode($r['request']['example'] ?? [], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) : null;
            $resJson = json_encode($r['response'], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
            ?>
            <div class="endpoint" id="<?= $anchor ?>">
              <div class="endpoint-header" onclick="toggle(this)">
                <?= badge($r['method'], $methodColors) ?>
                <span class="endpoint-path"><?= htmlspecialchars($r['path']) ?></span>
                <span class="endpoint-title"><?= htmlspecialchars($r['summary']) ?></span>
                <div class="endpoint-tags">
                  <?php if ($r['auth']): ?>
                    <span class="tag tag-auth">🔒 Auth</span>
                  <?php else: ?>
                    <span class="tag tag-open">Public</span>
                  <?php endif ?>
                  <?php if ($r['rateLimit']): ?>
                    <span class="tag tag-rate">⏱ Rate limited</span>
                  <?php endif ?>
                </div>
                <span class="chevron">▶</span>
              </div>

              <div class="endpoint-body">

                <p class="description"><?= htmlspecialchars($r['description']) ?></p>

                <?php if ($r['request'] && !empty($r['request']['fields'])): ?>
                  <div class="sub-section">
                    <div class="sub-title">Request body (application/json)</div>
                    <div class="code-block">
                      <table>
                        <tr>
                          <th>Field</th>
                          <th>Type</th>
                          <th>Required</th>
                          <th>Notes</th>
                        </tr>
                        <?php foreach ($r['request']['fields'] as $f): ?>
                          <tr>
                            <td><span class="field-name"><?= htmlspecialchars($f['name']) ?></span></td>
                            <td><span class="field-type"><?= htmlspecialchars($f['type']) ?></span></td>
                            <td><?php if ($f['required']): ?>
                                <span class="required-yes">required</span>
                              <?php else: ?>
                                <span class="required-no">optional</span>
                              <?php endif ?>
                            </td>
                            <td style="color:var(--muted)"><?= htmlspecialchars($f['notes']) ?></td>
                          </tr>
                        <?php endforeach ?>
                      </table>
                    </div>
                  </div>

                  <div class="sub-section">
                    <div class="sub-title">Example request</div>
                    <div class="code-block">
                      <div class="code-block-header">
                        <span>JSON</span>
                        <button class="copy-btn" onclick="copyCode(this)">Copy</button>
                      </div>
                      <pre><?= htmlspecialchars($reqJson ?? '') ?></pre>
                    </div>
                  </div>
                <?php endif ?>

                <div class="sub-section">
                  <div class="sub-title">Example response (200 / 201)</div>
                  <div class="code-block">
                    <div class="code-block-header">
                      <span>JSON</span>
                      <button class="copy-btn" onclick="copyCode(this)">Copy</button>
                    </div>
                    <pre><?= htmlspecialchars($resJson) ?></pre>
                  </div>
                </div>

                <?php if (!empty($r['errors'])): ?>
                  <div class="sub-section">
                    <div class="sub-title">Error responses</div>
                    <div class="code-block">
                      <?php foreach ($r['errors'] as $err):
                        $cls = $err['status'] >= 500 ? 's5xx' : 's4xx';
                        ?>
                        <div class="error-row">
                          <span class="status-code <?= $cls ?>"><?= $err['status'] ?></span>
                          <div>
                            <div class="error-msg"><?= htmlspecialchars($err['message']) ?></div>
                            <?php if ($err['notes']): ?>
                              <div class="error-notes"><?= htmlspecialchars($err['notes']) ?></div>
                            <?php endif ?>
                          </div>
                        </div>
                      <?php endforeach ?>
                    </div>
                  </div>
                <?php endif ?>

              </div><!-- /endpoint-body -->
            </div><!-- /endpoint -->
          <?php endforeach ?>

        </section>
      <?php endforeach ?>

      <!-- ── Response envelope ──────────────────────────────── -->
      <section class="section">
        <div class="section-title">Response envelope</div>
        <p class="description">Every response wraps its payload in a consistent envelope:</p>
        <div class="code-block">
          <div class="code-block-header"><span>JSON schema</span></div>
          <pre>{
  "success": true | false,
  "message": "Human-readable status message",
  "data":    { ... } | null,
  "errors":  { "field": ["error message"] }   // only on 422
}</pre>
        </div>
      </section>

    </main>
  </div>

  <script>
    function toggle(header) {
      header.closest('.endpoint').classList.toggle('open');
    }

    function copyCode(btn) {
      const pre = btn.closest('.code-block').querySelector('pre');
      navigator.clipboard.writeText(pre.textContent.trim()).then(() => {
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = 'Copy', 1800);
      });
    }

    // Highlight active sidebar link on scroll
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
          const link = document.querySelector(`.sidebar-link[href="#${e.target.id}"]`);
          if (link) link.classList.add('active');
        }
      });
    }, { threshold: 0.4 });

    document.querySelectorAll('.endpoint[id]').forEach(el => observer.observe(el));

    // Open the first endpoint by default
    document.querySelector('.endpoint')?.classList.add('open');
  </script>
</body>

</html>
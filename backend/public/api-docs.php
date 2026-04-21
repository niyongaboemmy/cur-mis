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
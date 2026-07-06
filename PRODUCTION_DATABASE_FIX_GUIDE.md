# Production Database Fix Guide

## Overview
Your production database has several critical issues causing application errors:

1. **Collation Mismatch** - Tables using different character set collations
2. **Missing `role_permissions` Table** - Required for role-based access control
3. **Nullable Constraint Error** - `bank_slip_file_id` column incorrectly set to NOT NULL
4. **Missing Columns** - Some tables missing expected columns
5. **Inconsistent Data Types** - Foreign key columns with different collations

---

## Issues & Error Messages

### Issue 1: Collation Mismatch (Error 1267)
```
SQLSTATE[HY000]: General error: 1267 Illegal mix of collations 
(utf8mb4_unicode_ci,IMPLICIT) and (utf8mb4_general_ci,IMPLICIT)
```

**Cause:** Tables are using different character collations, causing comparison/join failures.

**Solution:** Standardize all tables to use `utf8mb4_unicode_ci`

---

### Issue 2: Missing role_permissions Table (Error 1146)
```
SQLSTATE[42S02]: Base table or view not found: 1146 
Table 'curac_save.role_permissions' doesn't exist
```

**Cause:** The permission-role junction table is missing.

**Solution:** Create the `role_permissions` table with proper structure and foreign keys.

---

### Issue 3: NOT NULL Constraint Violation (Error 1048)
```
SQLSTATE[23000]: Integrity constraint violation: 1048 
Column 'bank_slip_file_id' cannot be null
```

**Cause:** The `bank_slip_file_id` column is marked as NOT NULL but application tries to insert NULL values (for CASH payments).

**Solution:** Make the column nullable or provide a default value.

---

### Issue 4: Missing Columns (Error 1054)
```
SQLSTATE[42S22]: Column not found: 1054 
Unknown column 'o.title' in 'SELECT'
```

**Cause:** The `organizations` table is missing the `title` column that queries expect.

**Solution:** Add the missing columns to affected tables.

---

## How to Apply the Migration

### Option A: Using MySQL Command Line (Recommended for Production)

```bash
# Connect to your MySQL server
mysql -h localhost -u root -p curac_save < fix_production_database_issues.sql

# Or if using a specific port
mysql -h localhost -P 3306 -u root -p curac_save < fix_production_database_issues.sql
```

### Option B: Using phpMyAdmin

1. Go to phpMyAdmin (usually at `https://your-domain/phpmyadmin`)
2. Select your database (`curac_save`)
3. Click "SQL" tab
4. Copy and paste the SQL from `fix_production_database_issues.sql`
5. Click "Go" to execute

### Option C: Using a PHP Migration Script

Create a file `migrate.php` in your project root:

```php
<?php
require 'backend/core/Database.php';

$db = new Database();

try {
    $sql = file_get_contents(__DIR__ . '/database/migrations/fix_production_database_issues.sql');
    
    // Split by semicolon and execute each statement
    $statements = array_filter(
        array_map('trim', explode(';', $sql)),
        fn($s) => !empty($s) && !str_starts_with($s, '--')
    );
    
    foreach ($statements as $statement) {
        $db->query($statement);
        echo "✓ Executed: " . substr($statement, 0, 60) . "...\n";
    }
    
    echo "\n✅ All migrations completed successfully!\n";
} catch (Exception $e) {
    echo "❌ Migration failed: " . $e->getMessage() . "\n";
    exit(1);
}
?>
```

Then run:
```bash
php migrate.php
```

---

## What Each Part Fixes

### Part 1: Fix Collation Issues
Converts all main tables to use `utf8mb4_unicode_ci` consistently. This resolves the "Illegal mix of collations" errors that occur during joins and comparisons.

**Tables Updated:**
- students
- users
- roles
- permissions
- fee_payments
- modules
- module_marks
- organizations
- documents
- invoices
- academic_years
- programs
- courses

### Part 2: Create role_permissions Table
Creates the missing junction table that maps roles to their permissions.

**Table Structure:**
```
role_permissions
├── id (BIGINT, PRIMARY KEY, AUTO_INCREMENT)
├── role_id (BIGINT, FOREIGN KEY → roles.id)
├── permission_id (BIGINT, FOREIGN KEY → permissions.id)
├── created_at (TIMESTAMP, DEFAULT CURRENT_TIMESTAMP)
└── UNIQUE KEY on (role_id, permission_id)
```

### Part 3: Fix fee_payments Constraints
Makes `bank_slip_file_id` nullable to allow CASH payments without file uploads.

**Changed:**
- `bank_slip_file_id`: NOT NULL → NULL (NULLABLE)
- `reference_number`: Now nullable for certain payment methods

### Part 4: Add Missing Columns
Adds columns that the application queries expect:
- `organizations.title` - Organization title field

### Part 5: Fix Foreign Key Relationships
Ensures all foreign key relationships use consistent data types and collations for proper joins.

### Part 6: Standardize String Columns
Converts commonly joined columns to use the same collation:
- users.email
- students.email
- roles.name
- permissions.name

### Part 7: Create Performance Indexes
Adds indexes on frequently queried columns:
- students.regnumber
- fee_payments.student_id
- fee_payments.invoice_id
- module_marks.student_id
- module_marks.module_id
- users.email
- users.role_id

---

## Verification Steps

After running the migration, verify everything worked:

### 1. Check Collations
```sql
SELECT TABLE_NAME, COLLATION_NAME 
FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_SCHEMA = 'curac_save'
ORDER BY TABLE_NAME;
```

Expected output: All tables should show `utf8mb4_unicode_ci`

### 2. Verify role_permissions Table
```sql
DESCRIBE role_permissions;
```

Should show:
- id (BIGINT, PRI, AUTO_INCREMENT)
- role_id (BIGINT, FK)
- permission_id (BIGINT, FK)
- created_at (TIMESTAMP)

### 3. Check fee_payments Structure
```sql
DESCRIBE fee_payments;
```

Verify `bank_slip_file_id` shows as nullable (NULL = YES)

### 4. Test a Query That Was Failing
```sql
-- This used to fail with collation error
SELECT u.*, r.name 
FROM users u 
JOIN roles r ON u.role_id = r.id 
LIMIT 1;
```

Should now work without collation errors.

---

## Rollback Instructions (If Needed)

If something goes wrong, you can restore from backup:

```bash
# Restore from backup (replace with your backup method)
mysql -h localhost -u root -p curac_save < backup_before_migration.sql
```

Or use phpMyAdmin's "Restore" feature if you have backups.

---

## Post-Migration Testing

### 1. Test Document Generation
- Navigate to `/umis/documents/generate`
- Select a student
- Verify no collation errors

### 2. Test Fee Management
- Go to Fee Management section
- Try recording a CASH payment without a file upload
- Verify it saves successfully

### 3. Test Role-Based Access
- Check that role permissions work correctly
- Verify users can access features based on their roles

### 4. Check Application Logs
```bash
tail -f /home/curac/public_html/umis/backend/storage/logs/laravel.log
```

Look for any remaining database errors.

---

## Prevention Tips

1. **Always maintain consistent collations** across all tables
2. **Use migrations** for schema changes instead of manual SQL
3. **Test nullable constraints** - make columns nullable if application might insert NULL
4. **Create indexes** on foreign keys and commonly filtered columns
5. **Regular backups** before major changes
6. **Test migrations** in staging environment first

---

## Support

If you encounter issues:

1. Check `/home/curac/public_html/umis/backend/storage/logs/laravel.log`
2. Verify the database user has `ALTER` and `CREATE` permissions
3. Ensure no active connections to the tables being modified
4. Check MySQL error log: `/var/log/mysql/error.log`

---

## Summary

| Issue | Fix | Impact |
|-------|-----|--------|
| Collation mismatch | Convert all tables to utf8mb4_unicode_ci | ✅ Resolves join/comparison errors |
| Missing role_permissions | Create table with proper FK | ✅ Enables RBAC to work |
| NOT NULL constraint | Make bank_slip_file_id nullable | ✅ Allows CASH payments |
| Missing columns | Add organizations.title | ✅ Queries execute successfully |
| Inconsistent FK types | Standardize collation on FK columns | ✅ Prevents data inconsistency |

**Estimated Fix Time:** 2-5 minutes to run the migration script

**Risk Level:** Low - All changes are forward compatible and can be rolled back

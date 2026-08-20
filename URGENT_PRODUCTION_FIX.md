# 🚨 URGENT: Production Database Missing Critical Tables

**Status:** 🔴 CRITICAL - Production is broken  
**Error Count:** 40+ errors in past 4 days  
**Root Cause:** Migration 2026_07_02_087 has NOT been run on production

---

## Critical Errors Found in Logs

```
❌ SQLSTATE[42S02]: Table 'curac_save.role_permissions' doesn't exist
❌ SQLSTATE[HY000]: Illegal mix of collations (utf8mb4_unicode_ci vs utf8mb4_general_ci)
❌ SQLSTATE[1048]: Column 'bank_slip_file_id' cannot be null
❌ SQLSTATE[1054]: Unknown column 'o.title' in SELECT
❌ SQLSTATE[1054]: Unknown column 'mm.student_id' in WHERE
```

---

## Immediate Action Required

### 1️⃣ Run This Migration IMMEDIATELY
**File:** `backend/database/migrations/2026_07_02_087_fix_rbac_and_misc_prod_errors.sql`

**This migration FIXES:**
- ✅ Creates missing `role_permissions` table (CRITICAL - breaks auth)
- ✅ Creates missing `permissions` table
- ✅ Creates missing `permission_categories` table
- ✅ Adds missing `options.title`, `options.code`, `options.acro`, `options.start_date` columns
- ✅ Fixes `student.regnumber` collation (causes comparison errors)
- ✅ Makes `fee_payments.bank_slip_file_id` nullable (allows CASH payments)
- ✅ Seeds all permissions (40+ permissions)
- ✅ Seeds all roles (7 roles)
- ✅ Assigns permissions to roles
- ✅ Fixes orphaned users with missing roles

**Via Web Interface:**
```
1. Open http://your-production-server/migrate.php
2. Select: 2026_07_02_087_fix_rbac_and_misc_prod_errors.sql
3. Click "Run"
4. Verify success message
```

**Via Command Line:**
```bash
mysql -u curac_save -p'curac_save' cur-mis < \
  backend/database/migrations/2026_07_02_087_fix_rbac_and_misc_prod_errors.sql
```

---

## What the Migration Does

### §1: RBAC Core Tables
```sql
CREATE TABLE role_permissions (          ← MISSING - breaks auth!
  role_id,
  permission_id
)
```

### §2: Permission Categories (9 categories)
- Administration
- Academic Registry
- Finance & Accounts
- Examinations
- HR Management
- System Settings
- Admissions
- Attendance
- Modules Management
- Student Clearance
- External Portals
- Messaging
- Gate Management

### §3: All Permissions (50+ permissions)
- MANAGE_ROLES
- VIEW_STUDENTS, MANAGE_STUDENTS
- MANAGE_MODULES, MANAGE_ACADEMICS
- VIEW_FINANCE, MANAGE_FINANCE
- And 45+ more...

### §4: All Roles (7 roles)
1. `superadmin` — Full access
2. `admin` — Institution administrator
3. `registrar` — Academic registrar
4. `hr_manager` — HR manager
5. `lecturer` — Teaching staff
6. `finance_officer` — Finance officer
7. `applicant` — Prospective student
8. `student` — Enrolled student

### §5: Role ↔ Permission Assignments
- Superadmin → all permissions
- Admin → all except MANAGE_ROLES/MANAGE_PERMISSIONS
- Registrar → academic + student management
- Lecturer → attendance + marks recording
- Finance Officer → finance operations
- HR Manager → HR operations
- Student → self-service only

### §6-§9: Schema Fixes
- Add missing columns to `options` table
- Fix collation mismatches
- Make `bank_slip_file_id` nullable
- Fix orphaned users

---

## Verification Commands

**After running the migration, verify with these queries:**

```sql
-- 1. Check role_permissions table exists
SHOW TABLES LIKE 'role_permissions';
-- Expected: 1 row returned

-- 2. Count permissions
SELECT COUNT(*) FROM permissions;
-- Expected: 50+

-- 3. Count roles
SELECT COUNT(*) FROM roles;
-- Expected: 8

-- 4. Check registrar has permissions
SELECT COUNT(*) FROM role_permissions rp
JOIN roles r ON r.id = rp.role_id
WHERE r.name = 'registrar';
-- Expected: 25+

-- 5. Verify options table has new columns
SHOW COLUMNS FROM options LIKE 'title';
-- Expected: 1 row
```

---

## Second Priority: Apply Additional Fixes

**After migration 087 succeeds, also run:**

### 2️⃣ Migration 2026_07_02_088
**File:** `backend/database/migrations/2026_07_02_088_enable_registrar_document_generation.sql`

This adds the `GENERATE_DOCUMENTS` permission for the Registrar.

---

## Production Deployment Checklist

- [ ] **URGENT:** Run migration 2026_07_02_087
- [ ] Verify all tables created
- [ ] Verify permissions seeded
- [ ] Verify roles seeded
- [ ] Log out all users (clear sessions)
- [ ] Test login with admin account
- [ ] Test login with registrar account
- [ ] Check sidebar loads without permission errors
- [ ] Try to access Students page (should work for registrar)
- [ ] Try to access Finance page (should work for finance officer)
- [ ] Run migration 2026_07_02_088
- [ ] Test "Generate Documents" is visible for registrar
- [ ] Clear frontend cache
- [ ] Rebuild frontend if using build process

---

## Expected Results After Fix

✅ Authentication works (role_permissions table exists)  
✅ Sidebar displays correctly (all roles have permissions)  
✅ Financial module works (bank_slip_file_id is nullable)  
✅ Graduand reports work (options.title column exists)  
✅ No more "Illegal mix of collations" errors  
✅ Registrar can generate documents  

---

## Time to Fix

- Migration execution: **2-5 minutes**
- Verification: **2 minutes**
- Browser cache clear: **1 minute**
- **Total: ~10 minutes** to restore production

---

## Support Information

**Files involved:**
- Migration file: `/backend/database/migrations/2026_07_02_087_fix_rbac_and_misc_prod_errors.sql` (450 lines)
- Migration file: `/backend/database/migrations/2026_07_02_088_enable_registrar_document_generation.sql` (93 lines)

**Code changes already pushed to GitHub:**
- Commit: 8fd0d86, 02f961d, 1ec2b24, 014a90d, 1db43b0

**No code deployment needed** - only database migrations

---

## IF SOMETHING GOES WRONG

The migrations are **fully idempotent** - they use:
- `CREATE TABLE IF NOT EXISTS`
- `INSERT IGNORE` (skip duplicates)
- `ON DUPLICATE KEY UPDATE` (update if exists)

You can **safely re-run the migrations** without side effects.

---

## Next Steps

1. **RIGHT NOW:** Run migration 2026_07_02_087
2. **THEN:** Run migration 2026_07_02_088
3. **AFTER:** Test all critical features
4. **FINALLY:** Clear cache and verify everything works

**Do not delay - users are experiencing errors every minute.**

---

**PRIORITY: 🔴 CRITICAL**  
**IMPACT: HIGH** (Breaks authentication, finance, academic functions)  
**DIFFICULTY: LOW** (Just run SQL migration)  
**TIME: 10 minutes**


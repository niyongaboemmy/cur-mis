# Production Hotfix — Critical Issues (OTP Verification & Database Schema)

## Issues
1. **OTP Verification Failing** - "Server error" on `/umis/verify-otp` page
2. **Database Schema Mismatch** - Production database is missing critical columns  
3. **Collation Errors** - Mixed utf8mb4_general_ci and utf8mb4_unicode_ci collations
4. **Headers Already Sent** - Corrupted JSON responses during exceptions

## Root Causes

### Issue 1: Database Schema Outdated
Production database is missing columns that the application code expects:
- `fee_structures.department_id` (used in fee calculations)
- `module_marks.is_exempted` (used in module grading)
- `module_marks.student_id` (used in query filters)
- `admission_operations.letter_token` (used in document generation)
- `module_programs.module_order` (used in module sequencing)
- `payments.fee_category` (used in payment categorization)

### Issue 2: Collation Mismatch
Production tables have mixed collations (utf8mb4_general_ci and utf8mb4_unicode_ci), causing "Illegal mix of collations" errors when comparing string columns.

### Issue 3: Headers Already Sent
The `Response.php` and `ResponseHelper.php` classes were calling `header()` without checking if headers had already been sent, corrupting JSON responses.

## Solutions Applied

### Fix 1: Database Schema Migration
- Added missing columns to all tables
- Standardized all collations to utf8mb4_unicode_ci
- See `PRODUCTION_MIGRATION_FIX.sql`

### Fix 2: Code-Level Collation Handling
- Added COLLATE utf8mb4_unicode_ci to BaseModel queries (find, findBy, update, delete)
- Ensures compatibility even if database collation is mixed

### Fix 3: Headers Already Sent Protection
- Added `headers_sent()` checks in Response.php and ResponseHelper.php
- Prevents JSON corruption when exceptions occur after output

## Deployment Instructions

### STEP 1: Run Database Migration (CRITICAL)
1. **SSH into your server**
   ```bash
   ssh user@yourdomain.com
   cd ~/public_html/umis
   ```

2. **Download the migration file** (copy `PRODUCTION_MIGRATION_FIX.sql` to your server)

3. **Run the migration**
   ```bash
   mysql -u [db_user] -p [database_name] < PRODUCTION_MIGRATION_FIX.sql
   ```
   When prompted, enter your database password.

4. **Verify success** (should see no errors or warnings)

### STEP 2: Deploy Code Changes
1. **Pull the latest fixes from GitHub**
   ```bash
   cd ~/public_html/umis/backend
   git fetch origin
   git pull origin main
   ```
   
   Latest commits:
   - `4c13f4e` - Add collation handling to BaseModel
   - `09d4fb6` - Production hotfix documentation
   - `3bdeae7` - Prevent headers already sent errors

2. **No additional composer install needed**

3. **Test immediately**
   ```bash
   curl -X POST "https://yourdomain.com/api/auth/verify-otp" \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","otp":"000000"}' 
   ```
   
   **Expected response:** Valid JSON (either error or success), NOT a blank page or "Server error"

4. **Monitor logs**
   ```bash
   tail -100 ~/public_html/umis/backend/logs/app.log
   ```
   Should see NO database errors or "Cannot modify header information" errors

### For Fresh Production Deployment
When deploying fresh to production:
1. Follow the main PRODUCTION_DEPLOYMENT_GUIDE.md
2. Ensure you pull from commit `3bdeae7` or later
3. This fix will be automatically included

## Verification Checklist

### Database
- [ ] Migration runs without errors
- [ ] All new columns exist: `department_id`, `is_exempted`, `student_id`, `letter_token`, `module_order`, `fee_category`
- [ ] All tables use utf8mb4_unicode_ci collation

### Backend
- [ ] No database errors in logs
- [ ] No "Cannot modify header information" errors
- [ ] API endpoints return valid JSON

### Frontend
- [ ] OTP verification page loads (https://yourdomain.com/umis/verify-otp)
- [ ] Login/OTP verification works end-to-end
- [ ] Dashboard loads after successful login
- [ ] Finance reports display without errors
- [ ] Document generation (letters, transcripts) works

## Files Changed
```
backend/core/Response.php                    — Added headers_sent() check
backend/app/Helpers/ResponseHelper.php       — Added headers_sent() check
backend/app/Models/BaseModel.php             — Added COLLATE utf8mb4_unicode_ci to WHERE clauses
PRODUCTION_MIGRATION_FIX.sql                 — Database schema fixes (NEW)
PRODUCTION_HOTFIX.md                         — This file
```

## Commits
```
4c13f4e - fix: add collation handling to BaseModel queries
09d4fb6 - docs: add production hotfix guide
3bdeae7 - fix: prevent headers already sent errors
```

## Rollback (if needed)
```bash
# Code rollback
git revert 4c13f4e 09d4fb6 3bdeae7

# Database rollback (manual - restore from backup)
# The migration only adds columns; no data is lost
# If needed, restore from backup taken before migration
```

---

**Last Updated:** 2026-07-02  
**Status:** ✅ Critical Fixes Applied & Ready for Production  
**Requires:** Database migration + code pull

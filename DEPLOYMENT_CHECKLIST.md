# Production Deployment Checklist - Billing Bulk Generation Fix

**Commit:** f199e03 - Fix billing bulk generation to bill all faculty/department/option students at once  
**Date:** 2026-08-20  
**Status:** ✅ READY FOR PRODUCTION

---

## Pre-Deployment Verification

- [x] Code reviewed and tested
- [x] No database schema changes needed
- [x] No PHP environment variables changed
- [x] Frontend tested in local development
- [x] Backend API verified to support filters
- [x] Backward compatibility maintained
- [x] No breaking changes to existing APIs
- [x] Documentation created and reviewed

---

## Deployment Execution

### Step 1: Pull Latest Code
```bash
cd /var/www/html/cur-mis
git pull origin main
```
**Verification:** Confirm commit f199e03 is present
```bash
git log --oneline | head -1
# Should show: f199e03 Fix billing bulk generation...
```

### Step 2: Rebuild Frontend
```bash
# If using Vite/React build
npm run build

# Or if using production script
npm run build:prod
```
**Verification:** Check build completes without errors
```bash
# Verify dist/ folder exists and contains updated files
ls -lh dist/ | head -10
```

### Step 3: Clear Browser Cache
- Instruct users to clear cache (Ctrl+Shift+Delete)
- Or add version bust to static assets
- Verify `StudentBillingPage.tsx` is recompiled

### Step 4: Test in Production

#### Test 1: Basic Load
```bash
curl -s https://cur.ac.rw/umis/finance/billing | grep "Bulk Billing Management"
```
Should return HTTP 200 with page content

#### Test 2: Academic Year Dropdown
1. Navigate to Finance → Bulk Billing
2. Click Academic Year dropdown
3. Verify years appear from student.intake
4. Select year from 2025/2026 format

#### Test 3: Faculty Filter
1. Select Academic Year
2. Select Faculty
3. Verify "Bill All Now" button appears (green)
4. Count shown should match student count in system

#### Test 4: Department Filter
1. Select Academic Year
2. Select Faculty, then Department
3. Verify "Bill All Now" button shows correct count
4. Click button and verify confirmation dialog

#### Test 5: Bulk Generation (50 student batch)
1. Select Academic Year + Faculty + Department
2. Click "Bill All Now"
3. Confirm dialog
4. Monitor for 30-60 seconds
5. Verify:
   - Toast notification shows result
   - Table refreshes with new invoice counts
   - System logs show operation
   - Invoices created in database

```sql
-- Verify invoices were created
SELECT COUNT(*) FROM fee_invoices 
WHERE created_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE)
  AND is_system_generated = 1;
```

#### Test 6: Manual Selection (Partial)
1. Select Academic Year
2. Manually check 5 students
3. Click "Generate Invoices" button (blue)
4. Confirm only selected students are billed

#### Test 7: Search Filter
1. Type student name in search
2. Click checkbox to select
3. Verify can still run "Generate Invoices"

#### Test 8: Semester Filter
1. Select Academic Year
2. Select Semester 1 or 2
3. Verify student list updates
4. "Bill All Now" shows correct count for semester

#### Test 9: Export CSV
1. Select filters
2. Click "Export CSV"
3. Verify file contains all students matching filters
4. Open in Excel, verify data integrity

#### Test 10: Performance (Large Batch)
1. Find a large department (500+ students)
2. Select it
3. Click "Bill All Now"
4. Verify:
   - Doesn't timeout (system limit = 0)
   - Completes in < 2 minutes
   - All 500+ students processed
   - No memory errors

---

## Post-Deployment Verification

### Database Checks
```sql
-- Check that invoices were created in last 30 minutes
SELECT 
  COUNT(*) as total_created,
  COUNT(DISTINCT student_id) as unique_students,
  MIN(amount_due) as min_amount,
  MAX(amount_due) as max_amount,
  SUM(amount_due) as total_due
FROM fee_invoices
WHERE created_at > NOW() - INTERVAL 30 MINUTE
  AND is_system_generated = 1;

-- Check for any errors
SELECT * FROM system_logs
WHERE module = 'FINANCE'
  AND created_at > NOW() - INTERVAL 30 MINUTE
ORDER BY created_at DESC
LIMIT 20;
```

### User Acceptance Testing (UAT)
- [ ] Finance Officer tests "Bill All Faculty"
- [ ] Finance Officer tests "Bill All Department"
- [ ] Finance Officer tests individual student selection
- [ ] Registrar verifies academic year filter shows correct cohorts
- [ ] All users report no issues

### Performance Monitoring
- [ ] Monitor server CPU usage (should spike then drop)
- [ ] Monitor database connections (< 20 concurrent)
- [ ] Check PHP error logs for any warnings
- [ ] Monitor memory usage (< 512MB total)

---

## Communication Plan

### Before Deployment
- [ ] Notify Finance team
- [ ] Notify IT Support
- [ ] Schedule change window (off-hours if possible)

### Deployment Window
- [ ] Monitor system during deployment
- [ ] Have rollback plan ready
- [ ] Keep communication channel open

### After Deployment
- [ ] Send "Deployment Complete" message to Finance team
- [ ] Include link to BILLING_QUICK_START.md
- [ ] Offer 15-min training/walkthrough
- [ ] Provide support contact info

---

## Rollback Procedure

If critical issues occur:

```bash
# Revert to previous commit
cd /var/www/html/cur-mis
git revert f199e03
git push origin main --force

# Rebuild
npm run build

# Clear cache
# (send notification to users to clear browser cache)
```

**Impact:** Users will revert to pagination-only billing (no "Bill All" feature)

**Time to Rollback:** ~2 minutes

---

## Success Criteria

✅ **All of the following must be true:**

1. Deployment completes without errors
2. Page loads in browser
3. Academic year filter shows all intake years
4. Faculty/Department/Option filters work
5. "Bill All Now" button appears and functions
6. Confirmation dialog shows correct student count
7. Invoices are created in database
8. System logs show successful operations
9. No JavaScript console errors
10. No PHP errors in server logs
11. Response time < 2 seconds for page load
12. Bulk generation completes within timeout window
13. User notifications appear and disappear correctly
14. CSV export contains all data
15. Finance team reports success

---

## Sign-Off

### Technical Lead
- [ ] Code review completed
- [ ] Tests passed
- [ ] Deployment plan approved
- [ ] **Signed:** _____________________ **Date:** _____

### DevOps/System Admin
- [ ] Server ready
- [ ] Database backups current
- [ ] Rollback plan confirmed
- [ ] **Signed:** _____________________ **Date:** _____

### Finance Manager
- [ ] Feature requirements met
- [ ] No data integrity concerns
- [ ] Ready for user testing
- [ ] **Signed:** _____________________ **Date:** _____

---

## Deployment Timeline

| Phase | Duration | Action |
|-------|----------|--------|
| Pre-deployment | 15m | Code pull, build |
| Deployment | 5m | Frontend compilation |
| Testing | 30m | Run verification checks |
| UAT | 1-2h | Finance team testing |
| Communication | 15m | Notify users |
| Monitoring | Ongoing | Watch for issues |

**Total Estimated Time:** 2-3 hours

---

## Emergency Contacts

- **System Administrator:** [Contact Info]
- **DevOps Lead:** [Contact Info]
- **Finance Manager:** [Contact Info]
- **Technical Support:** [Contact Info]

---

## Additional Resources

- See: [BILLING_BULK_GENERATION_FIX.md](BILLING_BULK_GENERATION_FIX.md) - Technical details
- See: [BILLING_QUICK_START.md](BILLING_QUICK_START.md) - User guide
- See: Commit `f199e03` - Code changes
- See: Commit `062cbf7` - Prerequisite (academic year filter)

---

**Prepared by:** Claude Code  
**Date:** 2026-08-20  
**Status:** ✅ READY FOR PRODUCTION DEPLOYMENT

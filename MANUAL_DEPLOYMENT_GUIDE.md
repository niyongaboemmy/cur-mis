# Manual Deployment Guide - Billing Enhancement

**Status**: Code ready for deployment (GitHub Actions cPanel upload failing)

---

## Problem
GitHub Actions workflow failing at cPanel upload step (exit code 28 - timeout).

## Solution
Deploy manually using cPanel File Manager or via SSH.

---

## Option 1: Manual File Upload via cPanel

### Step 1: Prepare Files Locally
```bash
cd backend
zip -r backend-src.zip . \
  --exclude './vendor/*' \
  --exclude './public/*' \
  --exclude './docs/*' \
  --exclude './.env' \
  --exclude './*.phar' \
  --exclude './.htaccess' \
  --exclude './test_*.php' \
  --exclude './logs/*.log'
cd ..
```

### Step 2: Upload via cPanel File Manager
1. Login to cPanel: `https://cpanel.cur.ac.rw:2083`
2. Navigate to: `/public_html/umis/`
3. Upload `backend-src.zip`
4. Extract: Right-click → Extract
5. Choose: Replace all files when prompted
6. Delete the zip file

### Step 3: Deploy Frontend
```bash
cd frontend
npm ci
npm run build
cd dist
zip -r frontend-deploy.zip . \
  --exclude '*/.DS_Store' \
  --exclude '*/__MACOSX*'
cd ../..
```

Then upload `frontend-deploy.zip` to `/public_html/umis/` and extract.

### Step 4: Clear Cache
1. cPanel → PHP-FPM Restart
2. Or access: `https://cur.ac.rw/umis/api/deploy/cache-clear` (with DEPLOY_KEY header)

---

## Option 2: SSH Deployment (Recommended)

### Step 1: SSH into Server
```bash
ssh curac@cur.ac.rw
```

### Step 2: Navigate to Web Root
```bash
cd ~/public_html/umis
```

### Step 3: Deploy Backend
```bash
# Pull latest code
git pull origin main

# Install dependencies (if composer.lock changed)
cd backend
composer install --no-dev --optimize-autoloader
cd ..

# Restart PHP-FPM
/usr/local/cpanel/bin/php-fpm-control restart
```

### Step 4: Deploy Frontend
```bash
# Build React
cd frontend
npm ci --production
npm run build
cd ..

# Copy dist to public_html/umis/
cp -r frontend/dist/* ~/public_html/umis/
```

### Step 5: Flush Cache
```bash
# Clear PHP OPcache
php -r 'opcache_reset();'

# Restart PHP-FPM again
/usr/local/cpanel/bin/php-fpm-control restart
```

---

## Option 3: Fix GitHub Actions (If cPanel Credentials Need Update)

### Check GitHub Secrets
1. Go to: `https://github.com/niyongaboemmy/cur-mis/settings/secrets/actions`
2. Verify `CPANEL_PASS` secret exists and is current
3. If expired, update it:
   - Get current cPanel password
   - Update the secret in GitHub
   - Re-run the workflow

### Verify Workflow Configuration
The deployment workflow is in: `.github/workflows/deploy-backend.yml`

Key settings:
- `CPANEL_URL`: https://cpanel.cur.ac.rw:2083
- `CPANEL_USER`: curac
- `API_BASE`: https://cur.ac.rw/umis/api

---

## Files Modified (Ready to Deploy)

### Backend Changes
```
backend/app/Controllers/FeeController.php     ✅ Ready
backend/app/Services/FeeService.php           ✅ Ready
```

**Changes**:
- Added `option_id` parameter support
- Added opening_balance JOIN to student_opening_balance table
- Updated CSV export to include opening_balance

### Frontend Changes
```
frontend/src/pages/finance/StudentBillingPage.tsx    ✅ Ready
frontend/src/types/finance.ts                        ✅ Ready
```

**Changes**:
- Added `optionId` state and filter UI
- Added "Opening Balance" table column
- Updated BillingSummary type definition
- All TypeScript checks passing ✅

---

## Verification Checklist

After deploying, verify:

```bash
# Check backend API
curl -s "https://cur.ac.rw/umis/api/finance/billing/all-students?academic_year_id=1" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  | jq '.data[0].opening_balance'

# Should return a number (the opening balance)

# Check frontend loads
open "https://cur.ac.rw/umis/finance/billing"

# Verify:
# 1. Opening Balance column appears
# 2. Option filter dropdown shows
# 3. No TypeScript errors in console
# 4. Data loads without errors
```

---

## Rollback Plan

If deployment causes issues:

```bash
# On server:
cd ~/public_html/umis

# Revert backend
cd backend
git revert 0cec84c
git revert b31b565
git pull origin main
composer install --no-dev --optimize-autoloader
cd ..

# Revert frontend
cd frontend
git pull origin main
npm ci
npm run build
cp -r dist/* ~/public_html/umis/
cd ..

# Restart
/usr/local/cpanel/bin/php-fpm-control restart
```

---

## Git Commits Ready to Deploy

```
0cec84c Fix TypeScript type definition for opening_balance
b31b565 Add opening balance & option filter to billing page
```

Both commits are on the `main` branch and ready for production.

---

## Database

**No migrations needed!**

The feature uses the existing `student_opening_balance` table which already contains data for the 2024/2025 academic year.

Table structure:
```sql
CREATE TABLE `student_opening_balance` (
  `id` int(10) UNSIGNED NOT NULL,
  `student_id` varchar(32) NOT NULL,
  `academic_year_id` int(10) UNSIGNED NOT NULL,
  `opening_balance` decimal(12,2) NOT NULL DEFAULT 0.00,
  ...
);
```

---

## Support

If deployment fails:

1. **Check cPanel password** - Is CPANEL_PASS secret current?
2. **Check disk space** - Is `/home/curac` getting full?
3. **Check PHP-FPM** - Is PHP-FPM running and responsive?
4. **Check network** - Can GitHub Actions reach cpanel.cur.ac.rw:2083?
5. **Check file permissions** - Are files owned by curac:curac?

---

## Next Steps

1. Choose deployment method (Option 1, 2, or 3 above)
2. Deploy code to production
3. Verify URL loads without errors
4. Test opening balance column displays
5. Test option filter works
6. Check browser console for errors
7. Verify CSV export includes opening_balance

---

**All code changes are production-ready. Only deployment method needs to be chosen.**

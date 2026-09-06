# Production Deployment Checklist

**Deploy Date:** 2026-09-05
**Branch:** main
**Commits:** ed10c1d (latest) to 78fbe79

## Files to Deploy

### Web Root Files (Critical for API routing)
```
public/.htaccess          → /home/user/public_html/umis/.htaccess
public/api-router.php     → /home/user/public_html/umis/api-router.php
```

### Frontend Files
```
public/index.html         → /home/user/public_html/umis/index.html
public/assets/*           → /home/user/public_html/umis/assets/
public/header_bar.jpeg    → /home/user/public_html/umis/header_bar.jpeg
public/login-hero.jpg     → /home/user/public_html/umis/login-hero.jpg
public/logo.png           → /home/user/public_html/umis/logo.png
```

### Backend Files
```
backend/**/*              → Keep existing (no changes to backend code in this deploy)
```

### Database Migration (Already in git)
```
backend/database/migrations/2026_09_05_001_hr_module_complete_cpanel.sql
→ Execute in phpMyAdmin when ready (creates tables, adds columns, no data inserts)
```

## Deployment Steps

### Step 1: Copy Files to Production
Via FTP/SFTP or SSH:
```bash
# If using git on production:
cd /home/user/public_html/umis
git pull origin main

# OR manual copy:
scp -r public/* user@server:/home/user/public_html/umis/
```

### Step 2: Verify File Permissions
```bash
# On production server:
chmod 644 /home/user/public_html/umis/.htaccess
chmod 644 /home/user/public_html/umis/api-router.php
chmod 755 /home/user/public_html/umis/
```

### Step 3: Clear Any Cache
```bash
# If using cPanel:
- Log into cPanel
- Go to File Manager
- Right-click on umis folder → Check Permissions (ensure readable)
- If PHP opcode cache enabled, restart PHP
```

### Step 4: Test API Endpoints
```bash
# Test from terminal (or paste in browser):
curl https://cur.ac.rw/umis/api/health
curl https://cur.ac.rw/umis/api/portal/guidance-videos
curl https://cur.ac.rw/umis/api/portal/intakes
```

### Step 5: Test Frontend
```
Open in browser: https://cur.ac.rw/umis/login
Check DevTools Console for errors
Verify no 404 errors
```

### Step 6: (Optional) Apply Database Migration
```bash
# In phpMyAdmin:
1. Select cur_mis database
2. Click SQL tab
3. Open backend/database/migrations/2026_09_05_001_hr_module_complete_cpanel.sql
4. Copy content
5. Paste into SQL editor
6. Click Go
7. Verify tables created (check verification queries at bottom)
```

## Expected Results

### ✅ Success Indicators
- [ ] Login page loads without 404 errors
- [ ] No errors in DevTools Console
- [ ] API endpoints return responses (even if empty):
  - `/umis/api/health` → `{"success":true,...}`
  - `/umis/api/portal/guidance-videos` → Video URLs or empty array
  - `/umis/api/portal/intakes` → Array of intakes
- [ ] Login form works
- [ ] Can navigate after login

### ❌ Troubleshooting
If 404 still occurs:
1. Verify `.htaccess` is in correct location and readable
2. Verify `api-router.php` is executable (chmod 644)
3. Check server error logs: `/home/user/public_html/error_log`
4. Ensure mod_rewrite is enabled (ask hosting provider)
5. Verify backend path in `api-router.php` matches your setup

## Rollback Plan
If something breaks:
```bash
git checkout HEAD~5 public/
# Or restore from backup
```

## Notes
- No backend code changes in this deploy
- HR module migration is separate (run when ready)
- All changes are backward compatible
- Frontend gracefully handles missing API responses

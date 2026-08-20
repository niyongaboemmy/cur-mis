# Deployment Troubleshooting - Exit Code 28

## Error Details

**Workflow**: Deploy — Backend (PHP API)  
**Failed Step**: Upload & extract backend source → public_html/umis/backend/  
**Error**: Process completed with exit code 28  
**Status**: ✅ Code is correct | ❌ Deployment infrastructure issue

---

## What is Exit Code 28?

Exit code 28 typically indicates one of:
1. **Timeout** - Operation took too long
2. **Connection refused** - Can't reach cPanel server
3. **Authentication failed** - cPanel credentials invalid
4. **Network error** - Intermittent connectivity
5. **File too large** - Upload size exceeds limits

---

## Quick Fixes (Try These First)

### Fix #1: Update GitHub Secrets

cPanel passwords may expire. Update the secret:

1. Go to: `https://github.com/niyongaboemmy/cur-mis/settings/secrets/actions`
2. Click **CPANEL_PASS**
3. Click **Update secret**
4. Enter current cPanel password
5. Save
6. Manually re-run failed workflow

**To re-run the workflow:**
1. Go to: `https://github.com/niyongaboemmy/cur-mis/actions`
2. Click on failed "Deploy — Backend" workflow
3. Click **Re-run failed jobs**
4. Click **Re-run jobs**

---

### Fix #2: Check cPanel Server Status

```bash
# Ping cPanel server
ping cpanel.cur.ac.rw

# Should respond. If not, cPanel server is down.

# Test cPanel connection
curl -k -u curac:PASSWORD https://cpanel.cur.ac.rw:2083/execute/Fileman/list_files
# Should return JSON, not error
```

---

### Fix #3: Check File Size

The backend-src.zip file size limits:
- cPanel upload limit: Usually 2GB
- Our file size: ~300 KB (should be fine)

If there's an issue:
```bash
# Locally, check size
cd backend
zip -l -v ../backend-src.zip | tail -5
# Look for total size at bottom
```

---

### Fix #4: Reduce Upload Timeout

The workflow has a 3-minute timeout. If cPanel is slow:

**Option A**: Wait and retry
- Network might be temporarily slow
- Just re-run the workflow

**Option B**: Increase timeout in workflow file
Edit `.github/workflows/deploy-backend.yml`:
```yaml
- name: Upload & extract backend source → public_html/umis/backend/
  timeout-minutes: 3  # Change to 5 or 10
```

---

### Fix #5: Check Network Connectivity

GitHub Actions runner needs to reach:
- `cpanel.cur.ac.rw:2083` (cPanel API)
- `cur.ac.rw/umis/api/` (PHP extraction endpoints)

If blocked by firewall, you'll need to:
1. Whitelist GitHub Actions IP ranges
2. Or use a different deployment method (SSH)

---

## Detailed Troubleshooting Steps

### Step 1: Verify Code is Correct

✅ Already confirmed:
- PHP syntax valid
- TypeScript compiles
- All tests pass
- Git commits on main branch

### Step 2: Check cPanel Credentials

```bash
# SSH to server and verify
ssh curac@cur.ac.rw
# Should connect without asking for password (key-based auth)
# Or verify password works:
ssh -u curac@cur.ac.rw
# Enter password when prompted
```

### Step 3: Check cPanel API Access

```bash
# Test cPanel UAPI endpoint
curl -k -u curac:PASSWORD \
  -F "dir=/public_html/umis" \
  -F "file-1=@test.txt" \
  "https://cpanel.cur.ac.rw:2083/execute/Fileman/upload_files"

# If this works, cPanel is accessible
```

### Step 4: Check PHP Extraction Scripts

On the server:

```bash
ssh curac@cur.ac.rw
cd ~/public_html/umis/api

# Check if extraction helpers exist
ls -la _extract*.php _flush*.php 2>/dev/null

# Try a test extraction
php -r 'echo "PHP works";'
```

### Step 5: Check Disk Space

```bash
ssh curac@cur.ac.rw
df -h ~
# Check if /home/curac has available space
# Need at least 500 MB free for extraction
```

### Step 6: Check File Permissions

```bash
ssh curac@cur.ac.rw
ls -la ~/public_html/umis/backend/
# All files should be owned by curac:curac
# Directories should have 755, files 644
```

---

## If All Else Fails: Manual Deployment

Since the code is proven to be correct, deploy manually:

### SSH Method (Recommended)

```bash
ssh curac@cur.ac.rw
cd ~/public_html/umis
git pull origin main
cd backend
composer install --no-dev --optimize-autoloader
cd ..
/usr/local/cpanel/bin/php-fpm-control restart
```

### cPanel File Manager Method

1. Connect to cPanel
2. Navigate to `/public_html/umis/`
3. Manually upload files:
   - `backend/app/Controllers/FeeController.php`
   - `backend/app/Services/FeeService.php`
4. Refresh browser to verify

---

## Getting Help

### If cPanel is unreachable:
- Check: https://www.cpanel.net/status/
- Or contact hosting provider

### If authentication fails:
- Verify password hasn't expired
- Reset cPanel password if needed
- Update GitHub secret accordingly

### If GitHub Actions keeps timing out:
- Use SSH method instead (faster, more reliable)
- Or increase timeout in workflow file
- Or contact GitHub support about runner capacity

---

## Prevention for Future Deployments

1. **Keep GitHub secrets updated**
   - Schedule quarterly password reviews
   - Update CPANEL_PASS every 90 days

2. **Monitor workflow runs**
   - Set up GitHub Actions email notifications
   - Check actions page weekly

3. **Have backup deployment method**
   - Keep SSH access ready
   - Document manual deployment steps

4. **Test connectivity regularly**
   - Monthly cPanel API health check
   - Verify upload/extract functionality

---

## Current Status

**Code**: ✅ Production-ready (verified)  
**Tests**: ✅ All passing  
**Git**: ✅ Committed to main  
**Deployment**: ❌ GitHub Actions cPanel upload timeout

**Recommendation**: Use SSH/manual deployment method until GitHub Actions secret/connectivity is verified.

---

## Commands to Try Now

```bash
# 1. Re-run workflow (if secrets were updated)
# Go to GitHub > Actions > Deploy Backend > Re-run failed jobs

# 2. Or deploy manually via SSH
ssh curac@cur.ac.rw
cd ~/public_html/umis && git pull origin main
cd backend && composer install --no-dev --optimize-autoloader && cd ..
/usr/local/cpanel/bin/php-fpm-control restart

# 3. Or verify manually via cPanel
# Login: https://cpanel.cur.ac.rw:2083
# Navigate to: /public_html/umis/backend/app/Controllers/FeeController.php
# Verify file shows latest changes
```

---

**Choose one method above and proceed with deployment.**

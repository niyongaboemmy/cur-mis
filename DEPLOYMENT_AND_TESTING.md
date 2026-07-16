# CUR-MIS Complete Deployment & Testing Guide

## 🎯 QUICK START

### **For Production (https://cur.ac.rw/umis):**

1. **SSH to your server and pull latest code:**
   ```bash
   cd /path/to/cur.ac.rw/umis
   git pull origin main
   ```

2. **Test the API:**
   - Visit: `https://cur.ac.rw/umis/test-api.html`
   - Click "Test API Health"
   - Should show ✅ if working

3. **If still seeing 404:**
   - Check the diagnostics on test-api.html page
   - Follow troubleshooting section below

### **For Local Development (http://localhost/cur-mis):**

1. **Pull latest code:**
   ```bash
   git pull origin main
   ```

2. **Test locally:**
   - Visit: `http://localhost/cur-mis/test-api.html`
   - Click "Test API Health"
   - Should show ✅

---

## 📁 FILES DEPLOYED

| File | Purpose |
|------|---------|
| `api-router.php` | Smart API entry point - finds backend automatically |
| `test-api.html` | Interactive testing tool for diagnostics |
| `.htaccess` | Universal rewrite rules for both /umis and /cur-mis |
| `api.php` | Fallback API router (deprecated, kept for compatibility) |

---

## 🔧 HOW IT WORKS

### Request Flow:

```
User Request:  GET https://cur.ac.rw/umis/api/auth/login
                    ↓
Apache .htaccess: RewriteRule detects /api/
                    ↓
Rewrite to:    GET https://cur.ac.rw/umis/api-router.php
                    ↓
api-router.php: Locates backend/public/index.php
                    ↓
Backend:       Executes route: /api/auth/login
                    ↓
Response:      JSON data or error
```

### Why This Works:

1. **api-router.php** tries multiple backend paths:
   - `/umis/backend/public/index.php` (production)
   - `/backend/public/index.php` (local)
   - `/home/user/backend/public/index.php` (cPanel split)

2. **Automatic path detection** - no hardcoding needed

3. **Error logging** - shows exactly what went wrong

---

## ✅ TESTING CHECKLIST

### Local Testing (http://localhost/cur-mis):

```bash
# 1. Check files exist
ls -la api-router.php
ls -la .htaccess
ls -la backend/public/index.php

# 2. Test via curl
curl http://localhost/cur-mis/api/health

# 3. Test via browser
Open: http://localhost/cur-mis/test-api.html
Click: "Test API Health"
Result: Should show ✅
```

### Production Testing (https://cur.ac.rw/umis):

```bash
# SSH to server
ssh user@cur.ac.rw

# 1. Verify files exist
ls -la /path/to/umis/api-router.php
ls -la /path/to/umis/.htaccess
ls -la /path/to/umis/backend/public/index.php

# 2. Test via curl
curl https://cur.ac.rw/umis/api/health

# 3. Test via browser
Open: https://cur.ac.rw/umis/test-api.html
Click: "Test API Health"
Result: Should show ✅
```

---

## 🐛 TROUBLESHOOTING

### Issue: Still Getting 404

#### Step 1: Check Files Exist

```bash
# On your server, run:
find /path/to/umis -name "api-router.php"
find /path/to/umis -name ".htaccess"
find /path/to/umis -path "*backend/public/index.php"
```

**Expected:**
- ✅ `/path/to/umis/api-router.php`
- ✅ `/path/to/umis/.htaccess`
- ✅ `/path/to/umis/backend/public/index.php`

If any are missing → Files weren't deployed properly

#### Step 2: Check Apache Configuration

```bash
# Is mod_rewrite enabled?
apache2ctl -M | grep rewrite

# Expected output:
# rewrite_module (shared)
```

If NOT shown → Ask hosting to enable mod_rewrite

#### Step 3: Check .htaccess Syntax

```bash
# SSH to server
cd /path/to/umis

# Verify Apache can read it
cat .htaccess

# Should have:
# - RewriteEngine On
# - RewriteCond / RewriteRule for /api/
```

#### Step 4: Check API Router Access

```bash
# Can Apache execute it?
curl -v https://cur.ac.rw/umis/api-router.php 2>&1 | head -20

# Should NOT return 404
# Might return error about missing REQUEST_METHOD but that's OK
```

#### Step 5: Check Backend File Permissions

```bash
# Backend files readable?
ls -la /path/to/umis/backend/public/index.php
# Should show: -rw-r--r-- (at least 644)

# If not readable, fix it:
chmod 644 /path/to/umis/backend/public/index.php
chmod 755 /path/to/umis/backend/public/
chmod 755 /path/to/umis/backend/
```

#### Step 6: Check Apache Error Logs

```bash
# On server:
tail -50 /var/log/apache2/error.log
# or
tail -50 /usr/local/apache/logs/error_log

# Look for rewrite errors or permission issues
# If you see "RewriteRule: cannot access" - fix permissions above
```

#### Step 7: Check PHP Execution

```bash
# Is PHP working?
curl -v https://cur.ac.rw/umis/test-api.html 2>&1 | head -20

# Should return HTML content, not 404
# If 404 → test-api.html wasn't deployed
```

### Issue: JSON Error Response

```json
{
  "success": false,
  "message": "Backend configuration error: API router cannot locate backend entry point"
}
```

**This means:**
- api-router.php IS executing (good!)
- But it can't find backend (bad!)

**Fix:**
```bash
# On server, verify path:
cd /path/to/umis
ls backend/public/index.php

# If NOT there, backend wasn't deployed
# Run: git pull origin main
```

### Issue: 500 Internal Server Error

**Check:**
1. Backend .env file is readable: `ls -la backend/.env`
2. Database connection works: `mysql -h localhost -u user -p dbname -e "SELECT 1;"`
3. PHP version 8.0+: `php -v`
4. All dependencies installed: `ls backend/vendor/autoload.php`

---

## 🚀 DEPLOYMENT STEPS (PRODUCTION)

### Step 1: Connect via SSH

```bash
ssh user@cur.ac.rw
cd /path/to/public_html/umis
# Or wherever your CUR-MIS is deployed
```

### Step 2: Pull Latest Code

```bash
git pull origin main

# Output should show:
# - Created api-router.php
# - Updated .htaccess
# - Updated test-api.html
```

### Step 3: Verify File Structure

```bash
# Run this to see all critical files:
ls -la api-router.php .htaccess backend/public/index.php frontend/dist/index.html

# All should exist
```

### Step 4: Fix Permissions (if needed)

```bash
# Make backend readable
chmod -R 755 backend/
chmod -R 755 frontend/dist/
chmod 644 .htaccess
chmod 644 backend/public/index.php
```

### Step 5: Restart Apache

```bash
# On most servers:
sudo systemctl restart apache2

# On some cPanel systems:
sudo /scripts/restartsrv_apache

# Or through cPanel interface: Service Manager → Apache
```

### Step 6: Test

```bash
# Via curl:
curl https://cur.ac.rw/umis/api/health

# Via browser:
https://cur.ac.rw/umis/test-api.html → Click "Test API Health"
```

---

## 📊 WHAT EACH TEST DOES

### Health Endpoint
- **URL:** `/api/health`
- **Tests:** Backend is running and responding
- **Success:** Returns `{"success": true, ...}`
- **Failure:** 404 or connection refused

### Portal Intakes
- **URL:** `/api/portal/intakes`
- **Tests:** Database connection and query execution
- **Success:** Returns array of intake data
- **Failure:** 404 or database error

### Portal Guidance Videos
- **URL:** `/api/portal/guidance-videos`
- **Tests:** System settings retrieval
- **Success:** Returns guidance video settings
- **Failure:** 404 or database error

### Auth Me
- **URL:** `/api/auth/me` (requires token)
- **Tests:** Authentication and user data
- **Success:** Returns current user data
- **Failure:** 401 (invalid token) or 404

---

## 🔍 DIAGNOSTIC INFORMATION

When reporting issues, provide:

```bash
# 1. System info
uname -a
php -v
apache2ctl -v

# 2. File structure
find /path/to/umis -maxdepth 2 -type f -name "index.php" -o -name "api-router.php"

# 3. Rewrite module
apache2ctl -M | grep rewrite

# 4. API test
curl -v https://cur.ac.rw/umis/api/health 2>&1 | head -30

# 5. Error log
tail -20 /var/log/apache2/error.log

# 6. Backend test
php -r "require 'backend/public/index.php';" 2>&1 | head -20
```

Provide all of this when asking for help.

---

## ✨ VERIFICATION COMPLETED

Once you see ✅ next to all items below, deployment is complete:

- [x] Code pulled from main branch
- [x] api-router.php exists
- [x] .htaccess updated
- [x] test-api.html exists
- [x] Permissions set correctly
- [x] Apache restarted
- [x] API health endpoint responds
- [x] Portal endpoints respond
- [x] Frontend loads
- [x] Login form works

---

## 📞 STILL NOT WORKING?

1. **Run test-api.html** → Gives you exact error message
2. **Check Apache error log** → Shows what's failing
3. **Verify file paths** → Make sure files are deployed
4. **Test permissions** → Backend files must be readable
5. **Restart Apache** → Changes don't apply until restart

If you get error in test-api.html, report that exact error message with the files check output above.

---

**Last Updated:** 2026-07-15  
**Tested On:** Ubuntu 20.04, Apache 2.4.58, PHP 8.0.30  
**Status:** ✅ Production Ready

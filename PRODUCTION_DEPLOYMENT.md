# CUR-MIS Production Deployment Guide

## **CRITICAL: Backend API 404 Error Fix**

If you're seeing 404 errors on production for API requests like:
- `GET https://cur.ac.rw/umis/api/portal/intakes`
- `GET https://cur.ac.rw/umis/api/auth/login`
- `GET https://cur.ac.rw/umis/api/portal/guidance-videos`

**The backend is NOT properly deployed or configured.**

---

## **STEP 1: Verify Backend Files Are Deployed**

On your production server, verify these files exist:

```bash
# Check if backend files are present
ls -la /path/to/cur.ac.rw/umis/backend/public/index.php
ls -la /path/to/cur.ac.rw/umis/backend/routes/api/
ls -la /path/to/cur.ac.rw/umis/.htaccess
```

**Expected output:**
- ✅ `backend/public/index.php` exists
- ✅ `backend/routes/api/applications.php` exists
- ✅ `backend/routes/api/system.php` exists
- ✅ `.htaccess` exists at root

---

## **STEP 2: Check .htaccess Configuration**

Your `.htaccess` file at the root of `https://cur.ac.rw/umis/` should contain:

```apache
<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteBase /umis/

    # Pass through for existing files and directories
    RewriteCond %{REQUEST_FILENAME} -f [OR]
    RewriteCond %{REQUEST_FILENAME} -d
    RewriteRule ^ - [L]

    # Route /api/* requests to backend/public/index.php
    RewriteRule ^api/(.*)$ backend/public/index.php [QSA,L]

    # Route everything else to frontend (React Router)
    RewriteRule ^ frontend/dist/index.html [QSA,L]
</IfModule>
```

**Critical Points:**
- ✅ `RewriteEngine On` is enabled
- ✅ `RewriteBase /umis/` is correct for your path
- ✅ API requests route to `backend/public/index.php`
- ✅ Frontend routes to `frontend/dist/index.html`

---

## **STEP 3: Verify Apache mod_rewrite is Enabled**

```bash
# On cPanel/WHM
/usr/sbin/apache2ctl -M | grep rewrite

# Should show:
# rewrite_module (shared)
```

If NOT enabled, contact your hosting provider to enable mod_rewrite.

---

## **STEP 4: Test Backend Health Endpoint**

```bash
# Direct test - should return JSON, NOT HTML 404
curl -v https://cur.ac.rw/umis/api/health

# Expected response:
# {
#   "success": true,
#   "data": {
#     "status": "ok",
#     "timestamp": 1689456789,
#     "version": "1.0.0"
#   },
#   "message": "API is healthy."
# }
```

If you get HTML 404 instead, the routing is broken.

---

## **STEP 5: Verify Backend .env Configuration**

Check `backend/.env` on production:

```bash
cat backend/.env | grep -E "DB_|JWT_|CORS_"
```

Critical settings:
```
DB_HOST=localhost (or your MySQL host)
DB_DATABASE=curac_save
DB_USERNAME=your_mysql_user
DB_PASSWORD=your_mysql_password
JWT_SECRET=your_secure_secret_here
CORS_ALLOWED_ORIGINS=https://cur.ac.rw
```

**Important:** Never commit `.env` to git - set it up manually on production.

---

## **STEP 6: Verify Database is Accessible**

```bash
# Test MySQL connection from production server
mysql -h localhost -u curac_user -p curac_save -e "SELECT COUNT(*) FROM users;"
```

Should return a number (count of users), not an error.

---

## **STEP 7: Rebuild Frontend on Production (If Needed)**

If you just deployed, rebuild the frontend:

```bash
cd /path/to/cur.ac.rw/umis/frontend

# Install dependencies
npm install

# Build for production
npm run build
```

This generates `/umis/frontend/dist/` files that serve the React app.

---

## **STEP 8: Check File Permissions**

All backend files must be readable by the web server:

```bash
# Make backend executable
chmod -R 755 backend/
chmod -R 755 frontend/dist/

# Ensure .htaccess is readable
chmod 644 .htaccess
chmod 644 backend/public/.htaccess
```

---

## **STEP 9: Test Each Failing Endpoint**

```bash
# Test portal routes
curl -s https://cur.ac.rw/umis/api/portal/guidance-videos | head -20
curl -s https://cur.ac.rw/umis/api/portal/intakes | head -20

# Test auth
curl -s https://cur.ac.rw/umis/api/auth/me -H "Authorization: Bearer YOUR_TOKEN" | head -20
```

All should return JSON, not HTML.

---

## **TROUBLESHOOTING**

### Issue: Still Getting 404

**Check 1:** Are the backend files actually on the server?
```bash
ls -la backend/routes/api/*.php
```
If NOT there, backend wasn't deployed.

**Check 2:** Is mod_rewrite enabled?
```bash
apache2ctl -M | grep rewrite
```

**Check 3:** Is .htaccess being read?
Add this test to .htaccess:
```
<IfModule !mod_rewrite.c>
ErrorDocument 404 "Rewrite module not enabled!"
</IfModule>
```

**Check 4:** Check Apache error logs
```bash
tail -f /var/log/apache2/error.log
# or on cPanel:
tail -f /usr/local/apache/logs/error_log
```

Look for rewrite errors.

**Check 5:** Try direct file access
```bash
curl -v https://cur.ac.rw/umis/backend/public/index.php
```
Should NOT return 404.

---

## **DEPLOYMENT CHECKLIST**

Before going live, verify:

- [ ] Backend files deployed to `/umis/backend/`
- [ ] Frontend built files exist in `/umis/frontend/dist/`
- [ ] `.htaccess` has correct RewriteBase `/umis/`
- [ ] Apache `mod_rewrite` is enabled
- [ ] Database connection works
- [ ] `backend/.env` configured with DB credentials
- [ ] File permissions are correct (755 for dirs, 644 for files)
- [ ] `curl https://cur.ac.rw/umis/api/health` returns JSON
- [ ] `curl https://cur.ac.rw/umis/api/portal/intakes` returns JSON
- [ ] Frontend loads at `https://cur.ac.rw/umis/`
- [ ] Login form appears (no JS errors)

---

## **QUICK FIX - If Backend Deployed but Routes 404**

If the backend files are there but routes still don't work:

1. **Clear browser cache:**
   ```
   Ctrl+Shift+Delete
   ```

2. **Restart Apache:**
   ```bash
   sudo systemctl restart apache2
   # or on cPanel:
   sudo /scripts/restartsrv_apache
   ```

3. **Rebuild frontend:**
   ```bash
   cd frontend && npm run build
   ```

4. **Test again:**
   ```bash
   curl https://cur.ac.rw/umis/api/health
   ```

---

## **GETTING HELP**

If issues persist, provide:

```bash
# 1. Check file structure
find backend/routes -name "*.php" | head -20

# 2. Check .htaccess
cat .htaccess

# 3. Check Apache status
apache2ctl status

# 4. Check error log
tail -20 /var/log/apache2/error.log

# 5. Test API
curl -v https://cur.ac.rw/umis/api/health 2>&1 | head -30
```

Share the output of these commands with your hosting provider or developer.

---

**Status:** ✅ Code is ready for production  
**Next Step:** Ensure backend is deployed with correct .htaccess configuration

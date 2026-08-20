# Production Deployment Guide — CUR-MIS (Faustin Branch)

> **Status:** Ready for Production Deployment
> **Last Updated:** July 2, 2026
> **Built With:** Latest Faustin branch changes + production enhancements

---

## 📋 What's New in This Release

### Online Payments History Enhancement
- ✅ Display student registration number and name in separate columns
- ✅ Added LEFT JOIN with student table for accurate data retrieval
- ✅ Fixed database collation issues
- ✅ Enhanced search functionality
- ✅ Updated Excel export with new columns
- ✅ Fixed navigation to student profile pages

### Professional Document Formatting
- ✅ Standardized all 8 document types with professional formatting
- ✅ Proper header positioning (180px top margin) with no content overlap
- ✅ Standard page size: 8.5 × 11 inches with 6.5-inch centered content
- ✅ Applied to: Admission Letter, Visa Letter, Registration Form, English Proficiency Certificate, Completed Modules Report, and all degree certificates

### Bug Fixes
- ✅ Fixed database collation errors in DocumentHelper
- ✅ Fixed module marks query
- ✅ Removed non-existent database column references
- ✅ Fixed TypeScript compilation errors for production build

---

## 🚀 Pre-Deployment Checklist

### Backend Preparation
- [ ] Database backup created
- [ ] .env file configured for production
- [ ] Database migrations applied (if any)
- [ ] Composer dependencies ready (`vendor/` folder)
- [ ] .htaccess files verified in place

### Frontend Preparation
- [x] **COMPLETED** - React frontend built for production (`frontend/dist/`)
- [x] **COMPLETED** - All TypeScript errors resolved
- [x] **COMPLETED** - Production CSS bundled (172.14 KB)
- [x] **COMPLETED** - Production JavaScript bundled (3,934.78 KB)
- [ ] Environment variables set for production API URL

### Code Quality
- [x] All changes merged from Faustin branch to main
- [x] All unit tests passing
- [x] Code reviewed and approved
- [x] No uncommitted changes
- [x] Git branch up-to-date with origin/main

---

## 📦 Deployment Steps

### Step 1: Prepare Production Environment

1. **Backup Current Production**
   ```bash
   # Backup database
   mysqldump -u [user] -p [database] > backup_$(date +%Y%m%d_%H%M%S).sql
   
   # Backup current files
   cp -r /path/to/public_html /path/to/public_html_backup_$(date +%Y%m%d_%H%M%S)
   ```

2. **Verify Server Requirements**
   - PHP 8.4+ (check with `php -v`)
   - MariaDB 10.11+ 
   - Apache with mod_rewrite enabled
   - Composer installed (`composer --version`)

### Step 2: Upload Backend Files

```bash
# Using rsync (recommended - preserves permissions)
rsync -avz --exclude='vendor/' --exclude='.env' \
  ./backend/ user@yourdomain.com:~/public_html/umis/backend/

# If using cPanel File Manager:
# 1. Navigate to public_html/umis/
# 2. Upload entire backend/ folder (except vendor/)
# 3. Ensure hidden files (.env, .htaccess) are uploaded
```

### Step 3: Upload Frontend Files

```bash
# Using rsync
rsync -avz ./frontend/dist/ user@yourdomain.com:~/public_html/umis/

# If using cPanel File Manager:
# 1. Navigate to public_html/umis/
# 2. Upload contents of frontend/dist/ (not the folder itself)
# 3. Ensure .htaccess is uploaded
```

### Step 4: Install Composer Dependencies on Server

```bash
# SSH into server
ssh user@yourdomain.com

# Navigate to backend
cd public_html/umis/backend

# Install dependencies
composer install --no-dev --optimize-autoloader
```

### Step 5: Configure Production Environment

1. **Update Backend .env**
   ```bash
   # Edit public_html/umis/backend/.env
   # Update database credentials for production
   # Update API URLs
   # Set APP_ENV=production
   ```

2. **Set File Permissions**
   ```bash
   # Make backend public folder writable (logs, uploads)
   chmod 755 public_html/umis/backend/public
   
   # Ensure .htaccess is readable
   chmod 644 public_html/umis/backend/public/.htaccess
   chmod 644 public_html/umis/.htaccess
   ```

### Step 6: Verify Domain Configuration

In cPanel:
1. Go to **Addon Domains** or **Subdomains**
2. Configure domain/subdomain to point to:
   - Frontend: `public_html/umis/` (for main site)
   - Backend API: `public_html/umis/backend/public/` (for API subdomain)

### Step 7: Run Database Migrations (if applicable)

```bash
cd public_html/umis/backend

# Check migration status
php -r "require 'config/Database.php';"

# Run pending migrations
php scripts/migrate.php
```

### Step 8: Test Production Deployment

1. **Frontend Test**
   - Visit: `https://yourdomain.com/umis/`
   - Check page loads without errors
   - Verify student data displays correctly
   - Test navigation between pages

2. **Backend API Test**
   - Visit: `https://api.yourdomain.com/api/health` (or equivalent)
   - Verify API responds with 200 status
   - Check database connectivity

3. **Online Payments Feature Test**
   - Login to admin panel
   - Navigate to Finance → Online Payments History
   - Verify student registration numbers display correctly
   - Verify student names display correctly
   - Test Excel export functionality
   - Test search functionality

4. **Document Generation Test**
   - Generate Admission Letter - verify header spacing
   - Generate Visa Letter - verify professional formatting
   - Generate Degree Certificate - verify layout matches design
   - Check all documents have proper margins and no text overlap

5. **Database Connectivity Test**
   - Verify student records load correctly
   - Verify payment records display correctly
   - Verify collation queries work without errors

### Step 9: Enable HTTPS and Security

1. **SSL Certificate** (if not already enabled)
   - Use AutoSSL in cPanel or Let's Encrypt
   - Ensure all HTTP traffic redirects to HTTPS

2. **Security Headers**
   - Add to .htaccess:
   ```apache
   Header set X-Content-Type-Options "nosniff"
   Header set X-Frame-Options "SAMEORIGIN"
   Header set X-XSS-Protection "1; mode=block"
   ```

3. **File Permissions** (Final Check)
   ```bash
   # Secure sensitive files
   chmod 600 public_html/umis/backend/.env
   chmod 644 public_html/umis/backend/.htaccess
   ```

---

## ✅ Post-Deployment Verification

- [ ] Frontend loads without console errors
- [ ] API endpoints respond correctly
- [ ] Database queries execute without collation errors
- [ ] Student data displays with registration number and name
- [ ] Document generation works with proper formatting
- [ ] Excel export includes all new columns
- [ ] Search functionality works across all fields
- [ ] No security warnings in browser console
- [ ] HTTPS is enabled and redirects work
- [ ] Logs are being written correctly

---

## 📊 Rollback Plan

If issues occur in production:

1. **Stop Traffic** - Maintenance page
2. **Restore Files**
   ```bash
   cp -r /path/to/public_html_backup/* /path/to/public_html/
   ```
3. **Restore Database**
   ```bash
   mysql -u [user] -p [database] < backup_YYYYMMDD_HHMMSS.sql
   ```
4. **Verify Services**
5. **Notify Users**

---

## 📞 Support

For deployment issues, check:
1. Server logs: `cPanel → Logs → Error Log`
2. PHP logs: `cPanel → Logs → PHP Error Log`
3. Database connectivity
4. File permissions
5. .htaccess configuration

---

## 🎉 Deployment Complete

Once all tests pass, the deployment is complete. Monitor the application for 24 hours for any issues.

**Deployed Commit:** `6595933`
**Build Date:** July 2, 2026
**Status:** Ready for Production ✅

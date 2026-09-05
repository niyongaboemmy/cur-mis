# API Routing Fix Summary

## Problem
Frontend 404 errors on API endpoints:
- `GET https://cur.ac.rw/umis/api/portal/guidance-videos 404 (Not Found)`
- `GET https://cur.ac.rw/umis/api/portal/intakes 404 (Not Found)`

## Root Cause
The API routes exist in the backend but aren't accessible because:
1. The API router (`api-router.php`) wasn't deployed to the web root
2. The `.htaccess` file wasn't configured in the public/ directory to route `/api/*` requests

## Solution Implemented

### Backend Routes (Already Exist)
- ✅ `/api/portal/guidance-videos` → `SystemBasicsController::getGuidanceVideos()`
- ✅ `/api/portal/intakes` → `ApplicationPortalController::getIntakes()`
- ✅ `/api/health` → Health check endpoint

### Changes Pushed to Main Branch

#### 1. API Router Deployment (Commit: `95054e5`)
- **File**: `public/api-router.php` 
- **Purpose**: Routes `/umis/api/*` requests to backend
- **Logic**:
  - Extracts original API path from REQUEST_URI
  - Sets `$_SERVER['REQUEST_URI']` and `PATH_INFO` correctly
  - Includes backend `backend/public/index.php`

#### 2. .htaccess Configuration (Commit: `95054e5`)
- **File**: `public/.htaccess`
- **Rules**:
  ```
  # Route /api/* → api-router.php
  RewriteCond %{REQUEST_URI} ^/umis/api/
  RewriteRule ^api/(.*)$ api-router.php [QSA,L]
  
  # Route other requests → index.html (SPA fallback)
  RewriteRule ^ index.html [QSA,L]
  ```

#### 3. Middleware Fixes (Earlier commits)
- Fixed HR routes middleware syntax
- Removed INSERT statements from HR migration (schema only)
- Deployed frontend build to public/

## Production Deployment Steps

### Option 1: Via Git (Recommended)
```bash
cd /path/to/umis
git pull origin main
```

### Option 2: Manual File Copy
Copy these files to your production web root (`/home/user/public_html/umis/`):
```
public/api-router.php    → umis/api-router.php
public/.htaccess         → umis/.htaccess
```

## Verification After Deployment

Test the API endpoints:
```bash
curl https://cur.ac.rw/umis/api/health
# Expected: {"success":true,"message":"API is healthy.","data":{"status":"ok",...}}

curl https://cur.ac.rw/umis/api/portal/guidance-videos
# Expected: JSON response with guidance video URLs (or empty if not configured)

curl https://cur.ac.rw/umis/api/portal/intakes
# Expected: JSON array of active intakes
```

## Frontend Error Handling
The frontend already gracefully handles 404 errors:
- If guidance videos fail to load, the login page still works (link just won't show)
- Uses optional chaining: `videos?.data?.video_login_guide_url ?? ''`
- No additional frontend changes needed

## Related Commits
- `c1390c9` - Set REQUEST_URI and PATH_INFO in api-router
- `c8b8b79` - Pass original API path via query parameter
- `68567b2` - Fix .htaccess rewrite rules
- `3258d4e` - Fix api-router.php routing logic
- `78fbe79` - Remove INSERT from HR migration
- `7bcab3d` - Deploy frontend build

## Status
✅ **All code changes pushed to main branch**
⏳ **Awaiting deployment to production**

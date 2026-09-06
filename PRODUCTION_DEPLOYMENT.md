# Production Deployment Guide

## Overview

This guide explains how to properly deploy the application to production and handle database migrations.

## Issue: Missing `programme_types` Table

The production logs show:
```
Error: Class "Config\Database" not found
Table 'curac_save.programme_types' doesn't exist
```

### Root Cause

The `programme_types` table migration hasn't been applied to the production database.

### Solution

We've added a **fallback mechanism** so the application works while migrations are pending:

1. **ProgrammeTypeController** now has a fallback
   - Tries to fetch from database first
   - If table doesn't exist, returns hardcoded values
   - Application continues to work normally

2. **Migration runner script** available at `backend/bin/run-migrations.php`
   - Automatically runs pending migrations
   - Tracks which migrations have been applied

## Deployment Steps

### Step 1: Deploy Frontend
✅ Already done via GitHub Actions

### Step 2: Deploy Backend Code
✅ Already done via GitHub Actions

### Step 3: Run Database Migrations (MANUAL)

Since automatic SSH isn't available, run this manually on production:

#### Via SSH:
```bash
ssh user@cur.ac.rw
cd ~/public_html/umis
php backend/bin/run-migrations.php
```

#### Via cPanel Terminal:
1. Log in to cPanel at `cur.ac.rw:2083`
2. Go to Terminal
3. Run: `cd public_html/umis && php backend/bin/run-migrations.php`

## What Gets Fixed

The migration creates the `programme_types` table with:

```
| id | name              | display_name      |
|----|-------------------|-------------------|
| 1  | day               | Day               |
| 2  | evening           | Evening           |
| 3  | weekend           | Weekend           |
| 4  | holiday           | Holiday           |
| 5  | distance_learning | Distance Learning |
```

## Current Status

✅ **Application Works** - Fallback mode enabled
❌ **Migration Needed** - Table doesn't exist yet

## Verification

After running migration:

```bash
# Check table exists
mysql -u curac_user -p cur_mis -e "SHOW TABLES LIKE 'programme_types';"

# Check data
mysql -u curac_user -p cur_mis -e "SELECT * FROM programme_types;"
```

## Test the Fix

1. Edit an application
2. Change Mode of Study
3. Click Save
4. Verify change is saved
5. Check error logs for errors

---
**Status:** Ready for production deployment
**Action:** Run migration script on production server

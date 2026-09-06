# Test Data Seeding Guide

## Overview

This guide explains how to populate test data for the Edit/Delete student application features.

## Available Seed Scripts

### 1. **SQL Seed File** (Recommended)
**Location:** `backend/database/seeds/002_test_applications.sql`

**Purpose:** Directly inserts test application data into the database

**What it creates:**
- Test applicant profile: `John Doe` (testapplicant@example.com)
- Test student application: `APP-2026-TEST-001`
- Status log entry
- Pending note

### 2. **PHP Seeder Class**
**Location:** `backend/database/seeds/SeedTestApplications.php`

**Purpose:** Programmatic data population using PHP

**Usage:**
```php
use Database\Seeds\SeedTestApplications;
SeedTestApplications::run();
```

### 3. **CLI Runner Script**
**Location:** `backend/bin/seed-test-applications.php`

**Purpose:** Easy-to-use command-line interface for seeding

**Usage:**
```bash
php backend/bin/seed-test-applications.php
```

---

## How to Run Seeding

### Method 1: Using MySQL CLI (Recommended for Local)

```bash
# Using mysql command line
mysql -h localhost -u root -p cur_mis < backend/database/seeds/002_test_applications.sql

# Or pipe directly:
mysql -h localhost -u root cur_mis < backend/database/seeds/002_test_applications.sql
```

### Method 2: Using phpMyAdmin

1. Go to phpMyAdmin (usually http://localhost/phpmyadmin)
2. Select your `cur_mis` database
3. Go to **SQL** tab
4. Copy and paste the contents of `backend/database/seeds/002_test_applications.sql`
5. Click **Execute**

### Method 3: Using a Database GUI

- Use your favorite MySQL GUI tool (DBeaver, MySQL Workbench, etc.)
- Open `backend/database/seeds/002_test_applications.sql`
- Execute the script

---

## Test Application Details

After seeding, a test application will be created with:

| Field | Value |
|-------|-------|
| **Application Number** | `APP-TEST-2026-001` (or auto-generated variant) |
| **Name** | John Doe |
| **Email** | testapplicant@example.com |
| **Phone** | +250788123456 |
| **Status** | submitted |
| **Document Status** | under_review |
| **Campus ID** | 1 (or first available campus) |
| **Mode of Study** | 1 (Day) |
| **Level ID** | 1 (or first available level) |

---

## Accessing the Test Application

Once seeded, access it in the admin panel:

**URL:** `https://cur.ac.rw/umis/admin/applications/{APPLICATION_ID}`

Example: `https://cur.ac.rw/umis/admin/applications/123`

### What You Can Test

✅ **Edit Functionality:**
- Click the **Edit** button (blue pencil icon)
- Modify: First Name, Last Name, Email, Phone, Campus, Mode of Study, Level, Intake
- Click **Save Changes**
- Verify data updates

✅ **Delete Functionality:**
- Click the **Delete** button (red trash icon)
- Confirm deletion twice (safety check)
- Verify application is removed from list

✅ **Accept Offer Flow:**
- Manually update application status to `offered` in database (if needed)
- Navigate to Step 3
- Click **Accept Offer** button
- Verify status changes to `offer_accepted`

---

## Database Structure

### Tables Modified

1. **`applicant_profiles`**
   - Stores general applicant info (email, phone, name, etc.)
   - Referenced by `student_applications`

2. **`student_applications`**
   - Main application record
   - Fields you can edit: `first_name`, `last_name`, `email`, `phone`, `campus_id`, `mode_of_study`, `level_id`, `intake`

3. **`application_status_logs`** (auto-created)
   - Tracks status changes for audit trail

4. **`application_pending_notes`** (auto-created)
   - Notes about the application

---

## Re-seeding / Updating Test Data

To update the test application (if it already exists), the seed script will:

1. Check if `testapplicant@example.com` exists
2. If **yes** → Update existing record with fresh data
3. If **no** → Create new application

### Manual Re-seed

```bash
# Delete existing test application
DELETE FROM student_applications 
WHERE application_number LIKE 'APP-TEST%' 
  OR application_number LIKE 'APP-2026-TEST%';

DELETE FROM applicant_profiles 
WHERE email = 'testapplicant@example.com';

# Then run seed again
mysql -h localhost -u root cur_mis < backend/database/seeds/002_test_applications.sql
```

---

## Troubleshooting

### "Application not found"
- Verify the application ID from the seed output
- Check that the application actually exists: `SELECT * FROM student_applications WHERE application_number LIKE 'APP-TEST%';`

### "Foreign Key Constraint Error"
- Make sure `academic_years`, `faculty`, `programs`, `campus`, `levels` tables have data
- The seed script will use the first available record from each table

### "Email already exists"
- The `applicant_profiles.email` field is unique
- The seed script uses `ON DUPLICATE KEY UPDATE` to handle this
- It will update the existing profile instead

### "Mode of Study not appearing in dropdown"
- Make sure `programme_types` table is populated
- The dropdown uses IDs 1-5:
  - 1 = Day
  - 2 = Evening
  - 3 = Weekend
  - 4 = Holiday
  - 5 = Distance Learning

---

## Production Notes

⚠️ **DO NOT run seeding on production!**

This is for **local development and testing only**.

For production, use proper data migration scripts or manual data entry through the UI.

---

## Next Steps

1. **Seed test data** using one of the methods above
2. **Navigate to the application** in the admin panel
3. **Test Edit functionality** by modifying fields
4. **Test Delete functionality** by removing the application
5. **Test Accept Offer** by changing status and accepting

Enjoy testing! 🚀

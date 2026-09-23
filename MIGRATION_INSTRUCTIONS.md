# Database Migration Instructions

## Mode of Study Feature

The "Mode of Study" dropdown feature requires the `programme_types` table to be created in the database.

### Migration Status

**File:** `backend/database/migrations/2026_09_01_001_create_programme_types_table.sql`
**Status:** Ready to apply

### How to Apply

#### Option 1: Run via CLI (Recommended)
```bash
cd c:\xampp\htdocs\cur-mis
php backend/scripts/migrate.php
```

#### Option 2: Run via Web Endpoint
Access the deploy endpoint with your DEPLOY_KEY:
```bash
curl -X POST http://cur.ac.rw/api/deploy/migrate \
  -H "Authorization: Bearer $DEPLOY_KEY"
```

#### Option 3: Manual SQL Execution
Run the SQL directly in your MySQL client:

```sql
CREATE TABLE IF NOT EXISTS `programme_types` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(50) NOT NULL UNIQUE COLLATE utf8mb4_unicode_ci,
  `display_name` VARCHAR(100) NOT NULL,
  `description` TEXT,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  KEY `idx_name` (`name`),
  KEY `idx_is_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `programme_types` (`name`, `display_name`, `description`, `is_active`) VALUES
('day', 'Day', 'Full-time day programmes', 1),
('evening', 'Evening', 'Evening programmes', 1),
('weekend', 'Weekend', 'Weekend programmes', 1),
('holiday', 'Holiday', 'Holiday programmes', 1),
('distance_learning', 'Distance Learning', 'Distance learning programmes', 1);
```

#### Option 4: Using XAMPP phpMyAdmin
1. Open http://localhost/phpmyadmin
2. Select the `cur_mis` database
3. Go to SQL tab
4. Paste the SQL above and execute

### Verification

After running the migration, verify with:
```bash
php backend/scripts/migrate.php --status
```

Or check the data:
```sql
SELECT id, name, display_name FROM programme_types WHERE is_active = 1 ORDER BY id;
```

Expected output:
```
id | name             | display_name
1  | day              | Day
2  | evening          | Evening
3  | weekend          | Weekend
4  | holiday          | Holiday
5  | distance_learning | Distance Learning
```

### What's Ready

- ✅ Backend API endpoint: `/api/portal/programme-types`
- ✅ Frontend dropdown component
- ✅ Form validation
- ✅ Database migration file
- ⏳ **Database table** (awaiting migration)

Once the migration is applied, the Mode of Study dropdown will populate automatically.

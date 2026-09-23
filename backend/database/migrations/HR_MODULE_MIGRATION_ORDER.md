# HR Module Migration Execution Order

**Execute these migrations in order on your production server.**

## RESET (if needed)
```sql
-- Run this FIRST if you need to start fresh
2026_09_04_000_reset_hr_module.sql
```

## PHASE 1: Foundation (Supervisor Hierarchy)
```sql
1. 2026_09_04_001_leave_supervisor_hierarchy.sql
2. 2026_09_04_002_assign_supervisors_organizational_hierarchy.sql
```

## PHASE 2: Enhanced Employee Data
```sql
3. 2026_09_04_003_hr_module_enhanced_employees.sql
```

## PHASE 3: Payroll Setup
```sql
4. 2026_09_04_004_hr_module_payroll_salary.sql
```

## PHASE 4: Leave Management
```sql
5. 2026_09_04_005_hr_module_leave_management.sql
```

## PHASE 5: Contracts & Certificates
```sql
6. 2026_09_04_006_hr_module_contracts_certificates.sql
```

## PHASE 6: Data Migration (Optional - for users table)
```sql
7. 2026_09_04_007_migrate_employees_to_users.sql
```

## PHASE 7: HR Employees Integration (for hr_employees table - RECOMMENDED)
```sql
8. 2026_09_04_008_hr_module_integrate_hr_employees.sql
9. 2026_09_04_009_populate_hr_data_from_hr_employees.sql
```

## What Each Migration Does

| Migration | Purpose | Tables Created | Notes |
|-----------|---------|-----------------|-------|
| 001 | Supervisor hierarchy | leave_approval_stages | Configures approval workflow |
| 002 | Assign supervisors | Updates users table | Links employees to supervisors |
| 003 | Enhanced employees | employee_profiles, qualifications, financial_info, identifiers | HR fields on users |
| 004 | Payroll system | salary_component_types, salary_structures, employee_salary_assignments, payroll_runs, payroll_details | Full payroll setup |
| 005 | Leave management | leave_balances, leave_request_attachments, leave_notifications | 8 leave types configured |
| 006 | Contracts & certs | contract_types, employee_contracts, contract_notifications, certificate_types, certificate_requests, certificate_audit | 5 contract types, 5 cert types |
| 007 | Employee → Users | Migrates from employees table | Optional (if using employees table) |
| 008 | HR Employees Integration | Creates profiles, financial, contracts | For existing hr_employees table |
| 009 | Populate HR Data | Populates all 15 employees | Ensures all data is populated |

## How to Execute

### Option A: Via phpMyAdmin
1. Open phpMyAdmin
2. Go to SQL tab
3. Copy-paste each migration SQL in order
4. Click "Go" after each

### Option B: Via MySQL CLI
```bash
mysql -u root -p cur_mis < 2026_09_04_000_reset_hr_module.sql
mysql -u root -p cur_mis < 2026_09_04_001_leave_supervisor_hierarchy.sql
mysql -u root -p cur_mis < 2026_09_04_002_assign_supervisors_organizational_hierarchy.sql
mysql -u root -p cur_mis < 2026_09_04_003_hr_module_enhanced_employees.sql
mysql -u root -p cur_mis < 2026_09_04_004_hr_module_payroll_salary.sql
mysql -u root -p cur_mis < 2026_09_04_005_hr_module_leave_management.sql
mysql -u root -p cur_mis < 2026_09_04_006_hr_module_contracts_certificates.sql
mysql -u root -p cur_mis < 2026_09_04_008_hr_module_integrate_hr_employees.sql
mysql -u root -p cur_mis < 2026_09_04_009_populate_hr_data_from_hr_employees.sql
```

### Option C: Bash Script (Automated)
```bash
#!/bin/bash
DB_USER="root"
DB_PASS="your_password"
DB_NAME="cur_mis"

MIGRATIONS=(
  "2026_09_04_001_leave_supervisor_hierarchy.sql"
  "2026_09_04_002_assign_supervisors_organizational_hierarchy.sql"
  "2026_09_04_003_hr_module_enhanced_employees.sql"
  "2026_09_04_004_hr_module_payroll_salary.sql"
  "2026_09_04_005_hr_module_leave_management.sql"
  "2026_09_04_006_hr_module_contracts_certificates.sql"
  "2026_09_04_008_hr_module_integrate_hr_employees.sql"
  "2026_09_04_009_populate_hr_data_from_hr_employees.sql"
)

for migration in "${MIGRATIONS[@]}"; do
  echo "Running: $migration"
  mysql -u $DB_USER -p$DB_PASS $DB_NAME < "backend/database/migrations/$migration"
  if [ $? -eq 0 ]; then
    echo "✅ $migration completed"
  else
    echo "❌ $migration failed - STOP and check errors"
    exit 1
  fi
done

echo "✅ All migrations completed successfully!"
```

## Verification After Migration

```sql
-- Check all tables exist
SELECT 'leave_balances' as table_name, COUNT(*) as count FROM leave_balances
UNION ALL
SELECT 'employee_profiles', COUNT(*) FROM employee_profiles
UNION ALL
SELECT 'employee_contracts', COUNT(*) FROM employee_contracts
UNION ALL
SELECT 'contract_types', COUNT(*) FROM contract_types
UNION ALL
SELECT 'certificate_types', COUNT(*) FROM certificate_types;

-- Expected results:
-- leave_balances: ~120 rows (15 employees × 8 leave types)
-- employee_profiles: 15 rows
-- employee_contracts: 15 rows
-- contract_types: 5 rows
-- certificate_types: 5 rows
```

## Troubleshooting

If a migration fails:
1. Check the error message
2. Verify the previous migration completed
3. Check for duplicate constraints (if re-running)
4. Run reset migration and start over

All migrations use:
- `INSERT IGNORE` for safe re-runs
- `CREATE TABLE IF NOT EXISTS` for idempotency
- `DROP TABLE IF EXISTS` for dependency handling
- Foreign key checks disabled during creation

**All migrations are idempotent and safe to re-run multiple times.**

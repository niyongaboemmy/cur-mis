# HR Monitoring System - Location Guide

## Current Status

✅ **Database Schema Created** - 17 monitoring tables ready
⏳ **UI/Controllers** - Not yet built (next phase)

## Where to Find HR Monitoring Features

### **Current HR Management Menu**

Location in sidebar: **HR Management** (Briefcase icon)

**Current Menu Items:**
```
HR Management
├── All staff           → View employees
├── Payroll             → Salary/compensation
├── Salary              → Payment management
├── Leave               → Leave requests
├── Leave Approvals     → Approve leave
├── Appraisals          → Performance appraisals
├── Payroll Settings    → Configuration
└── Academic Reports    → Registrar reports
```

---

## Where Monitoring Features WILL Appear

Once we build the UI, these sections will be added to **HR Management** menu:

### **1. Staff Performance Monitoring**
**New Menu Item:** `Performance & Development`
- Path: `/hr/performance`
- Features:
  - Performance appraisals
  - Performance targets & goals
  - Teaching effectiveness monitoring
  - Professional development tracking
  - Punctuality & attendance tracking

### **2. Recruitment & Staffing Monitoring**
**New Menu Item:** `Recruitment`
- Path: `/hr/recruitment`
- Features:
  - Open positions/vacancies
  - Candidate tracking
  - Application stages
  - Interview scheduling
  - Probation monitoring
  - New hire confirmations

### **3. Compensation & Benefits Monitoring**
**New Menu Item:** `Compensation & Benefits` (or under Payroll Settings)
- Path: `/hr/compensation`
- Features:
  - Payroll audits & verification
  - Benefits tracking (RSBB, health insurance)
  - Salary scale compliance
  - Deduction verification
  - Staff welfare programs

### **4. Compliance & Policy Monitoring**
**New Menu Item:** `Compliance`
- Path: `/hr/compliance`
- Features:
  - HR Charter compliance audits
  - Rwanda labor law compliance (MINEDUC, HLI)
  - Policy adherence tracking
  - Compliance reports
  - Follow-up actions

### **5. Employee Relations Monitoring** ⭐ HIGHLIGHTED
**New Menu Item:** `Employee Relations`
- Path: `/hr/employee-relations`
- Features:
  - **Grievance tracking** (filed, resolution, follow-up)
  - **Conflict resolution** (mediation records)
  - **Staff satisfaction surveys** (engagement scores)
  - **Counseling programs** (mentorship, support)
  - Communication monitoring
  - Teamwork & harmony tracking

### **6. Data & Record Monitoring**
**New Menu Item:** `Data Quality`
- Path: `/hr/data-quality`
- Features:
  - HR database audits
  - Data accuracy verification
  - Leave records accuracy
  - Contract data validation
  - Regular HR reports

### **7. Turnover & Retention Monitoring**
**New Menu Item:** `Turnover & Retention`
- Path: `/hr/turnover`
- Features:
  - Exit interview tracking
  - Turnover rate analytics
  - Retention strategies
  - Average tenure tracking
  - Exit reasons analysis
  - Rehire eligibility

---

## Updated HR Management Menu (After Implementation)

```
HR Management (Briefcase icon)
├── All staff
├── Payroll
├── Salary
├── Leave
├── Leave Approvals
├── Appraisals
├── Payroll Settings
├── Academic Reports
│
├── ─── MONITORING FEATURES (NEW) ───
├── Performance & Development ⭐
├── Recruitment
├── Compensation & Benefits
├── Compliance
├── Employee Relations ⭐ (highlighted from your doc)
├── Data Quality
└── Turnover & Retention
```

---

## Database Tables Ready

All 17 tables are created and waiting:

### Performance Monitoring
- `performance_appraisals`
- `performance_targets`

### Recruitment
- `recruitment_posts`
- `recruitment_candidates`
- `probation_records`

### Compensation
- `payroll_audits`
- `benefits_tracking`

### Compliance
- `policy_compliance_audits`
- `labor_law_compliance`

### Employee Relations
- `grievances`
- `conflict_resolutions`
- `staff_satisfaction_surveys`
- `counseling_records`

### Data Quality
- `hr_data_audits`

### Turnover
- `exit_interviews`
- `turnover_analytics`
- `retention_strategies`

---

## How to Access When Built

### Step 1: Sign in to system
- Go to: https://cur.ac.rw/umis/
- Login with HR credentials

### Step 2: Navigate to Monitoring
- Click **HR Management** in sidebar (Briefcase icon)
- Select desired monitoring section

### Step 3: View/Add Monitoring Data
- View existing records
- Add new monitoring entries
- Export reports
- Track trends

---

## Current Status Summary

| Feature | Status | Location |
|---------|--------|----------|
| Database tables | ✅ Ready | Applied via migrate-backend.yml |
| Backend controllers | ⏳ Pending | Will be in backend/app/Controllers/HrMonitoring* |
| Frontend pages | ⏳ Pending | Will be in frontend/src/pages/hr/ |
| API routes | ⏳ Pending | Will be in backend/routes/api/hr-monitoring.php |
| UI Components | ⏳ Pending | Will be in frontend/src/components/hr/ |
| Sidebar menu items | ⏳ Pending | Will be added to MainLayout.tsx |

---

## Next Implementation Steps

1. ✅ Database schema created (`2026_09_06_003_hr_monitoring_system.sql`)
2. ⏳ Run migration workflow to create tables
3. ⏳ Build backend controllers for each monitoring section
4. ⏳ Build API routes for CRUD operations
5. ⏳ Build frontend pages and components
6. ⏳ Add menu items to HR Management sidebar
7. ⏳ Test monitoring workflows
8. ⏳ Deploy to production

---

## Questions?

- Where are tables stored? Database (`cur_mis` database)
- Do I need special permissions? Yes, HR management permissions required
- Can I export reports? Yes (will be available after UI built)
- Multiple campuses support? Yes (data structure supports it)
- Data retention policy? To be configured per institution policy

---

**Last Updated:** 2026-09-06
**Database Migration:** Commit `7eba1c6`
**Status:** Ready for monitoring system implementation

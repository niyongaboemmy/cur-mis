# HR Monitoring System - User Guide

## Quick Start

### Access the Dashboard
1. Sign in to https://cur.ac.rw/umis/
2. Click **HR Management** in the left sidebar (Briefcase icon)
3. Scroll down to **Monitoring Dashboard**
4. View live metrics and click quick-action cards

### Dashboard Metrics

| Metric | What it Shows | Action |
|--------|---------------|--------|
| **Open Grievances** | Employee grievances awaiting resolution | Click to view all grievances |
| **Open Conflicts** | Unresolved workplace conflicts | Click to manage conflict resolution |
| **Pending Appraisals** | Performance appraisals in draft state | Click to complete appraisals |
| **Open Positions** | Active recruitment postings | Click to manage recruitment |
| **Turnover Rate** | Annual staff turnover percentage | Click to view retention analytics |

---

## How to Add Data

### Method 1: Load Sample Data (Recommended for Testing)

```bash
# Run this command in your MySQL client or terminal
mysql -u root -p cur_mis < database/seeds/seed_hr_monitoring_data.sql
```

**What gets loaded:**
- 5 performance appraisals
- 5 performance targets
- 3 recruitment posts with 5 candidates
- 3 probation records
- 2 payroll audits
- 5 benefits records
- 3 policy compliance audits
- 4 grievances
- 3 conflict resolutions
- 2 staff satisfaction surveys
- 3 counseling records
- 3 HR data audits
- 2 exit interviews
- 2 turnover analytics reports
- 4 retention strategies

### Method 2: Add Data Through API (Production)

#### Example 1: Record a Grievance
```bash
curl -X POST https://cur.ac.rw/umis/api/hr/monitoring/grievances \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "employee_id": 5,
    "grievance_date": "2026-09-06",
    "grievance_type": "Salary Dispute",
    "grievance_description": "Incorrect deduction in September salary",
    "assigned_to": 6
  }'
```

#### Example 2: Record an Exit Interview
```bash
curl -X POST https://cur.ac.rw/umis/api/hr/monitoring/exit-interviews \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "employee_id": 25,
    "exit_date": "2026-09-15",
    "reason_for_leaving": "Better opportunity elsewhere",
    "interviewer_id": 5,
    "job_satisfaction": 4,
    "management_satisfaction": 4,
    "work_environment_satisfaction": 3,
    "comments": "Good experience. Moving to pursue better opportunities.",
    "would_rehire": true
  }'
```

#### Example 3: Create a Performance Appraisal
```bash
curl -X POST https://cur.ac.rw/umis/api/hr/monitoring/appraisals \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "employee_id": 3,
    "appraisal_period": "2026-Q3",
    "appraisal_date": "2026-09-06",
    "rating": 4.5,
    "comments": "Outstanding performance in curriculum development",
    "appraiser_id": 5
  }'
```

#### Example 4: File a Recruitment Post
```bash
curl -X POST https://cur.ac.rw/umis/api/hr/monitoring/recruitment/posts \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "position_title": "Senior Lecturer",
    "department_id": 1,
    "position_level": "Lecturer",
    "vacancy_count": 1,
    "posting_date": "2026-09-06",
    "closing_date": "2026-10-06",
    "description": "Seeking experienced senior lecturer for Computer Science department"
  }'
```

### Method 3: Manual Data Entry (UI - Coming Soon)

Once individual page components are built, you'll be able to:
- Click "Add Grievance" button → Fill form → Submit
- Click "Record Counseling Session" → Enter details → Save
- Click "Post Job Opening" → Fill recruitment form → Publish

---

## Monitoring Sections

### 1. Performance & Development
**Track:** Appraisals, performance targets, professional development

**Use cases:**
- Record quarterly performance appraisals
- Set and track individual performance targets
- Monitor teaching effectiveness
- Track professional development outcomes

**Key metrics:**
- Appraisal completion rate
- Target achievement rate
- Average performance rating

### 2. Recruitment
**Track:** Open positions, candidate applications, hiring progress

**Use cases:**
- Post job openings
- Track candidate applications
- Schedule interviews
- Manage hiring pipeline
- Track new hire confirmations

**Key metrics:**
- Time-to-fill (days to hire)
- Applications per position
- Candidate stage distribution

### 3. Employee Relations
**Track:** Grievances, conflicts, satisfaction surveys, counseling

**Use cases:**
- File and track employee grievances
- Record conflict mediation sessions
- Conduct staff satisfaction surveys
- Log counseling and mentoring sessions
- Monitor employee satisfaction trends

**Key metrics:**
- Average grievance resolution time
- Staff satisfaction score
- Conflict resolution success rate

### 4. Compliance & Policy
**Track:** Policy audits, labor law compliance, regulatory adherence

**Use cases:**
- Audit HR Charter compliance
- Monitor Rwanda labor law adherence (MINEDUC, HLI)
- Track policy implementation
- Document compliance issues and corrections

**Key metrics:**
- Compliance percentage
- Policy violations found
- Corrective action completion

### 5. Turnover & Retention
**Track:** Exit interviews, turnover rates, retention strategies

**Use cases:**
- Conduct exit interviews
- Analyze turnover trends
- Track retention strategies
- Identify high-risk employees
- Monitor retention program effectiveness

**Key metrics:**
- Turnover rate (%)
- Average tenure (months)
- Exit reasons analysis

---

## Sample Data Scenarios

### Scenario 1: Responding to a Grievance

**Dashboard shows:** 4 Open Grievances

**Process:**
1. Click "Relations" card
2. Select grievance from John Mwizerwa about salary dispute
3. Click "Resolve"
4. Enter resolution: "Deduction corrected, arrears paid"
5. Set satisfaction rating: 4/5
6. Status changes to "resolved"

### Scenario 2: Monitoring Recruitment

**Dashboard shows:** 3 Open Positions

**Process:**
1. Click "Recruitment" card
2. See "Lecturer in Computer Science" position
3. View 3 candidates at different stages
4. Schedule interview with John Mwizerwa on 2026-09-15
5. After interview, update status

### Scenario 3: Reviewing Performance

**Dashboard shows:** 1 Pending Appraisal

**Process:**
1. Click "Performance" card
2. Open Q3 appraisal for employee #4
3. Review performance rating (4.5/5.0)
4. Mark as "completed"
5. View performance targets achieved (1/1)

---

## API Endpoints Reference

### Performance Monitoring
- `GET /api/hr/monitoring/appraisals` - List appraisals
- `POST /api/hr/monitoring/appraisals` - Create appraisal

### Recruitment
- `GET /api/hr/monitoring/recruitment/posts` - List job posts
- `POST /api/hr/monitoring/recruitment/posts` - Create job post
- `GET /api/hr/monitoring/recruitment/candidates` - List candidates

### Employee Relations
- `GET /api/hr/monitoring/grievances` - List grievances
- `POST /api/hr/monitoring/grievances` - File grievance
- `PUT /api/hr/monitoring/grievances/:id` - Update grievance status
- `GET /api/hr/monitoring/conflicts` - List conflicts
- `POST /api/hr/monitoring/conflicts` - Record conflict
- `GET /api/hr/monitoring/counseling` - List counseling records
- `POST /api/hr/monitoring/counseling` - Record counseling session

### Turnover & Retention
- `GET /api/hr/monitoring/exit-interviews` - List exit interviews
- `POST /api/hr/monitoring/exit-interviews` - Record exit interview
- `GET /api/hr/monitoring/turnover-analytics` - View turnover analytics

### Dashboard
- `GET /api/hr/monitoring/dashboard` - Get dashboard summary metrics

---

## Data Fields Reference

### Grievance Record
```json
{
  "employee_id": "Required",
  "grievance_date": "Date filed",
  "grievance_type": "Salary/Leave/Work Conditions/Promotion/etc",
  "grievance_description": "Detailed description",
  "status": "filed/in_review/resolved",
  "assigned_to": "HR staff member ID",
  "resolution_date": "When resolved",
  "resolution_notes": "How it was resolved",
  "satisfaction_rating": "1-5 scale"
}
```

### Performance Appraisal
```json
{
  "employee_id": "Required",
  "appraisal_period": "2026-Q3",
  "appraisal_date": "Date of appraisal",
  "rating": "1.0 to 5.0",
  "comments": "Detailed feedback",
  "appraiser_id": "Supervisor/Manager ID",
  "status": "draft/completed"
}
```

### Exit Interview
```json
{
  "employee_id": "Required",
  "exit_date": "Last day",
  "reason_for_leaving": "Better opportunity/Relocation/etc",
  "interviewer_id": "HR staff ID",
  "job_satisfaction": "1-5 scale",
  "management_satisfaction": "1-5 scale",
  "work_environment_satisfaction": "1-5 scale",
  "comments": "General feedback",
  "would_rehire": "true/false"
}
```

---

## Reports & Analytics

### Available Reports
1. **Performance Summary Report**
   - Appraisal completion rates by department
   - Average performance ratings
   - Target achievement rates

2. **Recruitment Pipeline Report**
   - Open positions by department
   - Candidate stage distribution
   - Time-to-fill metrics

3. **Employee Relations Report**
   - Grievance resolution times
   - Conflict resolution success rates
   - Staff satisfaction trends

4. **Turnover Report**
   - Turnover rate by department
   - Exit reasons analysis
   - Retention strategy effectiveness

---

## Permissions Required

- **View HR Employees** - Access monitoring dashboard, view data
- **Manage HR Employees** - Create, edit, and resolve monitoring records

---

## Tips & Best Practices

1. **Regular Updates** - Update data weekly to keep metrics fresh
2. **Timely Resolution** - Aim to resolve grievances within 5-7 days
3. **Documentation** - Always include detailed notes for audit trails
4. **Follow-up** - Schedule follow-up dates for counseling and conflict resolution
5. **Data Quality** - Verify all employee IDs and dates before submitting
6. **Confidentiality** - Keep sensitive employee data private and secure

---

## Troubleshooting

### Dashboard Shows No Data
- Ensure sample data is loaded: `mysql -u root -p cur_mis < database/seeds/seed_hr_monitoring_data.sql`
- Verify you have VIEW_HR_EMPLOYEES permission
- Check browser cache (Ctrl+Shift+Delete)

### API Returns 404
- Ensure authentication token is valid
- Check endpoint URL is correct
- Verify permissions are granted

### Cannot Submit Form
- Ensure all required fields are filled
- Check that employee ID exists in system
- Verify date format is correct (YYYY-MM-DD)

---

## Contact & Support

For issues or questions:
- HR Manager: hr.manager@cur.ac.rw
- System Administrator: admin@cur.ac.rw
- Technical Support: support@cur.ac.rw

---

**Last Updated:** 2026-09-06
**Version:** 1.0
**Status:** Production Ready

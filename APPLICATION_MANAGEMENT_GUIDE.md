# Application Management Guide

## **How to Edit or Delete Student Applications Before Enrollment**

Student applications can be modified before they're moved to the `student` table (enrolled). Here's how:

---

## **1. VIEW Applications in Admin Dashboard**

**URL:** `https://cur.ac.rw/umis/admin/admissions/applications`

- Search by name, email, or application number
- Filter by status (Pending, In Review, Offered, Enrolled)
- Filter by intake, campus, mode of study, level, payment status

---

## **2. EDIT Application Information**

### **Via Admin UI (Recommended)**

1. Click on applicant's row → "View" button
2. Click "Edit" button on the application detail page
3. Modify fields:
   - First Name, Last Name
   - Email, Phone
   - Program, Campus
   - **Mode of Study** (now with dropdown: Day, Evening, Weekend, Holiday, Distance Learning)
   - Level, Intake
   - Academic info, sponsorship, etc.
4. Click "Save Changes"
5. Status change is logged automatically

### **Via API (For Integration)**

**PATCH** `/api/admin/applications/:id`
```bash
curl -X PATCH https://cur.ac.rw/api/admin/applications/123 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "Updated Name",
    "email": "new@email.com",
    "phone": "0788123456",
    "mode_of_study": 2,
    "campus_id": 3,
    "program_id": 45,
    "level_id": 1
  }'
```

### **Via SQL (Direct Database)**

⚠️ **Use only if comfortable with SQL:**

```sql
-- Find the application
SELECT id, application_number, first_name, last_name, email, mode_of_study, campus_id, program_id
FROM student_applications 
WHERE application_number = 'APP-2026-00123';

-- Update specific fields
UPDATE student_applications 
SET 
  first_name = 'Corrected Name',
  email = 'correct@email.com',
  phone = '0788999999',
  mode_of_study = 2,      -- Evening (see programme_types table)
  campus_id = 2,
  program_id = 45
WHERE id = 123
  AND status NOT IN ('enrolled', 'offer_declined');  -- Safety check

-- Verify
SELECT * FROM student_applications WHERE id = 123;
```

---

## **3. DELETE Application (Request Resubmission)**

### **Via Admin UI**

1. Open application detail
2. Click "Delete Application" button
3. Confirm deletion
4. Send notification to applicant to resubmit

### **Via API**

**DELETE** `/api/admin/applications/:id`
```bash
curl -X DELETE https://cur.ac.rw/api/admin/applications/123 \
  -H "Authorization: Bearer $TOKEN"
```

### **Via SQL**

```sql
-- First, delete associated documents
DELETE FROM application_documents 
WHERE application_id = 123;

-- Delete status logs
DELETE FROM application_status_logs 
WHERE application_id = 123;

-- Delete pending notes
DELETE FROM application_pending_notes 
WHERE application_id = 123;

-- Finally, delete the application
DELETE FROM student_applications 
WHERE id = 123 
  AND status NOT IN ('enrolled', 'offer_declined');

-- Verify
SELECT * FROM student_applications WHERE id = 123;
```

---

## **4. MODE OF STUDY Reference**

After the `programme_types` migration is applied:

```sql
SELECT id, name, display_name FROM programme_types WHERE is_active = 1;
```

| ID | Name | Display Name |
|---|---|---|
| 1 | day | Day |
| 2 | evening | Evening |
| 3 | weekend | Weekend |
| 4 | holiday | Holiday |
| 5 | distance_learning | Distance Learning |

Use the **ID** (not name) when updating:
```sql
UPDATE student_applications SET mode_of_study = 2 WHERE id = 123;  -- Sets to Evening
```

---

## **5. Status Workflow**

Applications go through these statuses. Editing is allowed in:

| Status | Can Edit | Can Delete | Next Status |
|--------|----------|------------|-------------|
| draft | ✅ Yes | ✅ Yes | submitted |
| submitted | ✅ Yes | ✅ Yes | documents_under_review |
| documents_under_review | ✅ Yes | ✅ Yes | documents_rejected / assessment |
| assessment | ✅ Yes | ✅ Yes | merit_listed / rejected |
| merit_listed | ✅ Yes | ❌ No | offered |
| offered | ⚠️ Limited | ❌ No | offer_accepted / offer_declined |
| offer_accepted | ❌ No | ❌ No | enrolled |
| enrolled | ❌ No | ❌ No | (Final) |
| offer_declined | ❌ No | ❌ No | (Final) |

---

## **6. Workflow: Correct & Continue**

### **Scenario: Applicant submitted with wrong Mode of Study**

**Steps:**
1. Admin opens application in dashboard
2. Clicks Edit
3. Changes Mode of Study from "Day" to "Evening"
4. Saves
5. Application continues to next stage with corrected data
6. Auto-notification sent to applicant (optional)

---

## **7. Workflow: Reject & Resubmit**

### **Scenario: Critical data issues, applicant must resubmit**

**Steps:**
1. Admin opens application
2. Clicks "Delete Application"
3. Sends message to applicant: "Please resubmit with correct information"
4. Applicant receives notification
5. Applicant logs into portal at `https://cur.ac.rw/umis/apply`
6. Can see "Deleted" status and "Resubmit" option
7. Fills form again with correct data
8. Resubmits

---

## **8. Best Practices**

✅ **DO:**
- Edit before documents are rejected or merit lists are generated
- Log reason for changes in application notes
- Notify applicant of corrections via email
- Verify Mode of Study ID matches programme_types table
- Double-check campus and program are compatible

❌ **DON'T:**
- Edit after enrollment (status = 'enrolled')
- Delete without notifying applicant
- Update mode_of_study to ID that doesn't exist
- Mass delete applications without backup
- Edit payment status directly (use billing system)

---

## **9. Audit Trail**

All changes are logged in `application_status_logs`:

```sql
SELECT id, from_status, to_status, actor_type, actor_name, notes, created_at
FROM application_status_logs
WHERE application_id = 123
ORDER BY created_at DESC;
```

Changes show:
- Who made the change
- When it was made
- What status changed to
- Reason/notes

---

## **10. Troubleshooting**

### **"Cannot update enrolled application"**
- Application is already in student table
- Must use student edit functions instead
- Contact registry if urgent correction needed

### **"Mode of Study ID not found"**
- Check if `programme_types` migration was applied
- Run: `SELECT * FROM programme_types;`
- Use correct ID from table (1-5)

### **"Campus not available for program"**
- Programme may not be offered at that campus
- Check `option_campuses` table
- Select a compatible campus

---

## **Contact & Support**

- **Registry:** admissions@cur.ac.rw
- **IT Support:** support@cur.ac.rw
- **Documentation:** See MIGRATION_INSTRUCTIONS.md for database setup

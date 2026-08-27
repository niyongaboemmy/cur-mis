# 🏦 Bordereau Payment Verification Feature

**Date**: 2026-08-27  
**Status**: Implementation Complete  
**Version**: 1.0

---

## 📋 Overview

The Bordereau Payment Verification feature allows students who have paid their application fees via bank transfer (Bordereau/check) to submit their receipt numbers for manual verification by Finance or Registrar staff. This provides a clear, accountable workflow for non-electronic payments while preventing unauthorized progression without proper verification.

### Key Features

✅ Students can submit Bordereau receipt numbers  
✅ Finance/Registrar receive notification requests  
✅ Manual review with approve/reject workflow  
✅ Up to 3 resubmission attempts allowed  
✅ Automatic payment status updates when approved  
✅ Dashboard for Finance staff to track all submissions  
✅ Dedicated verification page for Finance/Registrar  

---

## 🎯 Workflow

```
Student Submits Receipt
        ↓
┌───────────────────────────────────┐
│  Finance & Registrar Receive      │
│  Notification (Pending Review)    │
└───────────────────────────────────┘
        ↓
┌─────────────────────────────────────────────┐
│  Staff Reviews Submission Details:          │
│  - Receipt Number                           │
│  - Amount Paid                              │
│  - Bank Name & Account Holder               │
│  - Payment Date                             │
│  - Compared against Required Amount         │
└─────────────────────────────────────────────┘
        ↓
    ┌───┴───┐
    ↓       ↓
┌────────┐ ┌──────────────────────────┐
│Approve │ │Reject with Reason        │
└────┬───┘ └────────────┬─────────────┘
     ↓                  ↓
Payment Status      Status = Rejected
Updated to PAID     Student Can Retry
                    (Max 3 attempts)
     ↓
Student Can Proceed
to Next Step
```

---

## 🗄️ Database Schema

### `bordereau_submissions`
Stores all student Bordereau receipt submissions.

```sql
CREATE TABLE `bordereau_submissions` (
  `id` INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  `application_id` INT UNSIGNED NOT NULL,
  `student_id` VARCHAR(20) NOT NULL,
  `receipt_number` VARCHAR(50) NOT NULL UNIQUE,
  `amount` DECIMAL(12,2) NOT NULL,
  `bank_name` VARCHAR(100),
  `account_holder_name` VARCHAR(150),
  `payment_date` DATE,
  `notes` TEXT,
  `status` ENUM('pending','approved','rejected'),
  `reviewed_by` INT UNSIGNED,
  `rejection_reason` TEXT,
  `reviewed_at` DATETIME,
  `submission_attempt` INT UNSIGNED DEFAULT 1,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`application_id`) REFERENCES `student_applications`(`id`)
);
```

### `bordereau_verification_requests`
Notification queue for Finance/Registrar staff.

```sql
CREATE TABLE `bordereau_verification_requests` (
  `id` INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  `bordereau_submission_id` INT UNSIGNED NOT NULL,
  `recipient_role` ENUM('finance','registrar') NOT NULL,
  `is_read` TINYINT(1) DEFAULT 0,
  `read_at` DATETIME,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`bordereau_submission_id`) REFERENCES `bordereau_submissions`(`id`)
);
```

### `student_applications` (additions)
Tracks Bordereau payment status for each application.

```sql
ALTER TABLE `student_applications` ADD COLUMN
  `bordereau_payment_status` ENUM('not_submitted','pending_review','approved','rejected'),
  `bordereau_submission_id` INT UNSIGNED;
```

---

## 🔌 API Endpoints

### Applicant Endpoints

#### GET `/api/applicant/bordereau/:applicationId/status`
Get current Bordereau submission status for an application.

**Response:**
```json
{
  "application_id": 23,
  "required_amount": 36000,
  "current_submission": {
    "id": 1,
    "status": "pending",
    "receipt_number": "BR-2026-001234",
    "amount": 36000,
    "attempt": 1,
    "rejection_reason": null,
    "reviewed_at": null
  },
  "can_submit": true,
  "resubmit_reason": null,
  "remaining_attempts": 3
}
```

#### POST `/api/applicant/bordereau/submit`
Submit a Bordereau receipt for verification.

**Request:**
```json
{
  "application_id": 23,
  "receipt_number": "BR-2026-001234",
  "amount": 36000,
  "bank_name": "BK",
  "account_holder_name": "JEAN BOSCO",
  "payment_date": "2026-08-25"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Receipt submitted successfully. Finance team will review within 24 hours.",
  "submission_id": 1,
  "attempt": 1,
  "remaining_attempts": 2
}
```

### Finance/Registrar Endpoints

#### GET `/api/finance/bordereau/pending?role=finance`
Get pending Bordereau submissions requiring review.

**Response:**
```json
{
  "pending_count": 3,
  "submissions": [
    {
      "id": 1,
      "application_id": 23,
      "student_id": "STD001",
      "receipt_number": "BR-2026-001234",
      "amount": 36000,
      "bank_name": "BK",
      "account_holder_name": "JEAN BOSCO",
      "payment_date": "2026-08-25",
      "status": "pending",
      "submission_attempt": 1,
      "created_at": "2026-08-27T10:30:00Z",
      "first_name": "JEAN",
      "last_name": "BOSCO",
      "application_reference": "APP-2026-00023",
      "required_amount": 36000,
      "is_read": false
    }
  ]
}
```

#### POST `/api/finance/bordereau/:id/approve`
Approve a Bordereau submission.

**Request:**
```
Form Data:
submission_id: 1
```

**Response:**
```json
{
  "success": true,
  "message": "Bordereau payment approved. Student can now proceed.",
  "application_id": 23
}
```

**Actions taken:**
- Updates `bordereau_submissions.status` → 'approved'
- Updates `student_applications.payment_status` → 'paid'
- Updates `student_applications.bordereau_payment_status` → 'approved'
- Marks verification requests as read
- Logs action in `application_status_log`

#### POST `/api/finance/bordereau/:id/reject`
Reject a Bordereau submission with reason.

**Request:**
```json
{
  "submission_id": 1,
  "rejection_reason": "Receipt amount does not match required fee amount"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Bordereau payment rejected. Student has been notified.",
  "can_resubmit": true,
  "remaining_attempts": 2,
  "application_id": 23
}
```

#### GET `/api/finance/bordereau/dashboard-stats`
Get Bordereau verification dashboard statistics.

**Response:**
```json
{
  "stats": {
    "pending_count": 3,
    "approved_count": 42,
    "rejected_count": 5,
    "total_approved_amount": 1512000,
    "last_submission_date": "2026-08-27"
  }
}
```

---

## 🎨 Frontend Components

### BordereauPaymentForm
Component for students to submit their Bordereau receipt number.

**Props:**
- `applicationId: number` - The application being paid for
- `requiredAmount: number` - The fee amount to be paid
- `isOpen: boolean` - Modal visibility
- `onClose: () => void` - Close handler
- `onApproved?: () => void` - Called when payment is approved

**Features:**
- Form validation for receipt number and amount
- Bank name and account holder details (optional)
- Payment date picker
- Shows current submission status (pending/approved/rejected)
- Allows resubmission with rejection reason display
- Tracks submission attempts (max 3)
- Real-time status updates

**Location:** `frontend/src/components/admission/BordereauPaymentForm.tsx`

### BordereauVerificationPage
Dashboard for Finance/Registrar to review and approve/reject submissions.

**Features:**
- Stats cards showing pending/approved/rejected counts
- List of all pending submissions with key details
- Inline review modal with approve/reject buttons
- Amount verification checks (exact match, overpayment, underpayment)
- Rejection reason input with validation
- Real-time polling for new submissions (5-second interval)
- Read/unread tracking for submissions
- Filter for read/unread submissions

**Location:** `frontend/src/pages/finance/BordereauVerificationPage.tsx`

**Access Route:** `/finance/bordereau-verification`

---

## 🔐 Security & Authorization

### Authentication
- All endpoints require student/staff authentication
- JWT token validation on all requests

### Authorization Levels

**Applicant:**
- Can view their own application status
- Can submit receipts for their applications only
- Can view rejection reasons and resubmit
- Cannot view other applicants' submissions

**Finance Staff:**
- Can view all pending Bordereau submissions
- Can approve/reject submissions
- Can view submission details and rejection history
- Requires `approve_bordereau_payment` permission

**Registrar Staff:**
- Can view all pending Bordereau submissions (same as Finance)
- Can approve/reject submissions
- Can view submission details
- Requires `approve_bordereau_payment` permission

### Data Validation
- Receipt numbers must be unique across system
- Amount must be positive number
- Student can only resubmit up to 3 times
- Cannot submit while a pending review exists
- Application ownership verified before allowing submission

---

## 📝 Permissions Required

New permissions to add to the system:

```php
// In Permissions constants
'VIEW_BORDEREAU_FINANCE_VERIFICATION' => 'view_bordereau_finance_verification',
'VIEW_BORDEREAU_REGISTRAR_VERIFICATION' => 'view_bordereau_registrar_verification',
'APPROVE_BORDEREAU_PAYMENT' => 'approve_bordereau_payment',
```

**Default role assignments:**
- Finance: All three permissions
- Registrar: All three permissions
- Applicant: None (self-service only)

---

## 💾 Database Migration

Migration file: `2026_08_27_118_bordereau_payment_verification.sql`

**What it creates:**
1. `bordereau_submissions` table
2. `bordereau_verification_requests` table
3. Adds columns to `student_applications`:
   - `bordereau_payment_status`
   - `bordereau_submission_id`
4. Foreign keys and indexes for optimal query performance

**Running the migration:**
```bash
# SSH into server
ssh -p 2083 curac@cyimo-whm-private.aos.rw

# Navigate to app directory
cd /home/curac/umis

# Run migration
php artisan migrate --path=/path/to/migration/file
```

---

## 🔄 Student Experience

### Step 1: See Unpaid Fees
Student views their admission fees and sees an unpaid balance with two payment options:
- Pay Now (via Urubuto Pay / MTN MoMo / Airtel Money)
- **Bordereau** (new) - for bank transfers already made

### Step 2: Submit Receipt
Student clicks "Bordereau" button and fills in form:
- Receipt Number (required)
- Amount Paid (required)
- Bank Name (optional)
- Account Holder Name (optional)
- Payment Date (optional)

### Step 3: Awaiting Verification
Student sees "Under Review" status:
- Finance team will review within 24 hours
- Shows which attempt number (1-3)
- Can close form and continue browsing

### Step 4a: Payment Approved ✅
- Automatic toast notification
- Payment status changes to "Paid"
- Student can now proceed to next step
- Registration number is generated

### Step 4b: Payment Rejected ❌
- Student sees rejection reason
- Can immediately resubmit (if attempts remaining)
- After 3 rejections, must contact Finance

---

## 👨‍💼 Finance/Registrar Experience

### Step 1: Receive Notification
- Dashboard shows pending Bordereau count
- Notification for new submissions
- Can see unread submissions highlighted

### Step 2: Review Submission
Click on submission to see:
- Student name and application reference
- Receipt number (unique identifier)
- Amount paid vs. required amount
- Bank details if provided
- Submission timestamp
- Attempt number

### Step 3: Verify Information
System automatically checks:
- Amount matches required fee (✓ exact, ⚠️ over, ✗ under)
- Receipt number is unique
- Student is legitimate applicant

### Step 4: Approve or Reject

**Approve:**
- Clicks "Approve Payment" button
- Automatic confirmation dialog
- System updates payment status to "Paid"
- Student receives automatic notification
- Registration number is generated

**Reject:**
- Clicks "Reject Payment" button
- Must enter rejection reason (required field)
- Examples:
  - "Receipt number doesn't match bank records"
  - "Amount is below required fee"
  - "Account holder name doesn't match student"
  - "Receipt appears to be altered or fraudulent"
- Student can resubmit if attempts remaining

---

## 📊 Reporting & Analytics

### Dashboard Statistics
Finance can view:
- Total pending submissions (real-time)
- Total approved payments (cumulative)
- Total rejected payments
- Total amount approved (cumulative value)
- Last submission date

### Historical Data
All submissions are logged with:
- Submission timestamp
- Reviewer name and timestamp
- Approval/rejection details
- Attempt number
- All receipt and payment details

---

## ⚙️ Configuration

### Environment Variables
None required (uses existing database connection).

### Feature Flags
None - feature is always enabled.

### Customization Options

**Max submission attempts:**
Currently set to 3. To change:
1. Edit `BordereauxPaymentController.php` line ~145
2. Change `if ($submission['submission_attempt'] >= 3)` to your limit
3. Update frontend validation in `BordereauPaymentForm.tsx`

**Notification strategy:**
Currently sends notifications to both Finance and Registrar.
To change:
1. Edit migration file, line with `INSERT INTO bordereau_verification_requests`
2. Modify to send to single role or custom list

---

## 🧪 Testing Checklist

### Unit Tests
- [ ] Receipt number validation (unique, non-empty)
- [ ] Amount validation (positive, matches range)
- [ ] Submission attempt counting
- [ ] Status transitions (pending → approved/rejected)
- [ ] Permission checks on all endpoints
- [ ] Ownership verification for applications

### Integration Tests
- [ ] Student can submit Bordereau receipt
- [ ] Finance receives notification
- [ ] Finance can approve submission
- [ ] Payment status updates on approval
- [ ] Student can resubmit after rejection
- [ ] System prevents submission >3 attempts
- [ ] Registration number generates on approval
- [ ] Dashboard stats update correctly

### User Experience Tests
- [ ] Form validation shows proper error messages
- [ ] Status updates in real-time
- [ ] Modal closes properly after submission
- [ ] Rejection reason displays to student
- [ ] Approve/Reject buttons work correctly
- [ ] Permission gates work properly

### Edge Cases
- [ ] Duplicate receipt number prevention
- [ ] Concurrent submissions from same student
- [ ] Approval/rejection during pending state
- [ ] Status display when no submissions
- [ ] Empty dashboard behavior
- [ ] Network errors during submission

---

## 📞 Support & Troubleshooting

### Common Issues

**"Maximum submission attempts reached"**
- Student has used all 3 submission attempts
- Solution: Contact Finance at finance@cur.ac.rw to review and approve manually

**"This receipt number has already been submitted"**
- The same receipt number was already submitted (even if rejected)
- Solution: Use a different receipt number or contact Finance if duplicate is an error

**"Amount must be positive"**
- Amount field contains 0, negative, or invalid value
- Solution: Enter the actual amount paid (e.g., 36000 for 36,000 RWF)

**Finance not seeing submissions**
- Permission issue: Verify user has `approve_bordereau_payment` permission
- Database issue: Check `bordereau_verification_requests` table for records
- Solution: Check user permissions in admin panel

### Debug Information

Enable debug logging:
```bash
# Check application logs for errors
tail -f /home/curac/umis/storage/logs/laravel.log
```

Verify database tables exist:
```sql
SHOW TABLES LIKE 'bordereau%';
DESCRIBE bordereau_submissions;
DESCRIBE bordereau_verification_requests;
```

---

## 🚀 Deployment

### Steps to Deploy

1. **Run database migration:**
   ```bash
   cd /home/curac/umis
   php artisan migrate
   ```

2. **Add permissions to database:**
   ```sql
   INSERT INTO permissions VALUES
   ('view_bordereau_finance_verification', 'View Bordereau Verification'),
   ('view_bordereau_registrar_verification', 'View Bordereau Verification'),
   ('approve_bordereau_payment', 'Approve Bordereau Payments');
   ```

3. **Assign permissions to roles:**
   ```sql
   INSERT INTO role_permissions (role_id, permission_id)
   SELECT r.id, p.id FROM roles r, permissions p
   WHERE r.name IN ('Finance', 'Registrar')
   AND p.name IN ('view_bordereau_finance_verification', 'approve_bordereau_payment');
   ```

4. **Build frontend:**
   ```bash
   cd /home/curac/umis/frontend
   npm run build
   ```

5. **Upload dist folder:**
   ```bash
   # From local machine
   scp -P 2083 -r dist/ curac@cyimo-whm-private.aos.rw:/home/curac/umis/
   ```

6. **Verify routes are registered:**
   ```bash
   php artisan route:list | grep bordereau
   ```

---

## 📚 Related Documentation

- [Admission Fees Panel Component](AdmissionFeesPanel.tsx)
- [Finance Module Overview](finance-module-overview.md)
- [Payment Processing Guide](payment-processing.md)
- [API Authentication](api-authentication.md)

---

## ✅ Rollout Checklist

- [ ] Database migration tested on staging
- [ ] Backend API endpoints tested
- [ ] Frontend components tested in browser
- [ ] Permissions created and assigned
- [ ] Documentation reviewed
- [ ] Finance team trained on dashboard
- [ ] Registrar team trained on approval process
- [ ] Students notified of new payment option
- [ ] Monitor for errors in first week
- [ ] Gather feedback from Finance/Registrar

---

## 🎉 Summary

The Bordereau Payment Verification feature provides a secure, accountable workflow for students paying via bank transfer. It eliminates guesswork for Finance staff by providing structured submission data, enables clear communication through rejection reasons, and reduces manual verification burden through organized queuing and tracking.

**Key Benefits:**
✅ Transparent payment process
✅ Clear audit trail
✅ Reduced Finance workload
✅ Better student communication
✅ Accountable approval workflow

---

**Version:** 1.0  
**Last Updated:** 2026-08-27  
**Maintained By:** Development Team

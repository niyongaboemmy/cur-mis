# Expired Admission Offers - Complete Solution

## Problem Identified
When a student tries to accept an admission offer, they see an error: **"This offer has expired. Please contact the admissions office."**

This happens because:
- Admission offers have an `expires_at` date set by the admissions office
- When a student attempts to accept an offer, the system checks if today's date is AFTER the `expires_at` date
- If so, the offer is automatically marked as "expired" and cannot be accepted

### Root Cause Code
**File:** `backend/app/Controllers/ApplicationPortalController.php:693`
```php
if (strtotime($offer['expires_at']) < strtotime(date('Y-m-d'))) {
    $this->offerModel->update((int)$offer['id'], ['status' => 'expired']);
    $this->error($response, 'This offer has expired. Please contact the admissions office.', 422);
}
```

---

## Solutions Implemented

### ✅ Solution 1: Frontend Interface Improvements
**Location:** `frontend/src/pages/admin/admissions/OffersPage.tsx`

#### A. Add Inline Search
- Real-time search box that filters offers by:
  - Student name (first or last name)
  - Email address
  - Offer reference number
  - Program/department name
- Shows result count: "X of Y students"
- Clear button to reset search

**Where it appears:**
```
Admissions > Offers > [🔍 Search Box] [All statuses ▼]
```

#### B. Show Expired Offers
- Removed `enrolled_only` filter that was hiding expired offers
- Added status filter options:
  - All statuses
  - Pending
  - Accepted
  - **Expired** ← NEW
  - Declined

**How to use:**
1. Go to Admissions > Offers
2. Click "All statuses" dropdown
3. Select "Expired"
4. Use search box to find specific student
5. See all expired offers

---

### ✅ Solution 2: Admin Tool to Extend Offers
**Location:** `backend/public/admin-extend-offer.php`

A standalone web tool for admins to extend expired offer expiration dates.

#### Features:
- **Search functionality:** Find students by email or application number
- **View offer details:** See current expiration date and status
- **Extend date:** Change `expires_at` to a future date
- **Reset status:** Automatically changes status from "expired" back to "pending"
- **User-friendly interface:** Modal dialogs, date picker, confirmation messages

#### How to Access:
```
http://localhost/cur-mis/backend/public/admin-extend-offer.php
```

#### Step-by-Step Usage:

**Step 1: Open the tool**
- Visit: `http://localhost/cur-mis/backend/public/admin-extend-offer.php`

**Step 2: Search for student**
```
Search By: [Student Email ▼]
Enter Email: [student@email.com]
[🔍 Search Student]
```

**Step 3: View results table**
```
Name              Email                    Status    Current Expiry   Action
John Doe         john@email.com           expired   2025-09-01       [Extend]
```

**Step 4: Click "Extend" button**
- A modal popup appears:
```
┌─────────────────────────────┐
│ Extend Offer                │
├─────────────────────────────┤
│ Extending for: John Doe     │
│                             │
│ New Expiration Date:        │
│ [2026-12-31___________]    │
│                             │
│ [✓ Extend] [✕ Cancel]      │
└─────────────────────────────┘
```

**Step 5: Set new date**
- Click date field and pick a date at least 30-90 days in the future

**Step 6: Click "Extend Offer"**
- Success: "✓ Offer extended successfully to: 2026-12-31"

**Step 7: Student can now accept**
- Student logs back into portal
- No more "offer expired" error
- Can click "Confirm Acceptance"

---

## Database Changes Made

### What Gets Updated:
When you extend an offer, these columns change:
- `admission_offers.expires_at` → New date (e.g., 2026-12-31)
- `admission_offers.status` → Changed from "expired" to "pending"
- `admission_offers.updated_at` → Current timestamp

### Query Executed:
```sql
UPDATE admission_offers 
SET expires_at = ?, 
    status = "pending", 
    updated_at = NOW() 
WHERE id = ?
```

---

## Quick Reference

### For Admins - Finding Expired Offers
**Method 1: Web UI (Recommended)**
1. Admissions > Offers
2. Filter: "Expired"
3. Use search box to find student
4. Click "Extend" button

**Method 2: Admin Tool**
1. Open: `http://localhost/cur-mis/backend/public/admin-extend-offer.php`
2. Search by email/application number
3. Click "Extend"
4. Set new date

### For Students - After Extension
1. Log into student portal
2. Navigate to admissions section
3. Click "Accept Admission"
4. No error message
5. Complete acceptance process

### Technical Details

**Offer Status Values:**
- `pending` - Not yet accepted
- `accepted` - Student accepted
- `expired` - Past expiration date
- `declined` - Student declined
- `offer_accepted` - Alias for accepted

**Default Offer Duration:**
- Typically set to 30-60 days from issue date
- Can be customized per batch or individual offers
- Stored in `admission_offers.expires_at` column

---

## Files Changed

```
frontend/src/pages/admin/admissions/OffersPage.tsx
├── Added: Search input with real-time filtering
├── Added: useMemo hook for efficient filtering
├── Added: Expired/Pending/Declined status options
└── Removed: enrolled_only filter

backend/public/admin-extend-offer.php (NEW)
├── Search form (email/application number)
├── Results table with offer details
├── Modal dialog for setting new expiration date
└── Database update functionality
```

---

## Testing Checklist

- [ ] Visit Admissions > Offers
- [ ] Filter by "Expired" status - see expired offers
- [ ] Use search box to find specific student
- [ ] Open admin-extend-offer.php
- [ ] Search by student email
- [ ] Click "Extend" on an offer
- [ ] Set new expiration date (e.g., 30 days from today)
- [ ] Click "Extend Offer"
- [ ] See success message
- [ ] Refresh offers page - status changed to "pending"
- [ ] Student portal - no more "expired" error

---

## Deployment Notes

1. **No database migration needed** - Uses existing schema
2. **Admin tool is standalone** - No dependencies
3. **Frontend changes are backward compatible**
4. **No API changes** - Uses existing endpoints

## Future Improvements

- [ ] Bulk extend multiple expired offers at once
- [ ] Auto-extend offers within N days of expiration
- [ ] Audit log showing who extended each offer and when
- [ ] Email notification to student when offer extended
- [ ] Grace period after expiration before auto-marking as expired
- [ ] Automatic email reminder N days before expiration

---

## Support

**Issue:** "Offer has expired" error appears
**Solution:** Use admin tool to extend expiration date

**Issue:** Can't find the admin tool
**Solution:** Visit: `http://localhost/cur-mis/backend/public/admin-extend-offer.php`

**Issue:** Changes not reflecting
**Solution:** Clear browser cache and refresh page

---

Generated: September 19, 2026

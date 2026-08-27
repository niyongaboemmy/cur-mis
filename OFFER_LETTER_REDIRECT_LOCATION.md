# 📍 VIEW OFFER LETTER - REDIRECT LOCATION & HOW TO MODIFY

## 🎯 CURRENT LOCATION

**File**: `frontend/src/pages/applicant/ApplicantOverviewPage.tsx`  
**Component**: `AdmissionOfferBanner`  
**Lines**: 743-758

---

## 📝 CURRENT CODE

```typescript
// Line 743-748: "View Offer Letter" Button
<button
  className="btn-white px-8 py-3 rounded-2xl font-black uppercase tracking-widest text-[12px] shadow-xl shadow-black/10 hover:-translate-y-0.5 transition-transform"
  onClick={() => setViewingLetter(true)}
>
  <FileText className="w-4 h-4 mr-2" /> View Offer Letter
</button>

// Line 749-758: "Download PDF" Link
{details.offer?.letter_token && (
  <a
    href={`${import.meta.env.VITE_API_URL ?? ''}/api/portal/admission-letter?token=${details.offer.letter_token}`}
    target="_blank"
    rel="noreferrer"
    className="flex items-center justify-center gap-2 px-8 py-3 rounded-2xl font-black uppercase tracking-widest text-[12px] bg-white/20 hover:bg-white/30 text-white border border-white/30 transition-colors"
  >
    <Download className="w-4 h-4" /> Download PDF
  </a>
)}
```

---

## 🔍 WHAT'S CURRENTLY HAPPENING

1. **"View Offer Letter" Button** (line 747):
   - Clicking it opens a **modal** showing the admission letter
   - Code: `onClick={() => setViewingLetter(true)}`
   - This opens the modal at lines 789-815

2. **"Download PDF" Link** (line 751):
   - Calls backend API: `/api/portal/admission-letter?token={letter_token}`
   - Uses token authentication

---

## 📊 DATA AVAILABLE IN THIS COMPONENT

Looking at the component, you have access to:

```typescript
// From AdmissionOfferBanner component
app {
  id: number;
  status: string;
  application_number: string;
  first_name: string;
  last_name: string;
  email: string;
  department_name: string;
  faculty_name: string;
  intake: string;
  level_name: string;
  // ... other fields
}

details {
  offer {
    letter_token: string;
    expires_at: string;
    // ... other offer fields
  }
  // ... other details
}
```

---

## ⚠️ PROBLEM: NO STUDENT_ID AVAILABLE

Looking at the component, **there is NO `student_id` field** in either `app` or `details` objects.

**Your URL requires:**
```
/umis/documents/all_certificate/generate_document.php?type=admission_letter&student_id=23&...
```

**But applicant component only has:**
- `app.id` (application ID, not student ID)
- `details.offer.letter_token` (token)

---

## ✅ SOLUTION OPTIONS

### **Option 1: Modify the Backend Response** (RECOMMENDED)

Make the API include `student_id` in the response:

**File**: `backend/app/Controllers/AdmissionController.php`

Update the offer details query to include student_id:
```php
// Fetch offer details with student_id
$offer = DB::table('applications')
    ->join('applicants', 'applications.applicant_id', '=', 'applicants.id')
    ->join('users', 'users.id', '=', 'applicants.user_id')
    ->select('applications.*', 'users.id as student_id')
    ->where('applications.id', $app_id)
    ->first();
```

Then in the frontend response, `details.student_id` will be available.

---

### **Option 2: Change Download Link to Use New URL**

Modify line 751 to redirect to your PHP script instead:

**Before:**
```typescript
href={`${import.meta.env.VITE_API_URL ?? ''}/api/portal/admission-letter?token=${details.offer.letter_token}`}
```

**After (if student_id is added to details):**
```typescript
href={`/umis/documents/all_certificate/generate_document.php?type=admission_letter&student_id=${details.student_id}&file_name=Admission_Letter_FORMAT.pdf&applicant=1`}
```

---

### **Option 3: Query Applicant ID → Get Student ID**

If applicant has a related student user, use the applicant ID to look up student ID.

---

## 🔧 HOW TO MAKE THE CHANGE

### **Step 1: Check if student_id is available in details**

First, verify what data is in `details` object. The backend API endpoint that populates this is likely:
- `/api/portal/applications/{id}` or similar

### **Step 2: Update the Download Link**

In `ApplicantOverviewPage.tsx` line 750-751:

```typescript
// Current
{details.offer?.letter_token && (
  <a
    href={`${import.meta.env.VITE_API_URL ?? ''}/api/portal/admission-letter?token=${details.offer.letter_token}`}
```

**Change to:**
```typescript
// New - if student_id available
{details.offer?.letter_token && (
  <a
    href={`/umis/documents/all_certificate/generate_document.php?type=admission_letter&student_id=${details.student_id ?? ''}&file_name=Admission_Letter_FORMAT.pdf&applicant=1`}
```

### **Step 3: Also update the other download link**

Line 602-603 also has a similar download link in the "Enrollment Complete" section:

```typescript
// Current
href={`${import.meta.env.VITE_API_URL ?? ''}/api/portal/admission-letter?token=${(details as any).offer.letter_token}`}

// Change to
href={`/umis/documents/all_certificate/generate_document.php?type=admission_letter&student_id=${(details as any).student_id ?? ''}&file_name=Admission_Letter_FORMAT.pdf&applicant=1`}
```

---

## 📋 COMPLETE STEP-BY-STEP

1. **Find the backend API** that returns offer details
   - Look for the endpoint that populates `details` object
   - Likely in `backend/app/Controllers/AdmissionController.php` or `ApplicationController.php`

2. **Add student_id to API response**
   - Join with users table to get student_id
   - Include in returned details object

3. **Update frontend links** (lines 602-603, 750-751)
   - Change from: `/api/portal/admission-letter?token=...`
   - Change to: `/umis/documents/all_certificate/generate_document.php?type=admission_letter&student_id=...&applicant=1`

4. **Test**
   - Apply as student
   - Get admitted
   - Click "View Offer Letter" → Download PDF
   - Should redirect to your generate_document.php script

---

## 🎯 SUMMARY

| Item | Value |
|------|-------|
| **File** | ApplicantOverviewPage.tsx |
| **Component** | AdmissionOfferBanner |
| **Lines** | 602-603, 750-751 |
| **Button Text** | "Download PDF" |
| **Current Redirect** | `/api/portal/admission-letter?token=...` |
| **Required Redirect** | `/umis/documents/all_certificate/generate_document.php?type=admission_letter&student_id=...&applicant=1` |
| **Missing Data** | student_id (needs backend update) |

---

## 📌 NEXT STEPS

1. Locate the backend API endpoint that returns offer details
2. Confirm whether student_id is available
3. If not, add it to the API response
4. Update the frontend links to use new redirect URL
5. Test the flow end-to-end

Let me know which backend file needs to be updated and I can help modify it!

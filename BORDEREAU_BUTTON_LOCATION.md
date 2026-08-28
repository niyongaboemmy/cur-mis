# 📍 Bordereau Button Location Guide

## Where to Find the Bordereau Button

### 📱 On the Payment Page

When a student views their **unpaid application fees**, they will see:

```
┌─────────────────────────────────────────────────────────────┐
│  Application fee: 36,000 RWF                               │
│  Pay securely with Urubuto Pay...                          │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ AMOUNT: 36,000 RWF                                          │
│ MERCHANT CODE: TH90989816                                   │
│ PAYER CODE: APP-2026-00077                                  │
│                                                             │
│  ┌──────────────────────┐  ┌──────────────────┐            │
│  │ Pay 36,000 RWF with  │  │  💳 Bordereau    │            │
│  │ Urubuto Pay (MTN/    │  │                  │            │
│  │ Airtel)              │  │ (for bank        │            │
│  └──────────────────────┘  │  transfers)      │            │
│                            └──────────────────┘            │
│                                                             │
│ ℹ️ Already paid via bank transfer?                         │
│    Click "Bordereau" to submit your receipt number.        │
└─────────────────────────────────────────────────────────────┘
```

### 🎯 Button Details

| Item | Details |
|------|---------|
| **Button Label** | 💳 Bordereau |
| **Location** | Right next to "Pay Now" button |
| **Color** | Blue/Secondary color |
| **Icon** | Banknote/Money icon |
| **Visible When** | Fee is unpaid (status NOT "Paid") |
| **Not Visible When** | Fee is already paid, or user is Finance staff |

---

## 📋 Step-by-Step: How to Submit a Bordereau Receipt

### Step 1: View Unpaid Fees
```
1. Login to portal (https://cur.ac.rw/umis/)
2. Go to your application
3. Scroll to "Payment" section
4. Should see unpaid fees with two buttons
```

### Step 2: Click Bordereau Button
```
Look for the "💳 Bordereau" button next to "Pay Now"
Click it → Opens form to submit receipt details
```

### Step 3: Fill Receipt Form
```
┌─────────────────────────────────────────┐
│ Submit Bordereau Payment                │
├─────────────────────────────────────────┤
│                                         │
│ 💡 Bordereau Payment                    │
│ If you have already paid via bank       │
│ transfer, enter your receipt number     │
│ below. Finance will verify within       │
│ 24 hours.                               │
│                                         │
│ Required Amount: 36,000 RWF             │
│                                         │
│ Receipt Number * ___________________    │
│ (e.g., BR-2026-001234)                 │
│                                         │
│ Amount Paid (RWF) * ________________    │
│                                         │
│ Bank Name _________________________      │
│ (Optional - e.g., BK, EQUITY)          │
│                                         │
│ Account Holder Name _________________   │
│ (Optional)                              │
│                                         │
│ Payment Date __________________          │
│ (Optional)                              │
│                                         │
│ [Submit Receipt] [Cancel]               │
└─────────────────────────────────────────┘
```

### Step 4: See Status
```
After submitting, you'll see:

┌─────────────────────────────────────────┐
│ Receipt Submitted!                      │
│                                         │
│ ⏳ Under Review                          │
│                                         │
│ Finance will review your payment        │
│ within 24 hours.                        │
│                                         │
│ Receipt: BR-2026-001234                 │
│ Attempt: 1 of 3                         │
│                                         │
│ You will be notified by email when      │
│ the payment is verified.                │
│                                         │
│ [Close]                                 │
└─────────────────────────────────────────┘
```

### Step 5: Wait for Approval
```
Status will change to one of:

✅ APPROVED
   Your payment has been verified.
   You can now proceed to enrollment.

❌ REJECTED
   Reason shown. You can resubmit
   if you have attempts remaining (max 3).
```

---

## 🔍 Troubleshooting: "I Don't See the Bordereau Button"

### Issue 1: Button Not Visible
**Check:**
- [ ] Are you logged in? (required)
- [ ] Do you have unpaid fees? (button only shows for unpaid)
- [ ] Is your browser cache cleared? (Ctrl+Shift+Delete)
- [ ] Did you upload the new dist folder?

**Solution:**
```bash
# Clear browser cache and reload
Ctrl+Shift+Delete → Select "Cached images and files" → Clear
```

### Issue 2: "Payment" Section Missing
**Check:**
- [ ] Is the fee status already "Paid"?
- [ ] Are you viewing an application you own?
- [ ] Is the application in the right status?

**Solution:**
Visit admissions office to check application status.

### Issue 3: Button is There But Doesn't Work
**Check:**
- [ ] Can you click it? (should open form)
- [ ] Are you connected to internet?
- [ ] Is there a JavaScript error? (F12 → Console)

**Solution:**
Try in a different browser or clear cache.

---

## 💻 For Finance/Registrar: Reviewing Submissions

### Where to Review Bordereau Submissions

```
1. Login as Finance or Registrar
2. Navigate to: Finance → Bordereau Verification
   (Or direct URL: https://cur.ac.rw/umis/finance/bordereau-verification)
3. See dashboard with:
   - Pending submissions count
   - Approved & rejected counts
   - List of all pending receipts
```

### Review Dashboard Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Bordereau Payment Verification                              │
│                                                             │
│ [Pending: 5] [Approved: 42] [Rejected: 3] [Total: 1,512k]  │
│                                                             │
│ Pending Submissions                                         │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ #APP-2026-00023                                        │ │
│ │ JEAN BOSCO                                             │ │
│ │                                                        │ │
│ │ Receipt: BR-2026-001234  Amount: 36,000 RWF           │ │
│ │ Bank: BK  Date: Aug 25  Submitted: Aug 25             │ │
│ │ Attempt: 1/3                                           │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ [Click submission to review & approve/reject]         │ │
│ └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## ✅ Summary

| User Type | Where to Find | Action |
|-----------|--------------|--------|
| **Student** | Payment page, next to "Pay Now" | Click "Bordereau" → Submit receipt |
| **Finance/Registrar** | Finance → Bordereau Verification | Review pending → Approve/Reject |
| **System** | Dashboard sends notifications | Auto-updates payment status |

---

## 📞 Need Help?

**Students:** Click the "Bordereau" button and fill the form. Finance will review within 24 hours.

**Finance/Registrar:** Go to Finance → Bordereau Verification to see all pending submissions.

**Support:** Contact finance@cur.ac.rw if you have questions.

---

**Last Updated:** 2026-08-27  
**Version:** 1.0

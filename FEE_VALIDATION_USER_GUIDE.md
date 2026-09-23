# Admission Fee Validation - User Guide

## For Applicants

### What Changed?
Your admission fees page now shows you:
- **Exactly how much you've paid** towards each fee
- **How much you still owe** (the balance)
- **Your payment progress** as a visual bar
- **When you can proceed** to enrollment (after full payment)

### Understanding Your Fees Page

#### 🟡 Yellow/Amber Alert (When You Owe Money)
```
┌─────────────────────────────────────────────────┐
│ 🟡 Admission Fee Outstanding                    │
│                                                  │
│ Paid: 30,000 / 60,000 RWF                  50% │
│ [████████░░░░░░░░░░░░░░░░]                      │
│                          30,000 RWF remaining   │
└─────────────────────────────────────────────────┘
```

What this means:
- You've paid **30,000 RWF** of the **60,000 RWF** owed
- You're **50% done** with payments
- You still owe **30,000 RWF**
- Your **registration number won't be issued** until you pay the full amount

### Individual Bills Breakdown

Each fee shows:
- **Bill name** (e.g., "Registration Fee")
- **Status badge** (Unpaid, Part paid, or Paid)
- **Amount Due**: How much this fee costs
- **Amount Paid**: How much you've paid towards this fee
- **Balance Badge**: How much is left (in amber/yellow)
- **Progress bar**: Visual indicator of completion

#### Example: Registration Fee (partially paid)
```
┌─────────────────────────────────────────────────┐
│ 📋 Registration Fee  [Part paid]                │
│ Amount Due: 30,000 RWF   Paid: 20,000 RWF      │
│ [███████░░░░░░░] Balance: 10,000 RWF    67%   │
│                                                  │
│ [Pay 10,000 RWF] [Bank Slip] [Confirm offline]  │
└─────────────────────────────────────────────────┘
```

### How to Make a Payment

#### Method 1: Online (Urubuto Pay)
1. Click the **"Pay {amount} RWF"** button
2. Urubuto Pay will open in a new tab
3. Choose your payment method:
   - 📱 **MTN MoMo** (dial *156# or use MoMo app)
   - 💰 **Airtel Money** (dial *150# or use Money app)
4. Complete the payment
5. Come back to this page - it will update automatically within a few seconds

#### Method 2: Bank Transfer
1. Click **"Bank Slip"** button
2. Upload proof of your bank transfer
3. Finance team will verify and update your account

#### Method 3: Cash Payment at Cashier's Office
1. Visit the Finance office at CUR
2. Tell them your application number
3. Pay the balance in cash
4. Bring receipt back to update your account

### What Happens After Payment?

**Immediately after paying:**
- Your progress bar updates
- Amount paid increases
- Balance decreases
- Status might change to "Part paid" or "Paid"

**After you've paid everything:**
- The yellow alert disappears
- A ✅ **green message** appears
- Your **registration number** is issued
- You can proceed to enrollment
- No more action needed from you

### Important Reminders

⚠️ **Your registration number will NOT be issued until:**
- Every bill shows as "Paid" ✅
- Your balance is **0 RWF**
- You see the green success message

💡 **Tips:**
- Check this page regularly to see your payment progress
- Share your **Payer Code** (application number) with whoever is paying
- If paying offline, keep your receipt
- Contact Finance if the page doesn't update after 10 minutes
- If you have questions, email: admissions@cur.ac.rw

---

## For Admissions Staff (Validators)

### What Changed?
When reviewing an applicant's records, you now see:
- **Clear warning** if payment is incomplete
- **Exact breakdown** of what's required vs. what's been paid
- **Automatic validation** that registration can't be issued with outstanding balance
- **Visual indicators** making it impossible to miss incomplete payments

### Understanding the Payment Validation

#### 🔴 Red Alert (Incomplete Payment)
```
┌───────────────────────────────────────────────┐
│ ⚠️  Payment Incomplete - Action Required       │
│                                                │
│ This applicant has not paid the full amount   │
│ for admission. Current balance: 30,000 RWF   │
│                                               │
│ Total Required:    60,000 RWF                 │
│ Paid to Date:      30,000 RWF                 │
│ ─────────────────────────────────────         │
│ Balance Due:       30,000 RWF                 │
│                                               │
│ ⚠️ Registration number cannot be issued       │
│    until full payment is received.            │
└───────────────────────────────────────────────┘
```

**What this tells you:**
- Applicant owes **30,000 RWF** more
- Registration # is **locked** until paid
- Requires **follow-up action**

### When You See This Alert

The red alert appears when:
- ✗ Bills have been raised
- ✗ Payments received < payments required
- ✗ Balance > 0 RWF

The red alert **disappears** when:
- ✅ All fees are paid in full
- ✅ Balance = 0 RWF
- ✅ All bills show "Paid"

### Actions You Can Take

#### 1. Confirm Offline Payment
If the applicant paid via bank transfer and it hasn't auto-confirmed:

1. Click **"Confirm offline"** button
2. Enter the payment amount
3. Enter the bank reference number
4. Add notes if needed
5. Click "Record payment"
6. Page updates immediately

#### 2. Re-price Current Fees
If fee structures changed, update the billing:

1. Click **"Re-price unpaid fees..."** link
2. Confirms with current published rates
3. Bills update to new amounts (if higher)
4. Applicant is notified

#### 3. Bill the Applicant
If no bills raised yet:

1. Click **"Bill applicant"**
2. Selects fees from published structure
3. Applicant gets email notification
4. Applicant can pay immediately

### Payment Status Indicators

| Status | Meaning | Next Step |
|--------|---------|-----------|
| **Unpaid** | 0 RWF received | Wait for payment or follow up |
| **Part paid** | Some RWF received | Wait for remaining payment |
| **Paid** ✅ | Full amount received | Issue registration number |

### Reconciliation Workflow

```
Applicant Applies
    ↓
Admission Offer Issued
    ↓
Bills Raised (30k + 30k = 60k)
    ↓
Payment 1: 20,000 RWF (Urubuto Pay)
    ↓
Status: Part paid (40k remaining)
    ↓
Payment 2: 40,000 RWF (Bank transfer)
    ↓
You confirm offline
    ↓
Status: Paid ✅
    ↓
Registration Number Issued
    ↓
Applicant Enrolls
```

### Key Validations Enforced

✅ **Automatic checks:**
- Balance calculated fresh from database
- Amount due matches fee structure
- No registration number issued with outstanding balance
- Bills show actual amounts, not guesses
- Every payment has a receipt/reference

⚠️ **Manual review still needed for:**
- Unusual payment patterns
- Large discrepancies
- Failed/reversed payments
- Disputes or special circumstances

### Reports & Monitoring

Check for incomplete applications:

**Dashboard**:
- Look for applications with red "Payment Incomplete" alert
- Note the balance due for each
- Track how long they've been waiting

**Communication**:
- Applicant receives auto-email when billed
- Send reminder after 3 days if unpaid
- Send urgent follow-up after 7 days
- Consider temporary holds if unpaid after 14 days

### FAQ for Validators

**Q: The page shows unpaid, but I know the applicant paid**
- A: It may take 5-10 seconds to auto-update. Refresh the page.
- A: For cash/bank transfers, manually confirm it using "Confirm offline" button

**Q: Why can't I issue the registration number?**
- A: System prevents it because balance > 0. Get payment first, then refresh.

**Q: What if the amount due is wrong?**
- A: Check the fee structure in Finance → Fee Structures. Click "Re-price" to update.

**Q: What if the applicant overpays?**
- A: System caps `amount_paid` to not exceed `amount_due`. No overpayment recorded.

**Q: Can I override the payment block?**
- A: No, it's intentional to prevent incomplete enrollments. Get full payment first.

---

## Technical Details (Admins Only)

### How It Works

1. **Fee Structure**: Finance publishes fees in `fee_structures` table
   - Registration: 30,000 RWF
   - CURSU: 30,000 RWF

2. **Bills Raised**: When offer issued, `application_invoices` created
   - `amount_due`: from fee structure
   - `amount_paid`: starts at 0

3. **Payments Recorded**: When payment received, `application_invoice_payments` created
   - Amount added to `amount_paid`
   - Status updated to 'partial' or 'paid'

4. **Balance Calculated**: Frontend calculates:
   - `balance = amount_due - amount_paid`
   - Shows to applicant and validator

5. **Registration Gate**: Backend checks:
   ```
   if (summary.fully_paid && balance == 0) {
     Issue registration number
   }
   ```

### Database Columns Used

```sql
-- Fee structure (set by Finance)
application_invoices.amount_due

-- Payments received (from Urubuto or manual entry)
application_invoice_payments.amount

-- Calculated on-the-fly
balance = amount_due - SUM(amount_paid)
```

### No Schema Changes
- Uses existing columns
- No database migration needed
- Works with existing APIs
- Backwards compatible

---

## Support

**For Applicants:**
- Email: admissions@cur.ac.rw
- Phone: +(250) 252 123 456
- Portal support: Include your application number

**For Staff:**
- Finance system issues: [IT Support Email]
- Fee structure questions: [Finance Manager]
- Application questions: [Admissions Director]

---

## Change Summary

| Feature | Before | After |
|---------|--------|-------|
| See payment progress | ❌ | ✅ Shows % and bar |
| Know exact balance | ❌ | ✅ Clearly labeled |
| Prevent incomplete enrollment | ⚠️ Manual | ✅ Automatic |
| Validator sees issues | ❌ | ✅ Red alert |
| Bills show per-fee status | ❌ | ✅ Individual tracking |

---

**Last Updated**: September 23, 2026  
**Version**: 1.0  
**Questions?** Contact admissions@cur.ac.rw

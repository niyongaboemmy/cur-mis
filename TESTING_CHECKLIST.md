# Admission Fee Validation - Testing Checklist

## Pre-Testing Setup
- [ ] Backend is running (PHP server)
- [ ] Frontend dev server running on http://localhost:5180
- [ ] Database has test data with admission fees
- [ ] You have test applicant accounts
- [ ] You have validator/admin accounts

---

## Unit Test: Applicant View - No Payment

**Scenario**: Applicant with unpaid admission fees (e.g., 60,000 RWF REGISTRATION + CURSU)

### Amber Alert Section
- [ ] "Admission Fee Outstanding" alert appears
- [ ] Alert has amber background (light mode) / dark amber (dark mode)
- [ ] Alert shows warning text about unpaid balance
- [ ] Progress bar visible showing 0% completion
- [ ] "Paid: 0 / 60,000 RWF" text visible
- [ ] "0%" completion percentage shown
- [ ] Large "60,000 RWF" balance amount shown in top right

### Individual Bills Section
For each bill (REGISTRATION, CURSU):
- [ ] Bill title and status chip visible
- [ ] "Amount Due: X RWF" clearly labeled
- [ ] No "Paid:" text (since payment is 0)
- [ ] Balance badge shows full amount (e.g., "BALANCE 30,000")
- [ ] Balance badge has amber background
- [ ] No progress bar shown (since no payment yet)
- [ ] "Pay {balance} RWF" button active and clickable
- [ ] Button shows correct remaining amount

### Payment Buttons
- [ ] "Pay" button shows balance amount
- [ ] "Bank Slip" button visible for applicants
- [ ] "Urubuto Pay opens in new tab" hint shown

### Note Section
- [ ] Yellow/amber note appears saying "Pay each fee above with Urubuto Pay"
- [ ] Note has wallet icon

---

## Unit Test: Applicant View - Partial Payment

**Scenario**: Applicant paid 20,000 of 60,000 RWF (e.g., half of REGISTRATION fee)

### Amber Alert Section
- [ ] Alert still appears (balance > 0)
- [ ] Progress bar now shows 33% filled
- [ ] "Paid: 20,000 / 60,000 RWF" text updated
- [ ] "33%" percentage shown
- [ ] "40,000 RWF" balance shown (60,000 - 20,000)

### Individual Bills Section
For REGISTRATION bill (with 20,000 paid):
- [ ] Status chip shows "Part paid" or similar
- [ ] "Amount Due: 30,000 RWF" (this bill's amount)
- [ ] "Paid: 20,000 RWF" shown with emerald color
- [ ] "BALANCE 10,000" badge shows remaining
- [ ] Progress bar visible showing 67% (20,000/30,000)
- [ ] "67% paid" text under progress bar
- [ ] "Pay 10,000 RWF" button updated to show balance

For CURSU bill (unpaid):
- [ ] Status shows "Unpaid"
- [ ] "Amount Due: 30,000 RWF"
- [ ] No "Paid:" text
- [ ] "BALANCE 30,000" badge shows full amount
- [ ] No progress bar (no payment on this bill)
- [ ] "Pay 30,000 RWF" button shows full amount

### Payment Buttons
- [ ] Each bill's Pay button shows its individual balance
- [ ] Not the global balance

---

## Unit Test: Applicant View - Fully Paid

**Scenario**: All admission fees paid in full (total 60,000 RWF)

### Amber Alert Section
- [ ] Alert **disappears** (no balance > 0)
- [ ] Only shows green success message instead

### Individual Bills Section
For each bill:
- [ ] Status chip shows "Paid" in green
- [ ] "Amount Due: X RWF" shown
- [ ] "Paid: X RWF" shown with emerald color (matches amount due)
- [ ] No balance badge (since balance = 0)
- [ ] No progress bar (completed)
- [ ] ✅ Paid checkmark appears instead of Pay button

### Success Message
- [ ] Green note appears with badge icon
- [ ] Shows registration number if issued
- [ ] Message: "All admission fees are settled"

### Next Steps Button
- [ ] "Continue to Next Step" button **enabled** (was disabled during unpaid)
- [ ] Button clickable and ready for enrollment

---

## Unit Test: Validator View - Incomplete Payment

**Scenario**: Validator viewing applicant with 20,000 of 60,000 paid

### Red Alert Section
- [ ] "Payment Incomplete - Action Required" alert appears
- [ ] Red background (light mode) / dark red (dark mode)
- [ ] Alert icon (⚠️) visible
- [ ] Alert text: "This applicant has not paid the full amount..."
- [ ] "Current balance: 40,000 RWF" shown in bold

### Financial Breakdown Table (inside alert)
- [ ] Table has light background (white in light mode, dark in dark mode)
- [ ] "Total Required: 60,000 RWF" row
- [ ] "Paid to Date: 20,000 RWF" row
- [ ] "Balance Due: 40,000 RWF" row with bold/black text
- [ ] Dividing line between third row and others
- [ ] All amounts properly formatted with commas if applicable

### Lock Indicator
- [ ] "⚠️ Registration number cannot be issued until full payment is received"
- [ ] Text in red color

### Individual Bills
- [ ] Same as applicant view (balance badges, progress bars, etc.)
- [ ] Paid/Pay buttons show same amounts

### Validator Actions
- [ ] "Confirm offline" button visible (for bank transfers)
- [ ] "Re-price from current fee structures" link visible (if balance > 0)
- [ ] "Bill applicant" button visible (if not yet billed)

---

## Unit Test: Validator View - Complete Payment

**Scenario**: Validator viewing applicant with all fees paid

### Red Alert
- [ ] Alert **disappears** (no balance > 0)

### Individual Bills
- [ ] All show "Paid" status
- [ ] All show full amount paid
- [ ] No balance badges
- [ ] ✅ Paid checkmarks visible

### Success Message
- [ ] Green note appears with badge icon
- [ ] "All admission fees are settled. Registration number {NUMBER} has been issued."

---

## Integration Test: Payment Flow

**Scenario**: Applicant makes a payment while viewing the page

1. **Initial State**:
   - [ ] Page shows 0,000 / 60,000 RWF
   - [ ] Progress bar at 0%
   - [ ] "60,000 RWF" balance shown

2. **Simulate Payment** (via Urubuto Pay gateway or manual entry):
   - [ ] 30,000 RWF payment received and recorded in database

3. **Page Auto-Refresh** (polling every 4-10 seconds):
   - [ ] Progress bar updates to 50%
   - [ ] "Paid: 30,000 / 60,000 RWF" text updates
   - [ ] "50%" shown
   - [ ] "30,000 RWF" balance shown

4. **Second Payment**:
   - [ ] Another 30,000 RWF payment received

5. **Page Auto-Refresh**:
   - [ ] Progress bar reaches 100%
   - [ ] Alert disappears
   - [ ] Green success message appears
   - [ ] "Paid" checkmarks on all bills
   - [ ] Registration number displays (if auto-enroll enabled)

---

## Responsive Design Test

### Desktop (1920px width)
- [ ] All elements visible and properly spaced
- [ ] Balance badge stays on same line as status chip
- [ ] Progress bar takes full width
- [ ] Table in validator alert is readable

### Tablet (768px width)
- [ ] Alert message and balance badge wrap appropriately
- [ ] Progress bar still visible
- [ ] Bills section remains readable
- [ ] Table rows in alert don't overflow

### Mobile (375px width)
- [ ] Alert stacks vertically
- [ ] Balance badge moves below title on mobile
- [ ] Progress bar full width with padding
- [ ] Table in alert is readable (may need horizontal scroll)
- [ ] Buttons stack vertically
- [ ] All text readable without zoom

---

## Dark Mode Test

With dark mode enabled:
- [ ] Amber alert background visible (dark amber)
- [ ] Text color contrasts with background (WCAG AA)
- [ ] Red alert background visible (dark red)
- [ ] Progress bars have sufficient contrast
- [ ] Balance badges visible in dark mode
- [ ] Status chips colored appropriately
- [ ] Table text readable in alert

---

## Edge Cases

### Zero Balance
- [ ] If somehow balance = 0.00, shows as "0 RWF"
- [ ] No errors in console
- [ ] Display doesn't break

### Very Large Amounts
- [ ] 10,000,000 RWF amount displays with commas or spacing
- [ ] Progress bar shows 100% cap (not exceeding container)
- [ ] Numbers don't overflow containers

### Very Small Amounts
- [ ] 1 RWF balance shows correctly
- [ ] 0.01 RWF shown if applicable
- [ ] Progress bar shows minimal fill for small payments

### Multiple Bills with Different Statuses
- [ ] Bill 1: REGISTRATION fully paid (30,000)
- [ ] Bill 2: CURSU unpaid (30,000)
- [ ] Each shows correct status and progress
- [ ] Alert shows only unpaid amount (30,000)
- [ ] Overall progress shows 50%

---

## API & Data Validation

### Payment Amount Verification
- [ ] Amount shown in UI matches database `amount_paid`
- [ ] Balance calculation correct: `amount_due - amount_paid`
- [ ] No rounding errors (amounts shown with 2 decimals)

### Status Consistency
- [ ] Bill status matches payment state:
  - `paid` when `amount_paid >= amount_due`
  - `partial` when `0 < amount_paid < amount_due`
  - `unpaid` when `amount_paid = 0`

### Fee Structure Validation
- [ ] Amount due matches fee structure for the applicant's profile
- [ ] No bills shown for fee types with no published structure
- [ ] Correct fees for applicant's department/level/category

---

## Browser Compatibility

### Chrome/Chromium (90+)
- [ ] All features work
- [ ] Progress bars animate smoothly
- [ ] No console errors

### Firefox (88+)
- [ ] All features work
- [ ] Colors render correctly
- [ ] Responsive layout works

### Safari (14+)
- [ ] All features work
- [ ] Progress bar width calculation correct
- [ ] Flexbox layout doesn't break

### Mobile Safari (iOS 14+)
- [ ] Touch buttons work
- [ ] Layout responsive
- [ ] No horizontal scroll on mobile

---

## Performance

- [ ] Page loads in <3 seconds
- [ ] No layout shift when progress bar updates
- [ ] No console errors or warnings
- [ ] Progress bar animation doesn't stutter
- [ ] Auto-refresh (polling) doesn't cause lag

---

## Accessibility

- [ ] Tab navigation works through all interactive elements
- [ ] Screen reader announces bill amounts and status
- [ ] Color-blind friendly (not relying on color alone)
- [ ] Sufficient contrast ratios (WCAG AA)
- [ ] Keyboard-only navigation works

---

## Final Sign-Off

| Category | Status | Notes |
|----------|--------|-------|
| Applicant: Unpaid | ⬜ | |
| Applicant: Partial | ⬜ | |
| Applicant: Paid | ⬜ | |
| Validator: Unpaid | ⬜ | |
| Validator: Paid | ⬜ | |
| Responsive: Desktop | ⬜ | |
| Responsive: Tablet | ⬜ | |
| Responsive: Mobile | ⬜ | |
| Dark Mode | ⬜ | |
| Edge Cases | ⬜ | |
| API/Data | ⬜ | |
| Browser Compat | ⬜ | |
| Performance | ⬜ | |
| Accessibility | ⬜ | |

**Tested By**: ________________  
**Date**: ________________  
**Build Version**: ________________  
**Notes**: ________________

---

## Regression Testing

After deploying, verify that these existing features still work:
- [ ] Applicant can still pay via Urubuto Pay
- [ ] Applicant can still upload bank slips
- [ ] Validator can still confirm offline payments
- [ ] Admission letters still generate
- [ ] Registration numbers still issue after full payment
- [ ] Email notifications still send on payment/billing events
- [ ] Existing applications still accessible

---

## Sign-Off

- [ ] All tests passed
- [ ] No regressions detected  
- [ ] Ready for production deployment
- [ ] User documentation updated (if applicable)
- [ ] Team notified of changes

**Approved By**: ________________  
**Date**: ________________

# Manual Testing Guide - Admission Fee Validation

**Purpose**: Step-by-step guide for QA team to manually test the admission fee validation feature  
**Duration**: Approximately 2-3 hours  
**Test Environment**: Staging  
**Testers**: Admissions staff, QA team

---

## Test Setup

### Prerequisites
- [ ] Access to staging environment
- [ ] Browser: Chrome, Firefox, or Safari (latest version)
- [ ] Test applicant accounts (various statuses)
- [ ] Test admin/validator accounts
- [ ] Database with test admission fees configured
- [ ] Test payment data available

### Test Data Preparation

You'll need applicants in these states:

1. **Applicant A**: No payments made
   - Total fee: 60,000 RWF
   - Amount paid: 0 RWF
   - Expected: Full amount due

2. **Applicant B**: Partial payment made
   - Total fee: 60,000 RWF
   - Amount paid: 30,000 RWF
   - Expected: 50% progress, 30,000 RWF balance

3. **Applicant C**: Full payment made
   - Total fee: 60,000 RWF
   - Amount paid: 60,000 RWF
   - Expected: 100% progress, registration number issued

---

## Test Scenario 1: Applicant with Unpaid Fees

### Setup
- Login as **Applicant A** (no payments)
- Navigate to admission fees section

### Expected Visual Output

```
┌─────────────────────────────────────────────────┐
│ 🟡 Admission Fee Outstanding                    │
│                                                  │
│ You have an unpaid balance. Complete payment..  │
│ Paid: 0 / 60,000 RWF                        0% │
│ [░░░░░░░░░░░░░░░░░░░░░░░░░░] (empty bar)      │
│                          60,000 RWF (balance)  │
└─────────────────────────────────────────────────┘

Bills:
┌─────────────────────────────────────────────────┐
│ 📋 Registration Fee    [Unpaid]                 │
│ Amount Due: 30,000 RWF                          │
│ [████░░░░░░░░]  Balance: 30,000 RWF            │
│                                                  │
│ [Pay 30,000 RWF] [Bank Slip]                    │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ 📋 CURSU Fee          [Unpaid]                  │
│ Amount Due: 30,000 RWF                          │
│ [████░░░░░░░░]  Balance: 30,000 RWF            │
│                                                  │
│ [Pay 30,000 RWF] [Bank Slip]                    │
└─────────────────────────────────────────────────┘
```

### Test Cases

#### TC1.1: Amber Alert Visibility
- [ ] Amber alert appears at top of fees section
- [ ] Alert has amber background (light mode)
- [ ] Alert text is readable
- [ ] Alert disappears when scrolled out of view
- [ ] Alert reappears when scrolled back

#### TC1.2: Payment Progress Display
- [ ] "Paid: 0 / 60,000 RWF" text visible
- [ ] "0%" percentage shown
- [ ] Progress bar is empty (no fill)
- [ ] Progress bar width = container width
- [ ] Large "60,000 RWF" balance shown in top right

#### TC1.3: Balance Badges
- [ ] Each bill shows "Balance: 30,000" badge
- [ ] Badge has amber background
- [ ] Badge shows correct amount
- [ ] Badge is right-aligned

#### TC1.4: Pay Button Labels
- [ ] REGISTRATION fee button shows "Pay 30,000 RWF"
- [ ] CURSU fee button shows "Pay 30,000 RWF"
- [ ] Buttons are clickable
- [ ] Buttons are not disabled

#### TC1.5: Status Chips
- [ ] Both bills show "Unpaid" status chip
- [ ] Chip has appropriate color (red/danger)
- [ ] Chip is readable

---

## Test Scenario 2: Applicant with Partial Payment

### Setup
- Login as **Applicant B** (30,000 paid of 60,000)
- Navigate to admission fees section

### Expected Visual Output

```
┌─────────────────────────────────────────────────┐
│ 🟡 Admission Fee Outstanding                    │
│                                                  │
│ Paid: 30,000 / 60,000 RWF                  50% │
│ [████████░░░░░░░░░░░░░░] (half-filled)        │
│                          30,000 RWF (balance)  │
└─────────────────────────────────────────────────┘

Paid Bill (REGISTRATION - 20,000 paid of 30,000):
┌─────────────────────────────────────────────────┐
│ 📋 Registration Fee    [Part paid]              │
│ Amount Due: 30,000 RWF   Paid: 20,000 RWF      │
│ [████████░░░░]  Balance: 10,000 RWF    67%    │
│                                                  │
│ [Pay 10,000 RWF] [Bank Slip]                    │
└─────────────────────────────────────────────────┘

Unpaid Bill (CURSU - 0 paid of 30,000):
┌─────────────────────────────────────────────────┐
│ 📋 CURSU Fee          [Unpaid]                  │
│ Amount Due: 30,000 RWF                          │
│ [████░░░░░░░░]  Balance: 30,000 RWF            │
│                                                  │
│ [Pay 30,000 RWF] [Bank Slip]                    │
└─────────────────────────────────────────────────┘
```

### Test Cases

#### TC2.1: Progress Bar Fill
- [ ] Progress bar is 50% filled
- [ ] Fill color is amber/orange
- [ ] "50%" percentage shown
- [ ] "Paid: 30,000 / 60,000 RWF" text visible

#### TC2.2: Individual Bill Progress
- [ ] REGISTRATION shows progress bar with 67% fill
- [ ] REGISTRATION shows "67% paid" text
- [ ] CURSU shows progress bar with 0% fill
- [ ] Progress bars align properly

#### TC2.3: Amount Paid Display
- [ ] REGISTRATION shows "Paid: 20,000 RWF" in emerald
- [ ] CURSU shows no "Paid" text (since 0 paid)
- [ ] Text is right color and readable

#### TC2.4: Balance Badge Updates
- [ ] REGISTRATION badge shows "10,000"
- [ ] CURSU badge shows "30,000"
- [ ] Both are correctly positioned

#### TC2.5: Pay Button Amounts
- [ ] REGISTRATION button shows "Pay 10,000 RWF"
- [ ] CURSU button shows "Pay 30,000 RWF"
- [ ] Amounts match the balance

#### TC2.6: Status Chips
- [ ] REGISTRATION shows "Part paid" chip
- [ ] CURSU shows "Unpaid" chip
- [ ] Colors are distinct

---

## Test Scenario 3: Applicant with Full Payment

### Setup
- Login as **Applicant C** (60,000 fully paid)
- Navigate to admission fees section

### Expected Visual Output

```
┌─────────────────────────────────────────────────┐
│ ✅ All admission fees are settled.              │
│ Registration number: ABC-2026-00001             │
│                                                  │
│ Welcome to Catholic University of Rwanda       │
└─────────────────────────────────────────────────┘

Bills:
┌─────────────────────────────────────────────────┐
│ 📋 Registration Fee    [Paid] ✅                │
│ Amount Due: 30,000 RWF   Paid: 30,000 RWF      │
│ Ref: TXN-2026-123456                            │
│                                                  │
│ ✅ Paid (no button)                             │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ 📋 CURSU Fee          [Paid] ✅                 │
│ Amount Due: 30,000 RWF   Paid: 30,000 RWF      │
│ Ref: TXN-2026-123457                            │
│                                                  │
│ ✅ Paid (no button)                             │
└─────────────────────────────────────────────────┘
```

### Test Cases

#### TC3.1: Amber Alert Disappears
- [ ] Amber "Outstanding" alert is NOT visible
- [ ] Green success message IS visible
- [ ] Page refreshed: alert still gone

#### TC3.2: Success Message
- [ ] Green note appears with badge icon
- [ ] Shows "All admission fees are settled"
- [ ] Shows registration number
- [ ] Message readable and properly styled

#### TC3.3: Bill Status
- [ ] Both bills show "Paid" status chip (green)
- [ ] Status chips are aligned properly

#### TC3.4: Payment Display
- [ ] Both bills show "Paid: 30,000 RWF" in emerald
- [ ] Reference numbers visible
- [ ] Amounts match

#### TC3.5: No Balance Badges
- [ ] No "Balance" badges visible
- [ ] No progress bars showing
- [ ] Clean, simple "Paid" checkmark display

#### TC3.6: No Pay Buttons
- [ ] Pay buttons are replaced with "✅ Paid"
- [ ] Bank Slip button not visible
- [ ] Confirm Offline button not visible

#### TC3.7: Continue to Enrollment
- [ ] "Continue to Next Step" button is ENABLED
- [ ] Button is clickable
- [ ] Button leads to next step (if clicking)

---

## Test Scenario 4: Validator View - Incomplete Payment

### Setup
- Login as **Validator/Admin**
- Navigate to **Applicant B's** application
- View admission fees section

### Expected Visual Output

```
┌───────────────────────────────────────────────┐
│ ⚠️  Payment Incomplete - Action Required       │
│                                                │
│ This applicant has not paid the full amount   │
│ for admission. Current balance: 30,000 RWF   │
│                                               │
│ ┌─────────────────────────────────────────────┐
│ │ Total Required:    60,000 RWF              │
│ │ Paid to Date:      30,000 RWF              │
│ │ ─────────────────────────────────────────  │
│ │ Balance Due:       30,000 RWF              │
│ └─────────────────────────────────────────────┘
│                                               │
│ ⚠️ Registration number cannot be issued       │
│    until full payment is received.            │
└───────────────────────────────────────────────┘
```

### Test Cases

#### TC4.1: Red Alert Visibility
- [ ] Red "Payment Incomplete" alert appears
- [ ] Alert is at the top of the section
- [ ] Red background is distinct from other content
- [ ] Alert icon (⚠️) visible

#### TC4.2: Current Balance Display
- [ ] Shows "Current balance: 30,000 RWF"
- [ ] Amount is bold/prominent
- [ ] Amount is correct (60,000 - 30,000)

#### TC4.3: Financial Breakdown Table
- [ ] Table has light background (white/light gray)
- [ ] "Total Required: 60,000 RWF" row visible
- [ ] "Paid to Date: 30,000 RWF" row visible
- [ ] "Balance Due: 30,000 RWF" row visible with separator
- [ ] All amounts correct
- [ ] Font sizes readable

#### TC4.4: Lock Indicator
- [ ] "⚠️ Registration number cannot be issued..." message visible
- [ ] Message is in red color
- [ ] Message is prominent

#### TC4.5: Validator Actions
- [ ] "Confirm offline" button visible (for bank transfers)
- [ ] "Re-price from current fee structures" link visible
- [ ] Buttons are clickable

---

## Test Scenario 5: Validator View - Complete Payment

### Setup
- Login as **Validator/Admin**
- Navigate to **Applicant C's** application
- View admission fees section

### Expected Visual Output

```
┌───────────────────────────────────────────────┐
│ ✅ All admission fees are settled.            │
│ Registration number: ABC-2026-00001           │
│ The registration number has been issued.      │
└───────────────────────────────────────────────┘
```

### Test Cases

#### TC5.1: Red Alert Disappears
- [ ] Red "Payment Incomplete" alert NOT visible
- [ ] Page refreshed: alert still gone

#### TC5.2: Green Success Message
- [ ] Green note appears with badge icon
- [ ] Shows registration number
- [ ] Shows "has been issued" message
- [ ] Message properly styled

#### TC5.3: Bills Show as Paid
- [ ] All bills show "Paid" status chips
- [ ] Status chips are green
- [ ] Amount paid matches amount due
- [ ] Reference numbers visible

---

## Test Scenario 6: Responsive Design Testing

### Desktop (1920px)

#### TC6.1: Layout
- [ ] All elements visible without scrolling (horizontal)
- [ ] Proper spacing between sections
- [ ] Balance badge on same line as status chip
- [ ] Progress bars full width

#### TC6.2: Text Readability
- [ ] All text readable without zooming
- [ ] Font sizes appropriate
- [ ] Line heights good

#### TC6.3: Table Display
- [ ] Financial breakdown table properly aligned
- [ ] Columns evenly spaced
- [ ] No overflow

### Tablet (768px)

#### TC6.4: Responsive Layout
- [ ] Alert message and balance adapt
- [ ] Progress bar full width
- [ ] Bills section readable
- [ ] No horizontal scroll needed

#### TC6.5: Touch Targets
- [ ] Buttons large enough for touch (48px minimum)
- [ ] Spacing between buttons adequate

### Mobile (375px - iPhone SE)

#### TC6.6: Mobile Layout
- [ ] Alert stacks vertically
- [ ] Balance badge below title
- [ ] Progress bar full width with padding
- [ ] All text readable

#### TC6.7: Mobile Buttons
- [ ] Buttons stack vertically
- [ ] Button width: ~90% of screen
- [ ] Touch targets adequate (48x48px)
- [ ] No text overlap

#### TC6.8: Mobile Tables
- [ ] Financial breakdown table readable
- [ ] Rows stack if needed
- [ ] No horizontal overflow
- [ ] Font sizes readable

#### TC6.9: Mobile Scrolling
- [ ] Vertical scrolling works
- [ ] No horizontal scrolling
- [ ] All content reachable

---

## Test Scenario 7: Dark Mode Testing

### Setup
- Enable dark mode in application settings
- Test with each scenario (unpaid, partial, paid)

### Expected Behavior

#### TC7.1: Colors Visible
- [ ] Amber alerts visible on dark background
- [ ] Red alerts visible on dark background
- [ ] Progress bars have sufficient contrast
- [ ] Text is readable

#### TC7.2: Contrast Ratios
- [ ] Amber text on dark bg: WCAG AA (4.5:1)
- [ ] Red text on dark bg: WCAG AA (4.5:1)
- [ ] White/light text on dark bg: sufficient
- [ ] No color combinations too low contrast

#### TC7.3: Element Styling
- [ ] Cards have dark background
- [ ] Text has light color
- [ ] Borders visible
- [ ] Backgrounds distinguishable

#### TC7.4: Status Chips
- [ ] Paid chip visible in dark mode (green)
- [ ] Unpaid chip visible in dark mode (red)
- [ ] Part paid chip visible (amber)
- [ ] Colors match light mode scheme

---

## Test Scenario 8: Payment Flow - Live Update

### Setup
- Have Applicant B (partial payment) open in browser
- Simulate a payment being received
- Watch for automatic update

### Expected Behavior

#### TC8.1: Auto-Refresh
- [ ] Page auto-refreshes every 4-10 seconds
- [ ] Amount paid increases
- [ ] Progress bar updates
- [ ] Balance decreases
- [ ] No manual refresh needed

#### TC8.2: New Payment Confirmation
- [ ] Simulate new payment (30,000 RWF)
- [ ] Within 10 seconds, page updates to:
  - [ ] Progress bar at 100%
  - [ ] "Paid: 60,000 / 60,000 RWF"
  - [ ] Amber alert disappears
  - [ ] Green success message appears

#### TC8.3: Bills Update
- [ ] Bills change from "Part paid" to "Paid"
- [ ] Status chips turn green
- [ ] Paid amounts update
- [ ] Balance badges disappear

---

## Test Scenario 9: Browser Compatibility

### Chrome (Latest)

#### TC9.1: Rendering
- [ ] All elements render correctly
- [ ] Colors accurate
- [ ] Layout as expected

#### TC9.2: Interactivity
- [ ] Buttons clickable
- [ ] Links follow
- [ ] No console errors

### Firefox (Latest)

#### TC9.3: Rendering
- [ ] Same visual appearance as Chrome
- [ ] No layout shift
- [ ] Colors consistent

#### TC9.4: Performance
- [ ] Page loads quickly
- [ ] Smooth scrolling
- [ ] Animations smooth (if any)

### Safari (Latest)

#### TC9.5: Compatibility
- [ ] All features work
- [ ] Flexbox layout correct
- [ ] Gradients render properly

### Mobile Chrome

#### TC9.6: Mobile Rendering
- [ ] Responsive layout works
- [ ] Touch interactions responsive
- [ ] No layout issues

### Mobile Safari (iOS)

#### TC9.7: iOS Rendering
- [ ] All elements visible
- [ ] Touch targets sized correctly
- [ ] No horizontal scroll

---

## Test Scenario 10: Accessibility Testing

### Keyboard Navigation

#### TC10.1: Tab Navigation
- [ ] Tab through all interactive elements
- [ ] Tab order is logical (left to right, top to bottom)
- [ ] No keyboard traps
- [ ] Focus indicators visible

#### TC10.2: Button Activation
- [ ] Space/Enter activates buttons
- [ ] All buttons keyboard-accessible
- [ ] No elements require mouse

### Screen Reader Testing

#### TC10.3: Text Content
- [ ] Screen reader announces all text
- [ ] Labels clear for all inputs/buttons
- [ ] Status information announced
- [ ] Amounts announced clearly

#### TC10.4: Navigation
- [ ] Screen reader announces headings
- [ ] Sections clearly marked
- [ ] Alerts announced as alerts
- [ ] Progress bar value announced

---

## Edge Cases & Error Scenarios

### TC11.1: Zero Balance
- [ ] If balance = 0.00, display: "0 RWF"
- [ ] Progress bar at 100%
- [ ] Alert doesn't appear
- [ ] No console errors

### TC11.2: Very Large Amounts
- [ ] 10,000,000 RWF displays correctly
- [ ] Number formatting includes separators
- [ ] Progress bar works (capped at 100%)
- [ ] No text overflow

### TC11.3: Very Small Amounts
- [ ] 1 RWF displays correctly
- [ ] 0.01 RWF (if applicable) shows
- [ ] Progress bar shows minimal fill
- [ ] No rounding errors

### TC11.4: Missing Data
- [ ] If data missing: graceful degradation
- [ ] Error message if applicable
- [ ] No JavaScript errors

---

## Sign-Off Checklist

### Functionality
- [ ] All scenarios pass (1-10)
- [ ] Edge cases handled (11)
- [ ] No regressions in existing features
- [ ] All expected behaviors observed

### Design & UX
- [ ] Visual appearance correct
- [ ] Colors accurate in all themes
- [ ] Layout responsive at all sizes
- [ ] Typography readable
- [ ] Spacing and alignment correct

### Technical Quality
- [ ] No console errors
- [ ] No performance issues
- [ ] Build verified (0 errors)
- [ ] All tests repeatable

### Accessibility
- [ ] Keyboard navigation works
- [ ] Screen reader compatible
- [ ] Color contrast sufficient
- [ ] WCAG AA compliant

### Documentation
- [ ] User guide tested and accurate
- [ ] Implementation notes match behavior
- [ ] Testing guide complete
- [ ] Deployment guide followed

---

## Final Approval

**QA Lead**: _________________ **Date**: _________

**Admissions Staff**: _________________ **Date**: _________

**Product Owner**: _________________ **Date**: _________

**Ready for Production**: ☐ YES ☐ NO

**Issues Found**: ☐ None ☐ Critical ☐ Major ☐ Minor

---

**Report Generated**: September 23, 2026  
**Component**: AdmissionFeesPanel.tsx  
**Feature**: Admission Fee Validation & Payment Balance Tracking

Here is a comprehensive technical and functional documentation for the **Fee Management Module** tailored for a Rwandan university context (like CUR). This document is structured specifically to guide developers, UI/UX designers, and systems architects during the build phase.

---

# 📖 Module Documentation: Fee & Payment Management

## 1. System Overview

The Fee Management Module is responsible for automating student billing, processing payments via local Rwandan gateways (Bank of Kigali, Equity Bank, MTN MoMo), managing sponsorships, and generating real-time financial reconciliation reports.

### 1.1. Core Actors (Roles)

- **Student:** Views balances, generates payment reference numbers, and downloads receipts.
- **Accounts Receivable (AR) Officer:** Manages manual payments, resolves webhook failures, and handles refunds or ledger corrections.
- **System Administrator:** Configures fee structures, academic years, and API gateway credentials.
- **External APIs:** Bank of Kigali (BK), Equity Bank, MTN Mobile Money API, Sponsor APIs (e.g., BRD/MINEDUC).

---

## 2. Data Flow Architecture (DFD)

How data moves between the student, the system, and external financial institutions.

### Level 1: Payment Automation Data Flow

1.  **Request Initiation:** The `Student Application` requests the outstanding balance from the `Finance Database`.
2.  **Reference Generation:** The `Billing Controller` generates a unique, 12-digit **Payment Reference Number (PRN)** linked to the student's ID and specific invoice.
3.  **External Payment:** The Student uses the PRN on the _Bank of Kigali App_ or via *MTN MoMo (*182#)\*.
4.  **Webhook Trigger:** The `Bank/MoMo API` sends a JSON payload containing `[PRN, Amount Paid, Timestamp, Bank Transaction ID]` to the MIS `Webhook Listener`.
5.  **Reconciliation:** The `Payment Processor` validates the PRN, updates the `Student_Ledger` table (Credit), and marks the invoice as partial or fully paid.
6.  **Notification:** The `Notification Service` triggers an SMS/Email receipt to the student.

---

## 3. User Flows

User flows define the journey a specific user takes through the MIS interface.

### Flow A: Student Self-Service Payment Flow

_Goal: Pay semester tuition fees online._

- **Step 1:** User logs into MIS Student Portal.
- **Step 2:** Navigates to **"Financials" > "My Statement"**.
- **Step 3:** UI displays **Current Balance**, **Due Dates**, and **Recent Transactions**.
- **Step 4:** User clicks **"Make Payment"**.
- **Step 5:** Modal prompts user to select payment method: _MTN MoMo_ or _Bank Transfer (BK/Equity)_.
  - _Path MoMo:_ User enters phone number. System triggers a USSD push (MoMo API). User enters PIN on their phone.
  - _Path Bank:_ System displays a unique **PRN (Payment Reference Number)**. User logs into their banking app and pays using the PRN.
- **Step 6:** System receives webhook, UI auto-refreshes, displaying **"Payment Successful"**.
- **Step 7:** User downloads digitally stamped PDF receipt.

### Flow B: AR Officer Exception Handling Flow

_Goal: Reconcile a payment where the student typed the wrong PRN at the bank._

- **Step 1:** Officer logs into Admin MIS.
- **Step 2:** Navigates to **"Finance Dashboard" > "Unallocated Funds"**.
- **Step 3:** UI displays a list of bank deposits received via API but missing a valid PRN.
- **Step 4:** Officer searches system by "Student Name" or "Phone Number" associated with the deposit.
- **Step 5:** Officer clicks **"Allocate Payment"**, selects the correct Student ID, and submits.
- **Step 6:** System debits "Unallocated Account" and credits "Student Ledger".

---

## 4. Task Flows (Backend & Logic)

Task flows represent the step-by-step logic the system executes in the background.

### Task 1: Automated Semester Invoicing (Batch Process)

_Triggered at the start of a new semester or after module registration._

1.  **Cron Job** triggers `Generate_Semester_Invoices()`.
2.  System fetches all students with status `Registered` for Academic Year 2026/2027.
3.  For each student, system checks:
    - _Faculty & Program_ (e.g., BSc Nursing).
    - _Student Type_ (Local, International, Sponsored).
4.  System fetches pricing from `Fee_Structures` table.
5.  System checks `Sponsorship_Allocations` table (e.g., does a diocese pay 50%?).
6.  System generates `Invoice`:
    - Credits University Revenue Account.
    - Debits Student Accounts Receivable (and Sponsor AR if applicable).
7.  System pushes Invoice to Student Portal.

### Task 2: Clearance & Exam Card Generation

_Triggered when a student requests an exam permit._

1.  Student clicks **"Download Exam Card"**.
2.  System queries `Student_Ledger`.
3.  Calculates `Total Invoiced - Total Paid`.
4.  If Balance > 0 (or above a permissible threshold like 10,000 RWF):
    - Action: **Block download**. Display error: _"Clear outstanding balance of X RWF to download permit."_
5.  If Balance <= 0:
    - Action: **Allow download**. Generate PDF with QR Code.

---

## 5. Database Entity-Relationship (ERD) Guidelines

For developers structuring the relational database, here are the core tables and relationships:

- **`users`**: Master authentication table.
- **`students`**: Contains `student_id`, `faculty_id`, `intake_cohort` (Foreign Key to `users`).
- **`fee_structures`**: Defines global prices. Columns: `id`, `academic_year`, `faculty_id`, `fee_type` (Tuition, Registration, Library), `amount`.
- **`invoices`**: Records what is owed. Columns: `id`, `student_id`, `academic_term`, `total_amount`, `due_date`, `status` (Unpaid, Partial, Paid).
- **`payments` (The Ledger)**: Records actual cash movement. Columns: `id`, `student_id`, `invoice_id`, `amount_paid`, `payment_method` (MoMo, BK, Equity, Cash), `gateway_reference` (Bank Txn ID), `payment_date`.
- **`sponsorships`**: Links student to external payers. Columns: `id`, `student_id`, `sponsor_name` (e.g., Diocese, MINEDUC), `coverage_percentage` (e.g., 100%).

---

## 6. Critical API Integration Architecture

To handle Rwandan banking APIs securely, developers must implement a **Webhook Listener Architecture**:

1.  **Endpoint:** `POST https://api.cur.ac.rw/v1/finance/webhooks/bank-callback`
2.  **Security:** \* Whitelisting: Only accept POST requests from known Bank of Kigali/Equity/MoMo IP addresses.
    - Authentication: Implement Bearer Tokens or HMAC SHA-256 signature verification in the headers to prevent spoofing.
3.  **Idempotency:** Developers _must_ implement Idempotency Keys using the Bank's `Transaction_ID`. If the bank sends the same webhook twice due to a network timeout, the MIS must not credit the student's ledger twice.
4.  **Queue System:** Do not process webhooks synchronously. Send incoming payloads to a Redis/RabbitMQ queue to be processed by background workers. This ensures the MIS never times out when responding to the bank.

---

## 7. UI/UX Developer Notes

- **Currency Formatting:** Always format numbers with comma separators (e.g., `1,500,000 RWF`).
- **Mobile-First Design:** 80% of students will access the portal via their smartphones. Tables showing ledgers must be horizontally scrollable or collapsed into cards on mobile views.
- **Color Coding:** Use universally recognized traffic-light colors for statuses:
  - <span style="color:red">Red:</span> Unpaid / Overdue
  - <span style="color:orange">Orange:</span> Partially Paid
  - <span style="color:green">Green:</span> Fully Cleared / Paid

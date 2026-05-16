# UrubutoPay Integration — Analysis Report & Implementation Guide

**Institution:** Catholic University of Rwanda (CUR)  
**Merchant Code:** `TH17342831`  
**Date:** 2026-05-16  
**Author:** Senior Analyst

---

## 1. Executive Summary

CUR is integrated with **UrubutoPay** (BKTechouse) as its mobile payment gateway. Students can pay tuition using:

| Channel | How |
|---------|-----|
| **USSD *775#** | Student dials `*775#` → selects CUR merchant → enters reg number → pays via MOMO/AIRTEL_MONEY |
| **Hosted Checkout** | Student clicks "Pay via MoMo" in the student portal → redirected to `https://urubutopay.rw/pay-now?mhcd=TH17342831&pycd={regNumber}` |

Both channels require CUR to expose three webhook endpoints that UrubutoPay calls to validate payers, receive callbacks, and authenticate.

---

## 2. UrubutoPay API Documentation Analysis

### 2.1 API Suite Overview

Three API documents were analyzed:

| Document | Purpose |
|----------|---------|
| **UrubutoPay Integration Guide** | Payer validation + payment callback webhooks (institution-facing) |
| **UrubutoPay Bulk Disbursement API v2.0** | Outgoing transfers — salaries, refunds (merchant → MTN MOMO/AIRTEL) |
| **HEC API Documentation** | Reference implementation from another institution |

### 2.2 Authentication Flow

UrubutoPay uses **mutual JWT authentication**:

```
1. UrubutoPay calls POST /api/token.php  
   → CUR issues JWT (Bearer token)

2. UrubutoPay includes that JWT in Authorization header  
   → when calling /api/getstudent.php and /api/callback.php

3. CUR validates the JWT against api_authorization table  
   → before processing any webhook
```

### 2.3 Webhook Endpoints Required by UrubutoPay

#### A. Auth Token — `POST /api/token.php`

**UrubutoPay calls this to authenticate before validating payers or sending callbacks.**

Request:
```json
{ "user_name": "bk_csgd", "password": "..." }
```

Required response:
```json
{
  "timestamp": "2024-01-01T10:00:00Z",
  "status": 200,
  "data": { "token": "Bearer eyJ..." }
}
```

#### B. Payer Validation — `POST /api/getstudent.php`

**UrubutoPay calls this when a student dials `*775#` and enters the merchant code + reg number. CUR must confirm the student exists.**

Request:
```json
{ "payer_code": "CUR/BBA/001/2022", "merchant_code": "TH17342831" }
```

Success response (HTTP 200):
```json
{
  "timestamp": "...",
  "status": 200,
  "data": {
    "payer_names": "MUGISHA John",
    "merchant_code": "TH17342831",
    "payer_code": "CUR/BBA/001/2022",
    "service_code": "tuition-fees-1258",
    "commission_rate": 0,
    "services": [
      { "service_code": "tuition-fees-1258", "service_name": "TUITION FEES", "amount": 0, "currency": "RWF" },
      { "service_code": "cursu-fees-8249",   "service_name": "CURSU FEES",   "amount": 0, "currency": "RWF" }
    ]
  }
}
```

Failure response (HTTP 404):
```json
{ "timestamp": "...", "status": 404, "message": "Payer not found" }
```

#### C. Payment Callback — `POST /api/callback.php` *(NEW)*

**UrubutoPay calls this after a payment completes successfully.**

Request body:
```json
{
  "callback_type": "PAYMENT",
  "transaction_code": "TXN123456",
  "payer_code": "CUR/BBA/001/2022",
  "amount": 450000,
  "currency": "RWF",
  "payment_date": "2024-01-01T10:00:00Z",
  "service_code": "tuition-fees-1258",
  "status": "SUCCESSFUL"
}
```

Expected response (HTTP 200):
```json
{ "timestamp": "...", "status": 200, "message": "Payment recorded" }
```

### 2.4 Service Codes

| Code | Description |
|------|-------------|
| `tuition-fees-1258` | Tuition fees (primary service) |
| `cursu-fees-8249` | CURSU (student union) fees |

### 2.5 Bulk Disbursement API (Outbound Payments)

Used for outgoing transfers FROM CUR merchant wallet TO MTN MOMO / AIRTEL beneficiaries. Key endpoints:

| Endpoint | Purpose |
|----------|---------|
| `POST /bulk-disbursements` | Initiate batch transfers |
| `GET /bulk-disbursements/{id}` | Check status |
| `POST /bulk-disbursements/{id}/retry` | Retry failed items |

**Not implemented in this sprint** — relevant for scholarship disbursements and refunds.

---

## 3. Existing Codebase Analysis

### 3.1 `payment_api/` Directory

| File | Role |
|------|------|
| `Rest.php` | Core REST class — all 5 webhook methods |
| `token.php` | Router → `Rest::claimtoken()` |
| `getstudent.php` | Router → `Rest::getStudent()` |
| `payment.php` | Router → `Rest::insertPayment()` + reconciler |
| `cancel_transaction.php` | Router → `Rest::delete_transaction()` |
| `update.php` | Router → `Rest::update_new()` |
| `payment_reconciler.php` | Maps payments to `fee_invoices` oldest-first |
| `bankup/class/Rest.php` | Parallel implementation (merchant-specific) |
| `callback.php` | **NEW** — Router → `Rest::claimCallback()` |

### 3.2 Database Tables Used

| Table | Purpose |
|-------|---------|
| `student` | Student lookup by `regnumber` |
| `api_authorization` | Token/merchant credential store |
| `payment` | All payment records |
| `fee_invoices` | Invoice ledger (amount_due, amount_paid, bursary_applied) |
| `payment_reconciliation_log` | Audit trail from PaymentReconciler |

### 3.3 Payment Reconciler Flow

```
claimCallback() inserts row in `payment`
         ↓
PaymentReconciler::reconcile($transCode)
         ↓
Finds all open fee_invoices for the student
         ↓
Applies payment oldest-first (like paying bills)
         ↓
Updates amount_paid on each invoice
         ↓
Writes to payment_reconciliation_log
```

---

## 4. Gap Analysis

| Requirement | Before This Sprint | After This Sprint |
|-------------|-------------------|------------------|
| Auth token format (`Bearer` prefix) | Missing — token returned raw | Fixed |
| Payer validation format (`services`, `commission_rate`) | Missing — returned non-standard format | Fixed |
| Payment callback endpoint (`/api/callback.php`) | Did not exist | Created |
| Callback auto-reconciliation | N/A | Implemented (synchronous) |
| Student portal "Pay via MoMo" button | Did not exist | Added to MyFinancePage |
| Backend payment link API | Did not exist | `GET /api/finance/my/payment-link` |
| Hosted checkout URL | Not wired | `https://urubutopay.rw/pay-now?mhcd=TH17342831&pycd={reg}` |
| UrubutoPay env constants | Hardcoded | Moved to `backend/.env` |

---

## 5. Implementation Details

### 5.1 Files Modified / Created

| File | Type | What Changed |
|------|------|-------------|
| `payment_api/Rest.php` | Modified | Fixed `claimtoken()`, fixed `getStudent()`, added `claimCallback()` |
| `payment_api/callback.php` | **Created** | New router file for callback endpoint |
| `payment_api/bankup/class/Rest.php` | Modified | Fixed `getStudent()`, added `claimCallback()` |
| `backend/.env` | Modified | Added 4 `URUBUTOPAY_*` constants |
| `backend/app/Controllers/FeeController.php` | Modified | Added `getPaymentLink()` method |
| `backend/routes/api/finance.php` | Modified | Added `GET /my/payment-link` route |
| `frontend/src/services/financeService.ts` | Modified | Added `myLedgerService.getPaymentLink()` |
| `frontend/src/pages/finance/MyFinancePage.tsx` | Modified | Added "Pay via MoMo" button + handler |

### 5.2 Configure UrubutoPay Dashboard

Register these webhook URLs in the UrubutoPay merchant portal:

| Webhook | URL |
|---------|-----|
| Auth Token | `http://your-domain/cur-mis/payment_api/token.php` |
| Payer Validation | `http://your-domain/cur-mis/payment_api/getstudent.php` |
| Payment Callback | `http://your-domain/cur-mis/payment_api/callback.php` |

### 5.3 UrubutoPay Hosted Checkout URL Format

```
https://urubutopay.rw/pay-now?mhcd=TH17342831&pycd={studentRegNumber}
```

The student portal builds this URL via `GET /api/finance/my/payment-link` and opens it in a new tab.

---

## 6. Grouped Implementation Tasks

### Group 1: Webhook Layer (payment_api/) — DONE
- [x] T1.1 Fix `claimtoken()` — prefix token with "Bearer "
- [x] T1.2 Fix `getStudent()` — add `services`, `service_code`, `commission_rate`
- [x] T1.3 Add `claimCallback()` — insert payment + trigger reconciler
- [x] T1.4 Create `payment_api/callback.php` router

### Group 2: Backend Route — DONE
- [x] T2.1 Add `getPaymentLink()` to FeeController (queries outstanding balance)
- [x] T2.2 Register `GET /api/finance/my/payment-link` in finance routes

### Group 3: Frontend — DONE
- [x] T3.1 Add `getPaymentLink` to `myLedgerService` in financeService.ts
- [x] T3.2 Add "Pay via MoMo" button to MyFinancePage.tsx

### Group 4: Configuration — DONE
- [x] T4.1 Add `URUBUTOPAY_MERCHANT_CODE`, `URUBUTOPAY_SERVICE_CODE_*`, `URUBUTOPAY_CHECKOUT_URL` to `backend/.env`

### Group 5: Documentation — DONE
- [x] T5.1 Created this analysis report

---

## 7. Testing Checklist

### Webhook Tests (use Postman or curl)

```bash
# 1. Get auth token
POST http://localhost:8888/cur-mis/payment_api/token.php
Body: { "user_name": "bk_csgd", "password": "your-password" }
Expected: { "status": 200, "data": { "token": "Bearer eyJ..." } }

# 2. Validate student (replace TOKEN and REGNUMBER)
POST http://localhost:8888/cur-mis/payment_api/getstudent.php
Authorization: Bearer TOKEN
Body: { "payer_code": "REGNUMBER", "merchant_code": "TH17342831" }
Expected: { "status": 200, "data": { "payer_names": "...", "services": [...] } }

# 3. Validate unknown student
POST /getstudent.php  Authorization: Bearer TOKEN
Body: { "payer_code": "INVALID", "merchant_code": "TH17342831" }
Expected: { "status": 404, "message": "Payer not found" }

# 4. Payment callback (simulate UrubutoPay)
POST http://localhost:8888/cur-mis/payment_api/callback.php
Authorization: Bearer TOKEN
Body: { "callback_type":"PAYMENT","transaction_code":"TEST-001",
        "payer_code":"REGNUMBER","amount":100000,"currency":"RWF",
        "payment_date":"2026-05-16T10:00:00Z","service_code":"tuition-fees-1258","status":"SUCCESSFUL" }
Expected: { "status": 200, "message": "Payment recorded" }
→ Verify: SELECT * FROM payment WHERE external_transaction_id='TEST-001';
→ Verify: SELECT * FROM payment_reconciliation_log ORDER BY id DESC LIMIT 5;

# 5. Duplicate callback (idempotency)
Repeat step 4 with the same transaction_code
Expected: { "status": 200, "message": "Payment already recorded" }

# 6. Invalid Bearer token
POST /callback.php  Authorization: Bearer WRONG
Expected: HTTP 401  { "status": 401, "message": "Wrong Authentication" }
```

### Frontend Tests

1. Student logs in → navigates to **My Finance** page
2. "Pay via MoMo" button is visible in the top-right area
3. Click button → new tab opens at `https://urubutopay.rw/pay-now?mhcd=TH17342831&pycd={reg}`
4. If API fails → red error banner appears under header

### End-to-End USSD Test (requires live UrubutoPay configuration)

1. Configure webhook URLs in UrubutoPay merchant portal
2. Dial `*775#` on an MTN/AIRTEL SIM
3. Select CUR from merchant list
4. Enter student reg number when prompted
5. UrubutoPay calls `/api/getstudent.php` → student name displayed on phone
6. Confirm payment on phone
7. UrubutoPay calls `/api/callback.php` → payment recorded in `payment` table and reconciled against invoices

---

## 8. Bulk Disbursement (Future Work)

The **Bulk Disbursement API v2.0** enables CUR to send money outbound (scholarships, refunds). This was not implemented in this sprint. Key integration points when ready:

- Initiate: `POST https://api.urubutopay.rw/v2/bulk-disbursements`
- Auth: Bearer token from CUR's UrubutoPay merchant credentials (separate from the institution-facing auth)
- Beneficiary channels: `MOMO` (MTN), `AIRTEL_MONEY`
- Required fields: `reference`, `description`, `items[]` (phone, amount, name)

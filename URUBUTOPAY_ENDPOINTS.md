# UrubutoPay Integration — Endpoint Reference

**Institution:** Catholic University of Rwanda (CUR)  
**Merchant Code:** `TH90989816`  
**Service Codes:** 22 services registered on the merchant account — see the
`urubuto_services` table (migration 134) and the mapping table in
`URUBUTOPAY_INTEGRATION.md` §2.4. `tuition-fees-1258` and `cursu-fees-8249` are
retired and kept only as aliases.  
**Last Updated:** 2026-08-17

---

## Environment URLs

| Environment | Legacy API Base | Modern Backend Base |
|-------------|----------------|---------------------|
| **Local (MAMP)** | `http://localhost:8888/cur-mis/payment_api` | `http://localhost:8888/cur-mis/backend/public` |
| **Production** | `https://cur.ac.rw/payment_api` | `https://cur.ac.rw/umis/api` |

> **Which path to give the bank?**  
> The **legacy API** (`payment_api/`) is the active webhook target — it is the path originally registered with UrubutoPay. The **modern backend** (`/api/payment/webhook/*`) is a parallel implementation with identical behaviour; either set can be used. Provide whichever matches what was originally registered in the UrubutoPay merchant dashboard.

---

## 1. Authentication URL

UrubutoPay calls this endpoint first to obtain a Bearer token. The token is then sent in the `Authorization` header of every subsequent request.

| | Legacy | Modern Backend |
|-|--------|----------------|
| **Method** | `POST` | `POST` |
| **Local URL** | `http://localhost:8888/cur-mis/payment_api/token.php` | `http://localhost:8888/cur-mis/backend/public/api/payment/webhook/token` |
| **Production URL** | `https://cur.ac.rw/payment_api/token.php` | `https://cur.ac.rw/umis/api/payment/webhook/token` |
| **Auth required** | None | None |

### Request Body

```json
{
  "user_name": "bk_csgd",
  "password": "••••••••"
}
```

### Success Response `200`

```json
{
  "timestamp": "2026-05-16T10:00:00Z",
  "status": 200,
  "data": {
    "token": "Bearer eyJhbGciOiJ..."
  }
}
```

### Error Responses

| HTTP Code | Meaning |
|-----------|---------|
| `400` | `user_name` or `password` missing |
| `401` | Invalid credentials |

### Validation Applied

- `user_name` and `password` must be non-empty strings
- Password verified against `api_authorization` table using bcrypt / SHA-256 / SHA-1 / MD5 / plain-text (in priority order)
- Response token includes `"Bearer "` prefix as required by UrubutoPay spec

---

## 2. Validation URL (Payer Verification)

UrubutoPay calls this to confirm that a student registration number is valid before accepting a payment from them via USSD or hosted checkout.

| | Legacy | Modern Backend |
|-|--------|----------------|
| **Method** | `POST` | `POST` |
| **Local URL** | `http://localhost:8888/cur-mis/payment_api/getstudent.php` | `http://localhost:8888/cur-mis/backend/public/api/payment/webhook/verify` |
| **Production URL** | `https://cur.ac.rw/payment_api/getstudent.php` | `https://cur.ac.rw/umis/api/payment/webhook/verify` |
| **Auth required** | Bearer token (from step 1) | Bearer token (from step 1) |

### Request Body

```json
{
  "payer_code": "CUR/BBA/001/2022",
  "merchant_code": "TH90989816"
}
```

### Success Response `200`

```json
{
  "timestamp": "2026-05-16T10:00:00Z",
  "status": 200,
  "data": {
    "payer_names": "JEAN BAPTISTE NKURUNZIZA",
    "merchant_code": "TH90989816",
    "payer_code": "CUR/BBA/001/2022",
    "service_code": "tuition-fees-4679",
    "commission_rate": 0,
    "services": [
      { "service_code": "tuition-fees-4679",      "service_name": "TUITION FEES",      "amount": 450000, "currency": "RWF" },
      { "service_code": "registration-fees-9493", "service_name": "Registration fees", "amount": 30000,  "currency": "RWF" },
      { "service_code": "retake-5953",            "service_name": "Retake",            "amount": 0,      "currency": "RWF" }
    ]
  }
}
```

### Error Responses

| HTTP Code | Meaning |
|-----------|---------|
| `400` | `payer_code` or `merchant_code` missing |
| `401` | Bearer token invalid or missing |
| `404` | Student registration number not found |

### Validation Applied

- Bearer token validated against `api_authorization.token`
- `payer_code` and `merchant_code` both required (non-empty)
- `merchant_code` verified to exist in `api_authorization.merchant_code`
- Student looked up in `student` table by `regnumber = payer_code`

---

## 3. Payment Notification URL

UrubutoPay calls this endpoint when a payment has been processed. The system auto-records the payment, applies it to outstanding invoices (oldest-first waterfall), and updates the student's financial clearance status.

| | Legacy | Modern Backend |
|-|--------|----------------|
| **Method** | `POST` | `POST` |
| **Local URL** | `http://localhost:8888/cur-mis/payment_api/callback.php` | `http://localhost:8888/cur-mis/backend/public/api/payment/webhook/callback` |
| **Production URL** | `https://cur.ac.rw/payment_api/callback.php` | `https://cur.ac.rw/umis/api/payment/webhook/callback` |
| **Auth required** | Bearer token (from step 1) | Bearer token (from step 1) |

### Request Body

```json
{
  "callback_type": "PAYMENT",
  "transaction_code": "TXN-2026-001234",
  "payer_code": "CUR/BBA/001/2022",
  "amount": 450000,
  "currency": "RWF",
  "payment_date": "2026-05-16T10:05:00Z",
  "service_code": "tuition-fees-4679",
  "status": "SUCCESSFUL"
}
```

### Success Response `200`

```json
{
  "timestamp": "2026-05-16T10:05:01Z",
  "status": 200,
  "message": "Payment recorded"
}
```

### Non-payment / Non-successful Callbacks

Non-`PAYMENT` callback types and non-`SUCCESSFUL` statuses are acknowledged silently with `200` — no ledger changes are made.

### Error Responses

| HTTP Code | Meaning |
|-----------|---------|
| `400` | Missing required fields or invalid data |
| `401` | Bearer token invalid or missing |
| `404` | Student (`payer_code`) not found |
| `500` | Database insertion failed |

### Validation Applied

- Bearer token validated against `api_authorization.token`
- Only `callback_type = PAYMENT` with `status = SUCCESSFUL` triggers ledger writes
- `transaction_code`, `payer_code`, and `amount > 0` all required
- **Idempotency:** duplicate `transaction_code` returns `200` without re-recording
- Payment applied to oldest unpaid/partial `fee_invoices` first (waterfall)
- If no invoices exist, an `AUTO-BANK` invoice is auto-created
- `student_clearances` updated automatically after reconciliation
- All actions logged to `payment_reconciliation_log` and `system_logs`

---

## 4. Payment Reversal URL

UrubutoPay calls this endpoint to reverse a previously completed payment. The system marks the payment as reversed, reduces `fee_invoices.amount_paid` by the reversed amount, recomputes invoice statuses, and recalculates the student's clearance status.

| | Legacy | Modern Backend |
|-|--------|----------------|
| **Method** | `POST` | `POST` |
| **Local URL** | `http://localhost:8888/cur-mis/payment_api/cancel_transaction.php` | `http://localhost:8888/cur-mis/backend/public/api/payment/webhook/reversal` |
| **Production URL** | `https://cur.ac.rw/payment_api/cancel_transaction.php` | `https://cur.ac.rw/umis/api/payment/webhook/reversal` |
| **Auth required** | Bearer token (from step 1) | Bearer token (from step 1) |

### Request Body

```json
{
  "transaction_code": "TXN-2026-001234",
  "amount": 450000
}
```

> `amount` is optional. If omitted or `0`, the full original payment amount is reversed.  
> The legacy endpoint uses `transaction_id` instead of `transaction_code` — both are accepted by the modern endpoint.

### Success Response `200`

```json
{
  "timestamp": "2026-05-16T11:00:00Z",
  "status": 200,
  "message": "Payment reversed successfully",
  "data": {
    "transaction_code": "TXN-2026-001234",
    "amount_reversed": 450000
  }
}
```

### Error Responses

| HTTP Code | Meaning |
|-----------|---------|
| `400` | `transaction_code` / `transaction_id` missing |
| `401` | Bearer token invalid or missing |
| `404` | No confirmed payment found for the given transaction code |

### Validation Applied

- Bearer token validated against `api_authorization.token`
- `transaction_code` (or `transaction_id`) required
- Only `status = 'confirmed'` payments can be reversed
- **Idempotency:** already-reversed transactions return `200 duplicate` without re-reversing
- `fee_invoices.amount_paid` reduced by reversed amount (never below 0)
- Invoice statuses recomputed (`paid` → `partial`/`unpaid`/`overdue`)
- `student_clearances` recomputed — student may lose cleared status
- Legacy endpoint also inserts a `Credit` row in the `payment` ledger table

---

## 5. Payment Callback URL (Hosted Checkout Redirect)

After a student completes payment on UrubutoPay's hosted checkout page, their browser is redirected back to the university portal. This is **not an API endpoint** — it is the browser-facing finance dashboard page.

| | URL |
|-|-----|
| **Local** | `http://localhost:5173/finance` |
| **Production** | `https://cur.ac.rw/umis/finance` |

> **Server-side notification:** The actual payment result is delivered server-to-server via the **Payment Notification URL** (section 3 above). The redirect URL in section 5 is only for the student's browser experience after returning from the UrubutoPay payment page.

---

## Summary Table for Bank Submission

| Endpoint | Method | Production URL (Legacy) | Production URL (Modern) |
|----------|--------|------------------------|------------------------|
| **1. Authentication** | `POST` | `https://cur.ac.rw/payment_api/token.php` | `https://cur.ac.rw/umis/api/payment/webhook/token` |
| **2. Validation** | `POST` | `https://cur.ac.rw/payment_api/getstudent.php` | `https://cur.ac.rw/umis/api/payment/webhook/verify` |
| **3. Payment Notification** | `POST` | `https://cur.ac.rw/payment_api/callback.php` | `https://cur.ac.rw/umis/api/payment/webhook/callback` |
| **4. Payment Reversal** | `POST` | `https://cur.ac.rw/payment_api/cancel_transaction.php` | `https://cur.ac.rw/umis/api/payment/webhook/reversal` |
| **5. Callback / Redirect** | Browser redirect | — | `https://cur.ac.rw/umis/finance` |

---

## Authentication Flow Diagram

```
UrubutoPay                          CUR Server
─────────────────────────────────────────────────
1. POST /token.php
   { user_name, password }   ──►  Validate credentials
                              ◄──  { token: "Bearer eyJ..." }

2. POST /getstudent.php
   Authorization: Bearer eyJ...
   { payer_code, merchant_code } ──►  Look up student
                                  ◄──  { payer_names, services[] }

3. POST /callback.php
   Authorization: Bearer eyJ...
   { callback_type: "PAYMENT",
     transaction_code, amount,
     status: "SUCCESSFUL" }   ──►  Record payment
                                    Apply to invoices (waterfall)
                                    Update clearance
                              ◄──  { status: 200, message: "Payment recorded" }

4. POST /cancel_transaction.php   (if reversal needed)
   Authorization: Bearer eyJ...
   { transaction_code, amount }  ──►  Reverse payment
                                       Roll back invoices
                                       Recompute clearance
                                  ◄──  { status: 200, message: "Payment reversed" }
```

---

## Security Measures in Place

| Measure | Applied To | Description |
|---------|------------|-------------|
| Bearer token authentication | All endpoints except token issuance | Token validated against `api_authorization` table before any handler runs |
| Multi-hash password verification | Token issuance | Supports bcrypt, SHA-256, SHA-1, MD5, plain (in priority order) |
| Input validation | All endpoints | Required fields checked; empty or missing values return `400` |
| Merchant code verification | Validation URL | `merchant_code` must exist in `api_authorization.merchant_code` |
| Idempotency guard (payments) | Payment Notification | Duplicate `transaction_code` detected and rejected without re-recording |
| Idempotency guard (reversals) | Payment Reversal | Already-reversed transactions detected and rejected |
| SQL injection prevention | All DB queries | All queries use prepared statements with parameterised bindings |
| Invoice floor guard | Payment Reversal | `fee_invoices.amount_paid` can never go below `0` after reversal |
| Clearance recomputation | Notification + Reversal | `student_clearances` updated automatically on every payment and reversal |
| Audit logging | Notification + Reversal | Every payment and reversal logged to `system_logs` with actor, timestamp, and payload |
| Non-PAYMENT callback guard | Payment Notification | Non-`PAYMENT` types and non-`SUCCESSFUL` statuses acknowledged without ledger writes |

---

## Test Commands (cURL)

### 1 — Get token

```bash
curl -s -X POST https://cur.ac.rw/payment_api/token.php \
  -H "Content-Type: application/json" \
  -d '{"user_name":"bk_csgd","password":"YOUR_PASSWORD"}'
```

### 2 — Validate a student

```bash
TOKEN="Bearer eyJ..."   # from step 1

curl -s -X POST https://cur.ac.rw/payment_api/getstudent.php \
  -H "Content-Type: application/json" \
  -H "Authorization: $TOKEN" \
  -d '{"payer_code":"CUR/BBA/001/2022","merchant_code":"TH90989816"}'
```

### 3 — Send a payment notification

```bash
curl -s -X POST https://cur.ac.rw/payment_api/callback.php \
  -H "Content-Type: application/json" \
  -H "Authorization: $TOKEN" \
  -d '{
    "callback_type": "PAYMENT",
    "transaction_code": "TEST-TX-001",
    "payer_code": "CUR/BBA/001/2022",
    "amount": 450000,
    "currency": "RWF",
    "payment_date": "2026-05-16T10:00:00Z",
    "service_code": "tuition-fees-4679",
    "status": "SUCCESSFUL"
  }'
```

### 4 — Reverse a payment

```bash
curl -s -X POST https://cur.ac.rw/payment_api/cancel_transaction.php \
  -H "Content-Type: application/json" \
  -H "Authorization: $TOKEN" \
  -d '{"transaction_id":"TEST-TX-001","amount":450000}'
```

### 5 — Idempotency check (resend same transaction)

```bash
# Resend step 3 with the same transaction_code — must return 200 "Payment already recorded"
curl -s -X POST https://cur.ac.rw/payment_api/callback.php \
  -H "Content-Type: application/json" \
  -H "Authorization: $TOKEN" \
  -d '{
    "callback_type": "PAYMENT",
    "transaction_code": "TEST-TX-001",
    "payer_code": "CUR/BBA/001/2022",
    "amount": 450000,
    "currency": "RWF",
    "payment_date": "2026-05-16T10:00:00Z",
    "service_code": "tuition-fees-4679",
    "status": "SUCCESSFUL"
  }'
```

---

## Outstanding Item — `payment_reconciler.php`

One file still requires a manual permission fix before the auto-clearance and `year_name` bug-fix can be applied to the legacy callback path:

```
File:  payment_api/payment_reconciler.php
Owner: root  (read-only — cannot be written without sudo)
```

Run the following once in your terminal, then Claude Code will apply the pending changes automatically:

```bash
sudo chmod a+w /Applications/MAMP/htdocs/cur-mis/payment_api/payment_reconciler.php
```

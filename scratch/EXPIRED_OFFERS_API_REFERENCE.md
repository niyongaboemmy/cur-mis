# Admission Offers API Reference

## Overview
This document describes the API endpoints used for managing admission offers, particularly for handling expired offers.

---

## Endpoints

### 1. List All Offers
**GET** `/api/admin/admissions/offers`

List admission offers with optional filtering.

#### Parameters:
```
?status=pending|accepted|expired|declined
?department_id=123
?intake=SEPTEMBER_2025
?enrolled_only=1
?page=1
?per_page=15
```

#### Response:
```json
{
  "data": {
    "data": [
      {
        "id": 5,
        "application_id": 42,
        "offer_letter_reference": "OFF-2026-00005",
        "first_name": "John",
        "last_name": "Doe",
        "email": "john@email.com",
        "application_number": "APP-2025-001",
        "intake": "SEPTEMBER_2025",
        "department_id": 1,
        "department_name": "Computer Science",
        "offered_at": "2025-09-15 10:30:00",
        "expires_at": "2025-10-15",
        "status": "expired",
        "letter_sent_at": "2025-09-15 10:35:00",
        "enrollment_initiated": false,
        "student_id": null
      }
    ],
    "total": 120,
    "per_page": 15,
    "current_page": 1,
    "last_page": 8
  },
  "message": "Offers fetched successfully."
}
```

#### Example Calls:

Get all expired offers:
```bash
curl -X GET "http://localhost:8000/api/admin/admissions/offers?status=expired" \
  -H "Authorization: Bearer {token}"
```

Get pending offers for a department:
```bash
curl -X GET "http://localhost:8000/api/admin/admissions/offers?status=pending&department_id=1" \
  -H "Authorization: Bearer {token}"
```

---

### 2. Get Offer Details
**GET** `/api/admin/admissions/offers/{offer_id}`

Get detailed information about a specific offer.

#### Response:
```json
{
  "data": {
    "id": 5,
    "application_id": 42,
    "offer_letter_reference": "OFF-2026-00005",
    "offered_at": "2025-09-15 10:30:00",
    "offered_by": 1,
    "expires_at": "2025-10-15",
    "status": "expired",
    "responded_at": null,
    "response_notes": null,
    "enrollment_initiated": false,
    "student_id": null,
    "enrolled_at": null,
    "letter_sent_at": "2025-09-15 10:35:00",
    "letter_sent_by": 2,
    "letter_token": "abc123def456",
    "first_name": "John",
    "last_name": "Doe",
    "email": "john@email.com",
    "phone": "0798123456",
    "gender": "M",
    "birthdate": "1995-03-15",
    "nationality": "Rwandan",
    "application_number": "APP-2025-001",
    "application_status": "offered",
    "program_id": 1,
    "program_name": "Bachelor of Science in Computer Science",
    "department_name": "Computer Science",
    "level_id": 1,
    "level_name": "Level 1",
    "academic_year_id": 1
  },
  "message": "Offer details fetched."
}
```

---

### 3. Create Admission Offer
**POST** `/api/admin/admissions/offers`

Create a new admission offer for an application.

#### Request Body:
```json
{
  "application_id": 42,
  "expires_at": "2026-12-31"
}
```

#### Validation:
- `application_id`: Required, numeric
- `expires_at`: Required, format YYYY-MM-DD
- Application must have status "documents_verified"
- No active offer can exist for the application

#### Response (201 Created):
```json
{
  "data": {
    "id": 5,
    "offer_letter_reference": "OFF-2026-00005",
    "application_id": 42,
    "expires_at": "2026-12-31",
    "billing": {
      "invoice_id": 123,
      "amount": 50000,
      "status": "pending"
    }
  },
  "message": "Admission offer created successfully."
}
```

#### Error Responses:

**422 - Validation Error:**
```json
{
  "message": "Validation failed.",
  "errors": {
    "application_id": ["The application_id field is required."],
    "expires_at": ["The expires_at field is required."]
  }
}
```

**422 - Application Not Eligible:**
```json
{
  "message": "An offer can only be made for applications with 'documents_verified' status.",
  "status_code": 422
}
```

**409 - Offer Already Exists:**
```json
{
  "message": "An active offer already exists for this application.",
  "status_code": 409
}
```

---

### 4. Create Bulk Offers
**POST** `/api/admin/admissions/offers/bulk`

Create offers for multiple students at once.

#### Request Body:
```json
{
  "department_id": 1,
  "intake": "SEPTEMBER_2025",
  "academic_year_id": 1,
  "expires_at": "2026-12-31"
}
```

#### Response:
```json
{
  "data": {
    "created": 15
  },
  "message": "15 offer(s) created successfully."
}
```

---

### 5. Send Admission Letter
**POST** `/api/admin/admissions/offers/{offer_id}/send-letter`

Send the admission letter PDF to the student's email.

#### Response:
```json
{
  "data": {
    "letter_sent_at": "2025-09-15 10:35:00",
    "message": "Letter sent to john@email.com"
  },
  "message": "Admission letter sent successfully"
}
```

---

### 6. Initiate Enrollment
**POST** `/api/admin/admissions/offers/{offer_id}/enroll`

Move an accepted offer to enrollment (creates student record).

#### Response:
```json
{
  "data": {
    "student_id": 1234,
    "registration_number": "CUR/2025/001",
    "enrollment_initiated": true
  },
  "message": "Enrollment initiated successfully."
}
```

---

## Database Schema

### admission_offers table

```sql
CREATE TABLE `admission_offers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `application_id` int NOT NULL,
  `offer_letter_reference` varchar(50),
  `offered_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `offered_by` int,
  `expires_at` date NOT NULL,           -- ← KEY FIELD
  `status` enum('pending','accepted','declined','expired') DEFAULT 'pending',
  `responded_at` timestamp NULL,
  `response_notes` text,
  `enrollment_initiated` tinyint DEFAULT 0,
  `student_id` int,
  `enrolled_at` timestamp NULL,
  `letter_sent_at` timestamp NULL,
  `letter_sent_by` int,
  `letter_token` varchar(255),
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `application_id` (`application_id`),
  KEY `status` (`status`),
  KEY `expires_at` (`expires_at`),
  FOREIGN KEY (`application_id`) REFERENCES `student_applications`(`id`)
);
```

### Key Columns:
- **expires_at**: Date when the offer expires (YYYY-MM-DD format)
- **status**: Current status of the offer
  - `pending`: Not yet responded to
  - `accepted`: Student accepted the offer
  - `declined`: Student declined
  - `expired`: Past the expiration date
- **offered_at**: When the offer was created
- **responded_at**: When student responded

---

## Status Transition Flow

```
┌─────────┐
│ pending │──────────────┐
└────┬────┘              │
     │                   │ expires_at < TODAY
     │                   │ (auto status → expired)
     │ student accepts   │
     │                   ▼
     │              ┌─────────┐
     │              │ expired │
     │              └─────────┘
     │                   ▲
     │                   │ admin extends date
     │                   │ (status → pending)
     ▼                   │
┌──────────┐             │
│ accepted │─────────────┘
└────┬─────┘
     │ admin initiates enrollment
     ▼
  ┌───────────┐
  │ enrolled  │
  └───────────┘
     
OR

┌─────────┐
│ pending │
└────┬────┘
     │ student declines
     ▼
┌─────────┐
│ declined│
└─────────┘
```

---

## Automatic Expiration Check

Every time offers are listed, the system automatically updates any pending offers past their expiration date:

```sql
UPDATE `admission_offers` 
SET status = 'expired', updated_at = NOW()
WHERE expires_at < CURDATE() AND status = 'pending'
```

This happens in: `AdmissionController::listOffers()`

---

## Code References

### Frontend
- **Component:** `frontend/src/pages/admin/admissions/OffersPage.tsx`
- **Service:** `frontend/src/services/admissionService.ts`
- **Query Key:** `['admin', 'offers', status]`

### Backend
- **Controller:** `backend/app/Controllers/AdmissionController.php`
- **Model:** `backend/app/Models/AdmissionOfferModel.php`
- **Service:** `backend/app/Services/ApplicationService.php`
- **Routes:** `backend/routes/api/*.php`

### Admin Tool
- **File:** `backend/public/admin-extend-offer.php`
- **Method:** Direct PDO database queries (no model/service)
- **Access:** Web browser, no API token needed (session-based)

---

## Permission Requirements

To manage offers, users need:
- Permission: `PERMISSIONS.MANAGE_ADMISSIONS`
- This typically includes:
  - Create offers (bulk or individual)
  - Send offer letters
  - Initiate enrollment
  - View all offers

---

## Error Handling

### Common HTTP Status Codes

| Code | Meaning | Solution |
|------|---------|----------|
| 200 | Success | None needed |
| 201 | Created | Offer successfully created |
| 404 | Not found | Offer ID doesn't exist |
| 409 | Conflict | Active offer already exists |
| 422 | Validation error | Check request body format |
| 500 | Server error | Check server logs |

---

## Examples

### JavaScript/TypeScript

```typescript
import { offerService } from '@/services/admissionService'

// Get all expired offers
const offers = await offerService.list({ status: 'expired' })

// Get single offer details
const offer = await offerService.getDetails(5)

// Create new offer
await offerService.create({
  application_id: 42,
  expires_at: '2026-12-31'
})

// Send letter to student
await offerService.sendLetter(5)

// Initiate enrollment
await offerService.initiateEnrollment(5)
```

### PHP/cURL

```bash
# List expired offers
curl -X GET "http://localhost:8000/api/admin/admissions/offers?status=expired" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get offer details
curl -X GET "http://localhost:8000/api/admin/admissions/offers/5" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Create offer
curl -X POST "http://localhost:8000/api/admin/admissions/offers" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "application_id": 42,
    "expires_at": "2026-12-31"
  }'
```

---

## Performance Tips

1. **Pagination:** Always use `per_page` and `page` parameters
   ```
   ?page=1&per_page=50
   ```

2. **Filtering:** Use status filter to narrow results
   ```
   ?status=expired
   ```

3. **Bulk Operations:** Use bulk endpoints for multiple offers
   - `/api/admin/admissions/offers/bulk` - create many at once
   - `/api/admin/admissions/offers/bulk-send` - send many letters

4. **Caching:** Frontend uses React Query with cache invalidation
   - Cache key: `['admin', 'offers', status]`
   - Auto-invalidates after mutations

---

## Troubleshooting Guide

### Issue: "Offer not found" (404)
**Cause:** Offer ID doesn't exist
**Solution:** Verify offer ID is correct

### Issue: "An active offer already exists" (409)
**Cause:** Application already has a pending or accepted offer
**Solution:** Decline or expire existing offer first

### Issue: Status not updating
**Cause:** Browser cache
**Solution:** Clear cache: Ctrl+Shift+Delete

### Issue: Email not sent
**Cause:** Mail configuration issue
**Solution:** Check `.env` file MAIL_* settings

---

Last Updated: September 19, 2026

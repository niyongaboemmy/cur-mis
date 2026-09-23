-- Mark application payment as paid for APP-2026-00023 (36,000 RWF)
-- Reference: IMANIRADUKUNDA JEAN BOSCO
-- Amount: 36,000 RWF
-- Merchant Code: TR99899816

-- Update student_applications table to mark payment as completed
UPDATE student_applications
SET
    payment_status = 'paid',
    paid_at = NOW(),
    updated_at = NOW()
WHERE
    application_reference = 'APP-2026-00023'
    AND CAST(amount AS DECIMAL(10,2)) = 36000.00;

-- Log the payment update in application_status_log
INSERT INTO application_status_log (
    application_id,
    status,
    notes,
    updated_by,
    updated_at
)
SELECT
    id,
    'paid',
    'Payment verified: 36,000 RWF (Merchant: TR99899816)',
    1, -- System/Admin ID
    NOW()
FROM student_applications
WHERE
    application_reference = 'APP-2026-00023'
    AND CAST(amount AS DECIMAL(10,2)) = 36000.00;

-- Verify the update
SELECT
    id,
    application_reference,
    amount,
    payment_status,
    paid_at,
    updated_at
FROM student_applications
WHERE application_reference = 'APP-2026-00023';

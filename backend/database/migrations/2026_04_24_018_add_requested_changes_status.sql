-- Migration: 2026_04_24_018_add_requested_changes_status
-- Description: Add 'requested_changes' to student_applications.status enum

ALTER TABLE `student_applications` 
MODIFY COLUMN `status` ENUM(
    'draft',
    'submitted',
    'documents_under_review',
    'documents_verified',
    'documents_rejected',
    'requested_changes',
    'merit_listed',
    'offered',
    'offer_accepted',
    'offer_declined',
    'enrolled',
    'withdrawn'
) NOT NULL DEFAULT 'draft';

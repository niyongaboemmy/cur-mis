-- Backfill student.photo from applicant profiles
-- Sync photos for all enrolled students who don't yet have a photo
-- but whose corresponding application has an applicant profile photo

UPDATE `student` s
INNER JOIN `student_applications` sa ON sa.student_id = s.id
LEFT JOIN `applicant_profiles` ap ON ap.application_id = sa.id
LEFT JOIN `users` u ON u.id = ap.user_id
SET s.photo = COALESCE(ap.profile_photo_id, u.photo),
    s.updated_at = NOW()
WHERE sa.status = 'enrolled'
AND (s.photo IS NULL OR s.photo = '')
AND COALESCE(ap.profile_photo_id, u.photo) IS NOT NULL
AND COALESCE(ap.profile_photo_id, u.photo) != '';

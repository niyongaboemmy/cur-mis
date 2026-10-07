-- Backfill student.photo from applicant profiles
UPDATE `student` s
INNER JOIN `student_applications` sa ON sa.student_id = s.id
LEFT JOIN `applicant_profiles` ap ON ap.application_id = sa.id
LEFT JOIN `users` u ON u.id = ap.user_id
SET s.photo = COALESCE(ap.profile_photo_id, u.photo)
WHERE sa.status = 'enrolled'
AND (s.photo IS NULL OR s.photo = '')
AND COALESCE(ap.profile_photo_id, u.photo) IS NOT NULL
AND COALESCE(ap.profile_photo_id, u.photo) != '';

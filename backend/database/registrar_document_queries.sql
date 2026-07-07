-- ════════════════════════════════════════════════════════════════════════════════
-- REGISTRAR DOCUMENT GENERATION QUERIES
-- ════════════════════════════════════════════════════════════════════════════════
--
-- These SQL queries help the Registrar generate various academic documents and reports.
-- Includes: student transcripts, certificates, clearance reports, graduand lists, etc.
--
-- ════════════════════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. ACADEMIC TRANSCRIPTS - Generate transcripts for a specific student
-- ══════════════════════════════════════════════════════════════════════════════

-- Query: Get student academic history for transcript
SELECT
    s.id,
    s.regnumber,
    s.fname,
    s.lname,
    s.email,
    d.name AS department,
    opt.title AS program_option,
    lv.label AS current_level,
    ay.label AS academic_year,
    at.name AS term,
    m.code,
    m.name AS module_name,
    mmr.marks,
    mmr.grade,
    mmr.gpa,
    mmr.status
FROM student s
LEFT JOIN departments d ON s.department_id = d.id
LEFT JOIN options opt ON s.option_id = opt.id
LEFT JOIN levels lv ON s.current_level = lv.id
LEFT JOIN module_mark_records mmr ON s.id = mmr.student_id
LEFT JOIN modules m ON mmr.module_id = m.id
LEFT JOIN academic_years ay ON mmr.academic_year_id = ay.id
LEFT JOIN academic_terms at ON mmr.academic_term_id = at.id
WHERE s.id = ? -- Replace with student_id
ORDER BY ay.id DESC, at.id DESC, m.code ASC;

-- Insert generated transcript record
INSERT INTO transcripts (student_id, generated_by, purpose, is_official, verification_code, file_path)
VALUES (?, ?, ?, 1, UUID(), CONCAT('/transcripts/', ?, '_', NOW(), '.pdf'));


-- ══════════════════════════════════════════════════════════════════════════════
-- 2. STUDENT CLEARANCE REPORT - View clearance status by office
-- ══════════════════════════════════════════════════════════════════════════════

SELECT
    sc.id,
    s.regnumber,
    s.fname,
    s.lname,
    ay.label AS academic_year,
    at.name AS academic_term,
    sc.office_type,
    sc.status,
    u.full_name AS cleared_by,
    sc.cleared_at,
    sc.rejection_reason,
    sc.created_at
FROM student_clearances sc
LEFT JOIN student s ON sc.student_id = s.id
LEFT JOIN academic_years ay ON sc.academic_year_id = ay.id
LEFT JOIN academic_terms at ON sc.academic_term_id = at.id
LEFT JOIN users u ON sc.cleared_by = u.id
WHERE s.id = ? -- Replace with student_id
  AND ay.id = ? -- Replace with academic_year_id
  AND at.id = ? -- Replace with academic_term_id
ORDER BY sc.office_type, sc.created_at DESC;


-- ══════════════════════════════════════════════════════════════════════════════
-- 3. GRADUAND LIST - Generate list of graduating students
-- ══════════════════════════════════════════════════════════════════════════════

SELECT
    g.id,
    s.id AS student_id,
    s.regnumber,
    s.fname,
    s.lname,
    s.email,
    d.name AS department,
    opt.title AS program_option,
    ay.label AS graduation_year,
    g.honours,
    g.merit_status,
    COUNT(DISTINCT mmr.module_id) AS total_modules_completed,
    ROUND(AVG(CAST(mmr.gpa AS DECIMAL(4,2))), 2) AS cumulative_gpa,
    g.created_at
FROM graduands g
LEFT JOIN student s ON g.student_id = s.id
LEFT JOIN departments d ON s.department_id = d.id
LEFT JOIN options opt ON s.option_id = opt.id
LEFT JOIN academic_years ay ON g.academic_year_id = ay.id
LEFT JOIN module_mark_records mmr ON s.id = mmr.student_id
WHERE ay.id = ? -- Replace with academic_year_id
GROUP BY g.id, s.id, s.regnumber, s.fname, s.lname, d.id, opt.id, ay.id
ORDER BY d.name, s.lname, s.fname;


-- ══════════════════════════════════════════════════════════════════════════════
-- 4. STUDENT ID CARDS - Generate/reissue student identification
-- ══════════════════════════════════════════════════════════════════════════════

SELECT
    sid.id,
    s.id AS student_id,
    s.regnumber,
    s.fname,
    s.lname,
    s.email,
    s.phone,
    d.name AS department,
    lv.label AS level,
    sid.id_number,
    sid.issue_date,
    sid.expiry_date,
    sid.status,
    u.full_name AS issued_by,
    sid.file_path,
    sid.created_at
FROM student_ids sid
LEFT JOIN student s ON sid.student_id = s.id
LEFT JOIN departments d ON s.department_id = d.id
LEFT JOIN levels lv ON s.current_level = lv.id
LEFT JOIN users u ON sid.created_by = u.id
WHERE s.id = ? -- Replace with student_id
ORDER BY sid.issue_date DESC;


-- ══════════════════════════════════════════════════════════════════════════════
-- 5. ADMISSION OFFERS/DECISIONS - Generate list of admitted students
-- ══════════════════════════════════════════════════════════════════════════════

SELECT
    sa.id,
    ap.regnumber,
    ap.fname,
    ap.lname,
    ap.email,
    d.name AS department,
    opt.title AS program_option,
    i.intake_name,
    sa.offer_status,
    sa.acceptance_status,
    sa.admission_number,
    sa.admission_date,
    sa.verified_by_name,
    sa.created_at
FROM student_applications sa
LEFT JOIN applicant_profiles ap ON sa.applicant_profile_id = ap.id
LEFT JOIN departments d ON sa.department_id = d.id
LEFT JOIN options opt ON sa.option_id = opt.id
LEFT JOIN intakes i ON sa.intake_id = i.id
WHERE sa.offer_status = 'offered' -- Filter by admission status
  AND i.id = ? -- Replace with intake_id
ORDER BY d.name, ap.lname, ap.fname;


-- ══════════════════════════════════════════════════════════════════════════════
-- 6. TRANSCRIPT REQUESTS - Get pending transcript requests for processing
-- ══════════════════════════════════════════════════════════════════════════════

SELECT
    tr.id,
    s.regnumber,
    s.fname,
    s.lname,
    s.email,
    d.name AS department,
    opt.title AS program,
    ay.label AS academic_year,
    tr.request_type,
    tr.purpose,
    tr.copies,
    tr.status,
    tr.fee_paid,
    tr.created_at,
    u.full_name AS reviewed_by,
    tr.reviewed_at
FROM transcript_requests tr
LEFT JOIN student s ON tr.student_id = s.id
LEFT JOIN departments d ON s.department_id = d.id
LEFT JOIN options opt ON s.option_id = opt.id
LEFT JOIN academic_years ay ON tr.academic_year_id = ay.id
LEFT JOIN users u ON tr.reviewed_by = u.id
WHERE tr.status = 'approved' -- Filter by status
ORDER BY tr.created_at ASC;


-- ══════════════════════════════════════════════════════════════════════════════
-- 7. ENROLLMENT STATISTICS - Summary report for academic year/term
-- ══════════════════════════════════════════════════════════════════════════════

SELECT
    d.name AS department,
    opt.title AS program,
    lv.label AS level,
    COUNT(DISTINCT s.id) AS total_enrolled,
    COUNT(DISTINCT CASE WHEN s.active = 1 THEN s.id END) AS active_students,
    COUNT(DISTINCT CASE WHEN s.active = 0 THEN s.id END) AS inactive_students,
    ay.label AS academic_year,
    at.name AS term,
    COUNT(DISTINCT mr.id) AS module_registrations
FROM student s
LEFT JOIN departments d ON s.department_id = d.id
LEFT JOIN options opt ON s.option_id = opt.id
LEFT JOIN levels lv ON s.current_level = lv.id
LEFT JOIN academic_years ay ON 1=1
LEFT JOIN academic_terms at ON 1=1
LEFT JOIN module_registrations mr ON s.id = mr.student_id
  AND mr.academic_year_id = ay.id
  AND mr.academic_term_id = at.id
WHERE ay.id = ? -- Replace with academic_year_id
  AND at.id = ? -- Replace with academic_term_id
GROUP BY d.id, opt.id, lv.id, ay.id, at.id
ORDER BY d.name, opt.title, lv.label;


-- ══════════════════════════════════════════════════════════════════════════════
-- 8. FINANCIAL CLEARANCE STATUS - Students cleared/not cleared for graduation
-- ══════════════════════════════════════════════════════════════════════════════

SELECT
    s.regnumber,
    s.fname,
    s.lname,
    d.name AS department,
    opt.title AS program,
    ay.label AS academic_year,
    CASE
        WHEN fc.balance_amount <= 0 THEN 'Cleared'
        ELSE 'Outstanding'
    END AS financial_status,
    fc.balance_amount,
    fc.total_fees,
    fc.total_paid,
    fc.cleared_at,
    u.full_name AS cleared_by
FROM student s
LEFT JOIN departments d ON s.department_id = d.id
LEFT JOIN options opt ON s.option_id = opt.id
LEFT JOIN financial_clearance fc ON s.regnumber = fc.student_id
LEFT JOIN academic_years ay ON fc.academic_year_id = ay.id
LEFT JOIN users u ON fc.cleared_by = u.id
WHERE ay.id = ? -- Replace with academic_year_id
ORDER BY financial_status DESC, d.name, s.lname, s.fname;


-- ══════════════════════════════════════════════════════════════════════════════
-- 9. CERTIFICATE GENERATION - Track issued academic certificates
-- ══════════════════════════════════════════════════════════════════════════════

SELECT
    ac.id,
    s.regnumber,
    s.fname,
    s.lname,
    d.name AS department,
    opt.title AS program,
    ac.certificate_type,
    ac.classification,
    ay.label AS award_year,
    ac.issue_date,
    ac.serial_number,
    ac.status,
    u.full_name AS issued_by,
    ac.created_at
FROM academic_certificates ac
LEFT JOIN student s ON ac.student_id = s.id
LEFT JOIN departments d ON s.department_id = d.id
LEFT JOIN options opt ON s.option_id = opt.id
LEFT JOIN academic_years ay ON ac.academic_year_id = ay.id
LEFT JOIN users u ON ac.issued_by = u.id
WHERE ay.id = ? -- Replace with academic_year_id
ORDER BY ac.issue_date DESC;


-- ══════════════════════════════════════════════════════════════════════════════
-- 10. STUDENT PERFORMANCE REPORT - Academic performance by student/level
-- ══════════════════════════════════════════════════════════════════════════════

SELECT
    s.regnumber,
    s.fname,
    s.lname,
    d.name AS department,
    opt.title AS program,
    lv.label AS level,
    ay.label AS academic_year,
    at.name AS term,
    COUNT(DISTINCT mmr.module_id) AS modules_taken,
    COUNT(DISTINCT CASE WHEN mmr.status = 'passed' THEN mmr.module_id END) AS passed,
    COUNT(DISTINCT CASE WHEN mmr.status = 'failed' THEN mmr.module_id END) AS failed,
    ROUND(AVG(CAST(mmr.gpa AS DECIMAL(4,2))), 2) AS term_gpa,
    ROUND(AVG(CAST(mmr.marks AS DECIMAL(5,2))), 2) AS average_marks
FROM student s
LEFT JOIN departments d ON s.department_id = d.id
LEFT JOIN options opt ON s.option_id = opt.id
LEFT JOIN levels lv ON s.current_level = lv.id
LEFT JOIN module_mark_records mmr ON s.id = mmr.student_id
LEFT JOIN academic_years ay ON mmr.academic_year_id = ay.id
LEFT JOIN academic_terms at ON mmr.academic_term_id = at.id
WHERE s.active = 1
  AND ay.id = ? -- Replace with academic_year_id
  AND at.id = ? -- Replace with academic_term_id
GROUP BY s.id, d.id, opt.id, lv.id, ay.id, at.id
ORDER BY d.name, lv.label, s.lname, s.fname;


-- ══════════════════════════════════════════════════════════════════════════════
-- 11. BATCH DOCUMENT GENERATION - Export multiple student records
-- ══════════════════════════════════════════════════════════════════════════════

-- Get all students in a department for batch transcript generation
SELECT
    s.id,
    s.regnumber,
    s.fname,
    s.lname,
    s.email,
    d.name AS department,
    opt.title AS program,
    lv.label AS level,
    COUNT(DISTINCT mmr.module_id) AS total_modules,
    ROUND(AVG(CAST(mmr.gpa AS DECIMAL(4,2))), 2) AS overall_gpa
FROM student s
LEFT JOIN departments d ON s.department_id = d.id
LEFT JOIN options opt ON s.option_id = opt.id
LEFT JOIN levels lv ON s.current_level = lv.id
LEFT JOIN module_mark_records mmr ON s.id = mmr.student_id
WHERE d.id = ? -- Replace with department_id
  AND s.active = 1
GROUP BY s.id
ORDER BY lv.label DESC, s.lname, s.fname;


-- ══════════════════════════════════════════════════════════════════════════════
-- 12. DOCUMENT AUDIT LOG - Track generated documents
-- ══════════════════════════════════════════════════════════════════════════════

SELECT
    t.id,
    s.regnumber,
    s.fname,
    s.lname,
    'Transcript' AS document_type,
    t.is_official,
    t.purpose,
    t.verification_code,
    u.full_name AS generated_by,
    t.generated_at,
    t.file_path
FROM transcripts t
LEFT JOIN student s ON t.student_id = s.id
LEFT JOIN users u ON t.generated_by = u.id
WHERE t.generated_at >= ? -- Replace with date_from
  AND t.generated_at <= ? -- Replace with date_to
UNION ALL
SELECT
    ac.id,
    s.regnumber,
    s.fname,
    s.lname,
    'Certificate' AS document_type,
    1 AS is_official,
    ac.certificate_type,
    ac.serial_number,
    u.full_name AS generated_by,
    ac.issue_date,
    NULL
FROM academic_certificates ac
LEFT JOIN student s ON ac.student_id = s.id
LEFT JOIN users u ON ac.issued_by = u.id
WHERE ac.issue_date >= ? -- Replace with date_from
  AND ac.issue_date <= ? -- Replace with date_to
ORDER BY generated_at DESC;


-- ══════════════════════════════════════════════════════════════════════════════
-- USAGE NOTES
-- ══════════════════════════════════════════════════════════════════════════════
--
-- 1. Replace ? placeholders with actual values:
--    - ? for student_id, academic_year_id, department_id, etc.
--    - 'YYYY-MM-DD' format for dates
--
-- 2. These queries assume the following permissions:
--    - MANAGE_STUDENT_IDS (for student ID cards)
--    - MANAGE_ACADEMICS (for academic records)
--    - MANAGE_CLEARANCE (for clearance reports)
--    - VIEW_FINANCE (for financial clearance)
--    - MANAGE_EXAMS (for certificates)
--
-- 3. To integrate with PHP application:
--    - Use parameterized queries to prevent SQL injection
--    - Add proper error handling
--    - Implement PDF generation using TranscriptPdf helper
--    - Log all document generations in system_logs table
--
-- 4. For Excel/CSV export:
--    - SELECT INTO OUTFILE for batch exports
--    - Ensure proper file permissions on server
--    - Clean up old exports regularly
--
-- ════════════════════════════════════════════════════════════════════════════════

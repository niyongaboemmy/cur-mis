# HANDOFF

## Current Task
Nothing in flight. Three tasks finished and pushed to `Levi` this session — the
Students filters + Excel export, the document-type "Validation failed." bug, and
the student status picker.

## Branch rule
**Never push to `main`.** Push to `Levi`, always — the user was explicit about
this. Restore points are tagged before each change and pushed:
`backup/pre-doctype-fix-20260819` (→ `0978b3d`) and
`backup/pre-status-options-20260819` (→ `18dee8a`).

## Status
**All solved.**

| Commit | What |
|---|---|
| `0978b3d` | Students filters finished + real `.xlsx` export |
| `18dee8a` | Document type "Validation failed." fixed |
| `c7f7e0d` | Graduand / Rejected / Dropped out statuses + silent-rewrite fix |

### `18dee8a` — document type "Validation failed."
Slug `Health_insurence` failed `regex:/^[a-z_]+$/` on the capital **H**, and the
toast showed only the generic message, so nothing said which field was wrong.
The same rule also rejected digits (`a2_certificate`), hyphens
(`o-level-result`) and a pasted trailing space. `create()`/`update()` now
normalise the slug (lowercase, trim, tidy separators) before validating against
`^[a-z0-9_-]+$`, share one rule set, and the page derives the slug from the
name, sanitises as typed, and surfaces the per-field `errors`. **No migration —
validation only.** The test row was deleted; `document_types` is back to 9 rows.

### `c7f7e0d` — student status picker
Edit Student Details offered only Active/Inactive/Graduated/Suspended. Now
Active, Inactive, Graduated, **Graduand**, Suspended, **Rejected**, **Dropped
out**, Dismissed — driven by one `STUDENT_STATES` list shared with the Programme
section (the two had drifted). `graduands` is stored plural to match the 4
existing rows; the label is singular.

Found and fixed a **silent status rewrite**: `student_state` is free text and
holds `Active` (133), `ACTIVE` (29), `Graduates` (1), `resume` (2), `xxx` (2). A
`<select>` whose value matches no option falls back to its *first* option, so all
167 displayed as Active and saving wrote that back — a real state change for the
`Graduates` student. Both forms now seed through `normaliseStudentState()`; the
two unknown `xxx` rows are preserved and shown as "(current)".
**No migration — `student_state` is varchar(40), already in the update
whitelist.**

## Progress
- [x] Faculty, Department, Option (Education-only), Age, Country, Province,
      District, Sector, Status, Academic year — plus the pre-existing Level,
      Gender, Nationality, Learning mode, Campus (commit `b8a5955`)
- [x] Status had **two** controls fighting over `student_state`
- [x] Option filter silently discarded every other filter
- [x] Real Excel (`.xlsx`) download, per filter, replacing CSV-only
- [ ] Nothing outstanding

## Working Notes

### What was wrong when this session picked the task up

**1 · Two controls owned `student_state`.** A legacy 3-option `<select>`
(Active / Inactive / All) sat next to the new Status picker; both wrote the same
URL param. Choosing "Graduated" in Status left the legacy select with a value
matching none of its `<option>`s, so it rendered **blank**. Worse, the Status
picker's own "All statuses" entry was unreachable: `update({student_state: v ||
"active"})` turned the cleared value straight back into Active, so the only way
to see all statuses was the legacy select that had just gone blank.
Fixed by deleting the legacy select and making Status the sole owner. "All" is
carried as the explicit value `"all"` (an *absent* `student_state` means Active
on this page) and mapped back to `""` for display so the picker highlights it.

**2 · Option was an exclusive filter.** Picking one sent *only* `std_option`,
dropping the nine other filters the user had set — and the export inherited it,
so "Education option X, graduated" exported every X student regardless of
status. The original reason (an auto-derived department could AND with
`std_option` and zero the result) no longer holds: department is now picked by
hand and the Option list is scoped to it. Measured across the Education options,
**99.4%** of students matched by an option also carry that option's department,
so the pair agrees. Option now composes like every other filter.

### Excel export — why the format changed
CSV is lossy for this dataset in a way that matters. Opened in Excel it
type-guesses per column and rewrites the identifiers a registry submission is
keyed on. Against the live table:

| Column | Rows affected | What Excel does to the CSV |
|---|---|---|
| `phone` (leading `0`) | 11,000 | `0786891397` → `786891397` |
| `id_card` (16 digits) | 18,012 | `1199580062508028` → `1.19958E+15`, digits gone for good |

Both sit in the **HLIs → MIFOTRA** system template. New
`App\Helpers\StreamingXlsx` writes every cell as an inline string, which Excel
never re-interprets — verified byte-for-byte on student `1CUR19AK05764`.

**Why not PhpSpreadsheet** (already a dependency, used by `BudgetPlanExcel`):
benchmarked on the full export (24,905 × 28 = 697,340 cells) it peaked at
**468 MB / 84 s** — past the memory_limit and max_execution_time of the cPanel
hosts this deploys to. `StreamingXlsx` does the same job at **2 MB / 4.7 s** by
streaming the sheet XML to a temp file and letting ZipArchive compress from
disk. It stays the wrong tool for the styled budget workbooks; it is the right
one for a bulk dump.

API: `GET /api/students/export?format=xlsx` (CSV remains the default for any
other value, so existing links keep working). The modal has an Excel / CSV
toggle, defaulting to Excel.

### Verification performed
Driven through the real controller against the live `curac_save` database
(`scratchpad/matrix.sh`) — list total vs exported row count, 25/25 exact:

- statuses: active 9,014 · inactive 10,426 · graduated 5,445 · graduands 4 ·
  suspended 14 · rejected 0
- faculty 6 (Education) 7,728 · faculty 8 5,011 · department 15 2,381 ·
  option 62 (PGDE) 1,104 · option 12 (MCS) 892
- Rwanda 19,177 · SOUTHERN 5,834 · Huye 2,385 · TUMBA 650
- age 18–25 4,943 · age 26–40 4,946 · 2025-2026 8,601 · 2021-2022 15,754
- combinations: Education+graduated 781 · SOUTHERN+Huye+active 1,429 ·
  **PGDE+graduated 328** (proves Option now composes) · PGDE+dept13+2021-2022 974 ·
  Education+Rwanda+age20-30 3,225

Full 24,905 × 44 export: 5.4 s, 14 MB peak, 3.8 MB file; ZIP integrity, all six
parts present, every XML part well-formed, 24,906 rows / 739,443 cells.
`tsc --noEmit` clean, production build succeeds, existing 57 vitest tests pass.

### Not fixed — reported, out of scope
1. **The 7 "Academic Progress" export columns are slow.** Selecting them for the
   whole cohort takes **67 s** (vs 5.4 s without) — they are correlated
   sub-queries over `module_marks` run per student. Pre-existing and identical
   in CSV, but it will hit a gateway timeout on shared hosting. Fix would be to
   join once and aggregate rather than sub-query per row.
2. **Status "Rejected" returns 0** — no student row holds that state. The option
   is kept because the registry asked for it; it is not a bug.
3. `student_state` holds 2 rows spelled `xxx`, matched by no status filter.
4. Browser verification could not be done — the Chrome extension has no site
   permission for the local dev server, so the filter bar was checked by
   typecheck, build and backend parity rather than visually. Worth a quick
   look-over on the Students page.
5. Carried over and still open from the previous batch: local `curac_save` has
   no PRIMARY KEYs / AUTO_INCREMENT on several tables; `fee_invoices.created_by`
   is NOT NULL while `FinesController::createFine()` may pass null; HR "Add
   Staff" creates no `users` row so those staff cannot log in.

## Recently Completed
- Student status picker: Graduand / Rejected / Dropped out + silent-rewrite fix.
- Document types: "Validation failed." on create/edit (slug rule was too strict).
- Students page: full filter set + Excel export.
- Fixed all 9 issues from `FIX.pdf` (student portal QA report).
- Profile-picture removal endpoints; staff-email persistence fixes on create/edit.

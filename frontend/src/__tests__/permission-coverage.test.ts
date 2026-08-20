import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every permission slug must have a home on both sides of the wire.
 *
 * The recurring RBAC defect in this codebase has one shape: a slug is in the
 * catalogue, an administrator grants it on the Roles screen, and nothing in
 * the app agrees with it — either no endpoint enforces it, or no nav entry,
 * route guard or component gate ever asks for it. The holder sees a permission
 * that grants nothing.
 *
 * That is mechanically checkable, so this test checks it. A slug that
 * legitimately gates an action rather than a screen (a button, a queue filter,
 * a server-side capability) belongs in ACTION_ONLY below, with a note saying
 * where it is enforced — the point is that every exemption is deliberate.
 */

const SRC = resolve(__dirname, '..')
const BACKEND = resolve(__dirname, '../../../backend')

/* ── the catalogue ──────────────────────────────────────────────────────── */

const PERMISSIONS_PHP = join(BACKEND, 'app/Constants/Permissions.php')

function catalogue(): string[] {
  const php = readFileSync(PERMISSIONS_PHP, 'utf8')
  const slugs = [...php.matchAll(/public const [A-Z0-9_]+\s*=\s*'([A-Z0-9_]+)';/g)].map((m) => m[1])
  return [...new Set(slugs)]
}

/* ── file walking ───────────────────────────────────────────────────────── */

function walk(dir: string, exts: string[]): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full, exts))
    else if (exts.some((e) => name.endsWith(e))) out.push(full)
  }
  return out
}

function readAll(files: string[]): string {
  return files.map((f) => readFileSync(f, 'utf8')).join('\n')
}

/* ── exemptions ─────────────────────────────────────────────────────────── */

/**
 * Slugs that gate an action or a server-side capability rather than a
 * navigable screen. Each entry names where it is enforced so the exemption can
 * be re-checked when that code moves.
 */
const ACTION_ONLY = new Set<string>([
  // Leave approval stages — surfaced through the LEAVE_STAGE_PERMISSIONS
  // spread in constants/permissions.ts, which this test cannot see by name.
  'APPROVE_LEAVE_VC',
  'APPROVE_LEAVE_HR',
  'APPROVE_LEAVE_DAF',
  'APPROVE_LEAVE_L1',
  'APPROVE_LEAVE_L2',
  'APPROVE_LEAVE_FINAL',
  // Service request stages — same pattern, driven by the stage chain.
  'APPROVE_SERVICE_REQUEST_L1',
  'APPROVE_SERVICE_REQUEST_L2',
  'APPROVE_SERVICE_REQUEST_FINAL',
  'VOID_SERVICE_REQUEST',
  // Enforced inside a page rather than gating one: the mark-sheet confirm /
  // re-open control on ModulesMarksPage and DeliberationMarksView.
  'CONFIRM_MODULE_MARKS',
])

/**
 * Slugs no backend route or controller enforces, held open pending a product
 * decision. Each is a bug until the decision lands — either wire it up or drop
 * the slug — so the list must only ever shrink.
 */
const UNENFORCED_PENDING_DECISION = new Set<string>([
  // The applicant portal is gated by ApplicantMiddleware on the role, not on
  // this slug. Decide whether the middleware should check it instead.
  'ACCESS_APPLICANT_PORTAL',
])

/* ── the checks ─────────────────────────────────────────────────────────── */

describe('permission coverage', () => {
  const slugs = catalogue()

  const backendSources = readAll(walk(join(BACKEND, 'routes'), ['.php']))
  const backendApp = readAll(walk(join(BACKEND, 'app'), ['.php']).filter((f) => !f.endsWith('Permissions.php')))
  const frontendSources = readAll(walk(SRC, ['.ts', '.tsx']).filter((f) => !f.includes('constants/permissions.ts')))

  it('reads a non-empty catalogue', () => {
    expect(slugs.length).toBeGreaterThan(100)
  })

  it('every slug is enforced somewhere on the backend', () => {
    const orphans = slugs.filter(
      (s) => !UNENFORCED_PENDING_DECISION.has(s)
          && !new RegExp(`Permissions::${s}\\b`).test(backendSources)
          && !new RegExp(`Permissions::${s}\\b`).test(backendApp)
          && !new RegExp(`'${s}'`).test(backendApp),
    )
    expect(orphans, `slugs no endpoint or controller checks: ${orphans.join(', ')}`).toEqual([])
  })

  it('every slug reaches the UI — a nav entry, route guard or component gate', () => {
    const orphans = slugs.filter(
      (s) => !ACTION_ONLY.has(s) && !new RegExp(`PERMISSIONS\\.${s}\\b`).test(frontendSources),
    )
    expect(
      orphans,
      `slugs that can be granted but unlock nothing in the app: ${orphans.join(', ')}. `
        + 'Add a nav entry / route guard, or list the slug in ACTION_ONLY with a note on where it is enforced.',
    ).toEqual([])
  })

  it('every exemption is still a real slug', () => {
    const stale = [...ACTION_ONLY, ...UNENFORCED_PENDING_DECISION].filter((s) => !slugs.includes(s))
    expect(stale, `ACTION_ONLY names slugs that no longer exist: ${stale.join(', ')}`).toEqual([])
  })
})

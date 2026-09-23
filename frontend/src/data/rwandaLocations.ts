/**
 * Rwanda administrative divisions.
 *
 * The hierarchy is Province → District → Sector → Cell → Village.
 *
 * Provinces (5) and districts (30) are bundled here because they are small,
 * stable, and authoritative. The lower three levels (416 sectors, 2,148 cells,
 * ~14,837 villages) are NOT bundled: shipping a partial or approximated list
 * would be worse than free text, because a dropdown that lacks a user's real
 * sector actively prevents them from entering the truth.
 *
 * To enable the lower levels, populate `SECTORS`, `CELLS` and `VILLAGES` from
 * the official Rwanda Governance Board / NISR dataset. Every consumer reads
 * through the lookup helpers below, so filling these maps is the only change
 * needed — LocationSelect switches a level from free text to a dropdown
 * automatically as soon as options exist for it.
 *
 *   SECTORS['Gasabo']            = ['Bumbogo', 'Gatsata', …]
 *   CELLS['Gasabo|Remera']       = ['Nyabisindu', 'Rukiri I', …]
 *   VILLAGES['Gasabo|Remera|Rukiri I'] = ['Amajyambere', …]
 */

export const PROVINCES = [
  'Kigali City',
  'Northern',
  'Southern',
  'Eastern',
  'Western',
] as const

export type Province = (typeof PROVINCES)[number]

/** The 30 districts, keyed by province. */
export const DISTRICTS: Record<Province, string[]> = {
  'Kigali City': ['Gasabo', 'Kicukiro', 'Nyarugenge'],
  Northern: ['Burera', 'Gakenke', 'Gicumbi', 'Musanze', 'Rulindo'],
  Southern: [
    'Gisagara',
    'Huye',
    'Kamonyi',
    'Muhanga',
    'Nyamagabe',
    'Nyanza',
    'Nyaruguru',
    'Ruhango',
  ],
  Eastern: [
    'Bugesera',
    'Gatsibo',
    'Kayonza',
    'Kirehe',
    'Ngoma',
    'Nyagatare',
    'Rwamagana',
  ],
  Western: [
    'Karongi',
    'Ngororero',
    'Nyabihu',
    'Nyamasheke',
    'Rubavu',
    'Rusizi',
    'Rutsiro',
  ],
}

/**
 * Sectors keyed by district name.
 * Empty until the official dataset is loaded — see the file header.
 */
export const SECTORS: Record<string, string[]> = {}

/** Cells keyed by `${district}|${sector}`. Empty until the dataset is loaded. */
export const CELLS: Record<string, string[]> = {}

/** Villages keyed by `${district}|${sector}|${cell}`. Empty until loaded. */
export const VILLAGES: Record<string, string[]> = {}

/* ────────────────────────────────────────────────────────────────────
 * Lookups — every consumer goes through these, never the raw maps.
 * Each returns [] when the level has no bundled data, which callers
 * treat as "fall back to free text".
 * ──────────────────────────────────────────────────────────────────── */

export function isProvince(value: string | null | undefined): value is Province {
  return !!value && (PROVINCES as readonly string[]).includes(value)
}

export function districtsOf(province: string | null | undefined): string[] {
  return isProvince(province) ? DISTRICTS[province] : []
}

export function sectorsOf(district: string | null | undefined): string[] {
  return district ? (SECTORS[district] ?? []) : []
}

export function cellsOf(
  district: string | null | undefined,
  sector: string | null | undefined,
): string[] {
  return district && sector ? (CELLS[`${district}|${sector}`] ?? []) : []
}

export function villagesOf(
  district: string | null | undefined,
  sector: string | null | undefined,
  cell: string | null | undefined,
): string[] {
  return district && sector && cell
    ? (VILLAGES[`${district}|${sector}|${cell}`] ?? [])
    : []
}

/** Every district, flattened — used for validation and standalone pickers. */
export const ALL_DISTRICTS: string[] = Object.values(DISTRICTS).flat().sort()

/** The province a district belongs to, or null if the name is unknown. */
export function provinceOfDistrict(district: string | null | undefined): Province | null {
  if (!district) return null
  for (const p of PROVINCES) {
    if (DISTRICTS[p].includes(district)) return p
  }
  return null
}

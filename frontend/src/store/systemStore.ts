import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SystemBasics, AcademicYear, AcademicTerm } from '@/types/academic'

interface SystemState {
  basics:     SystemBasics | null
  loading:    boolean
  error:      string | null
  loadedAt:   number | null

  /**
   * Globally-selected academic year label (e.g. "2026-2027") — driven by the
   * selector in the topnav. Empty string means "All years".
   * Initialized from the active year once /system/basics resolves.
   */
  selectedYearLabel: string
  /**
   * Id of the globally-selected academic year (mirrors `selectedYearLabel`).
   * Persisted and kept in sync so the request interceptor can attach the
   * `X-Academic-Year-Id` header before `/system/basics` has resolved on a
   * reload. `null` = "All years".
   */
  selectedYearId: number | null
  /**
   * True once we've seeded `selectedYearLabel` from the active year in this
   * browser session. Not persisted — a fresh load re-seeds from whatever the
   * server now reports as active (unless the user has pinned a choice).
   */
  selectedYearInitialized: boolean
  /**
   * True when the user explicitly picked a year/term from the topnav switcher.
   * Persisted, so a deliberately-switched context survives a reload; cleared
   * by `resetToActive`. While false, every /system/basics load re-seeds the
   * selection from the DB active year/term.
   */
  academicContextPinned: boolean

  setBasics: (b: SystemBasics) => void
  setLoading: (l: boolean) => void
  setError:  (e: string | null) => void
  setSelectedYearLabel: (label: string, id?: number | null) => void
  /**
   * Globally-selected academic term ID (e.g. 1 for Sem 1).
   * 0 or null means "All terms".
   */
  selectedTermId: number | null
  setSelectedTermId: (id: number | null) => void
  /** Snap the global context back to the DB active year + term. */
  resetToActive: () => void
  clear:     () => void
}

const activeYearLabel = (b: SystemBasics | null): string =>
  b?.active_year && typeof b.active_year === 'object'
    ? (b.active_year as AcademicYear).label ?? ''
    : ''

const activeTermId = (b: SystemBasics | null): number | null =>
  b?.active_term && typeof b.active_term === 'object'
    ? (b.active_term as AcademicTerm).id ?? null
    : null

const activeYearId = (b: SystemBasics | null): number | null =>
  b?.active_year && typeof b.active_year === 'object'
    ? (b.active_year as AcademicYear).id ?? null
    : null

/** Resolve a year label to its id using the loaded basics catalog. */
const yearIdForLabel = (b: SystemBasics | null, label: string): number | null =>
  label ? (b?.years?.find((y) => y.label === label)?.id ?? null) : null

/**
 * Holds the /api/system/basics payload — the "who are we, what term is it"
 * global, fetched once per authenticated session and kept in memory.
 *
 * The `selected*` fields are persisted to localStorage so a switched academic
 * context survives a reload (mirrors the campus / category filters). They are
 * also mirrored onto every outgoing request as `X-Academic-Year-Id` /
 * `X-Academic-Term-Id` by the axios interceptor in `services/api.ts`.
 */
export const useSystemStore = create<SystemState>()(
  persist(
    (set) => ({
      basics:   null,
      loading:  false,
      error:    null,
      loadedAt: null,

      selectedYearLabel:       '',
      selectedYearId:          null,
      selectedYearInitialized: false,
      academicContextPinned:   false,
      selectedTermId:          null,

      setBasics: (basics) => set((s) => {
        // Re-seed from the active year/term unless the user has pinned a
        // choice, or we've already seeded once this session.
        const keep = s.academicContextPinned || s.selectedYearInitialized
        return {
          basics,
          loadedAt: Date.now(),
          error: null,
          selectedYearLabel:       keep ? s.selectedYearLabel : activeYearLabel(basics),
          // When keeping a pinned label, refresh its id from the freshly
          // loaded catalog (it may not have been known at persist time).
          selectedYearId:          keep
                                     ? (s.selectedYearId ?? yearIdForLabel(basics, s.selectedYearLabel))
                                     : activeYearId(basics),
          selectedTermId:          keep ? s.selectedTermId    : activeTermId(basics),
          selectedYearInitialized: true,
        }
      }),
      setLoading: (loading) => set({ loading }),
      setError:  (error) => set({ error }),
      setSelectedYearLabel: (label, id) => set((s) => ({
        selectedYearLabel:       label,
        selectedYearId:          id ?? yearIdForLabel(s.basics, label),
        // A term belongs to exactly one year — dropping the year drops the
        // term with it (the backend then uses that year's current term).
        selectedTermId:          label === s.selectedYearLabel ? s.selectedTermId : null,
        selectedYearInitialized: true,
        academicContextPinned:   true,
      })),
      setSelectedTermId: (id) => set({ selectedTermId: id, academicContextPinned: true }),
      resetToActive: () => set((s) => ({
        selectedYearLabel:       activeYearLabel(s.basics),
        selectedYearId:          activeYearId(s.basics),
        selectedTermId:          activeTermId(s.basics),
        selectedYearInitialized: true,
        academicContextPinned:   false,
      })),
      clear:     () => set({
        basics: null, loading: false, error: null, loadedAt: null,
        selectedYearLabel: '', selectedYearId: null, selectedYearInitialized: false,
        academicContextPinned: false, selectedTermId: null,
      }),
    }),
    {
      name: 'cur-mis:academic-context',
      partialize: (s) => ({
        selectedYearLabel:     s.selectedYearLabel,
        selectedYearId:        s.selectedYearId,
        selectedTermId:        s.selectedTermId,
        academicContextPinned: s.academicContextPinned,
      }),
    },
  ),
)

/* ── Selectors ─────────────────────────────────────────────────────── */

export const selectActiveYear = (s: SystemState): AcademicYear | null => {
  const y = s.basics?.active_year
  return y && typeof y === 'object' ? (y as AcademicYear) : null
}

export const selectActiveTerm = (s: SystemState): AcademicTerm | null => {
  const t = s.basics?.active_term
  return t && typeof t === 'object' ? (t as AcademicTerm) : null
}

/** The id of the globally-selected academic year (persisted, else resolved). */
export const selectSelectedYearId = (s: SystemState): number | null => {
  if (!s.selectedYearLabel) return null
  return s.selectedYearId ?? yearIdForLabel(s.basics, s.selectedYearLabel)
}

/** True when the global context points somewhere other than the DB active year. */
export const selectIsAcademicContextOverridden = (s: SystemState): boolean => {
  const active = selectActiveYear(s)
  if (!active) return false
  if (s.selectedYearLabel && s.selectedYearLabel !== active.label) return true
  const activeTerm = selectActiveTerm(s)
  if (s.selectedTermId != null && activeTerm && s.selectedTermId !== activeTerm.id) return true
  return false
}

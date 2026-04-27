import { create } from 'zustand'
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
   * True once we've seeded `selectedYearLabel` from the active year. Prevents
   * the user's empty-string "All" choice from being overwritten every render.
   */
  selectedYearInitialized: boolean

  setBasics: (b: SystemBasics) => void
  setLoading: (l: boolean) => void
  setError:  (e: string | null) => void
  setSelectedYearLabel: (label: string) => void
  clear:     () => void
}

/**
 * Holds the /api/system/basics payload — the "who are we, what term is it"
 * global, fetched once per authenticated session and kept in memory.
 */
export const useSystemStore = create<SystemState>()((set) => ({
  basics:   null,
  loading:  false,
  error:    null,
  loadedAt: null,

  selectedYearLabel:       '',
  selectedYearInitialized: false,

  setBasics: (basics) => set((s) => {
    const nextLabel = s.selectedYearInitialized
      ? s.selectedYearLabel
      : (basics.active_year && typeof basics.active_year === 'object'
          ? (basics.active_year as AcademicYear).label ?? ''
          : '')
    return {
      basics,
      loadedAt: Date.now(),
      error: null,
      selectedYearLabel:       nextLabel,
      selectedYearInitialized: true,
    }
  }),
  setLoading: (loading) => set({ loading }),
  setError:  (error) => set({ error }),
  setSelectedYearLabel: (label) => set({ selectedYearLabel: label, selectedYearInitialized: true }),
  clear:     () => set({
    basics: null, loading: false, error: null, loadedAt: null,
    selectedYearLabel: '', selectedYearInitialized: false,
  }),
}))

/* ── Selectors ─────────────────────────────────────────────────────── */

export const selectActiveYear = (s: SystemState): AcademicYear | null => {
  const y = s.basics?.active_year
  return y && typeof y === 'object' ? (y as AcademicYear) : null
}

export const selectActiveTerm = (s: SystemState): AcademicTerm | null => {
  const t = s.basics?.active_term
  return t && typeof t === 'object' ? (t as AcademicTerm) : null
}

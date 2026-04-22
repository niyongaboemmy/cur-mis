import { create } from 'zustand'
import type { SystemBasics, AcademicYear, AcademicTerm } from '@/types/academic'

interface SystemState {
  basics:     SystemBasics | null
  loading:    boolean
  error:      string | null
  loadedAt:   number | null

  setBasics: (b: SystemBasics) => void
  setLoading: (l: boolean) => void
  setError:  (e: string | null) => void
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

  setBasics: (basics) => set({ basics, loadedAt: Date.now(), error: null }),
  setLoading: (loading) => set({ loading }),
  setError:  (error) => set({ error }),
  clear:     () => set({ basics: null, loading: false, error: null, loadedAt: null }),
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

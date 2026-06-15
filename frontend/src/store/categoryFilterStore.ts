import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Globally-selected student category scope. When non-null, every
 * student-aware page (dashboard, students list, stats) merges this
 * value into requests as `category` so the whole UI shows data scoped
 * to undergraduates *or* postgraduates only.
 *
 * `null` means "All categories" — the backend then returns the full
 * unscoped aggregate.
 *
 * Persisted in localStorage so a refresh keeps the user's chosen scope.
 */
export type StudentCategory = 'undergraduate' | 'postgraduate'

interface CategoryFilterState {
  selectedCategory: StudentCategory | null
  setSelectedCategory: (cat: StudentCategory | null) => void
  clear: () => void
}

export const useCategoryFilterStore = create<CategoryFilterState>()(
  persist(
    (set) => ({
      selectedCategory: null,
      setSelectedCategory: (cat) => set({ selectedCategory: cat }),
      clear: () => set({ selectedCategory: null }),
    }),
    {
      name: 'cur-mis:category-filter',
      partialize: (state) => ({ selectedCategory: state.selectedCategory }),
    },
  ),
)

/** Helper used inside service calls to inject `category` only when set. */
export function withCategoryScope<T extends Record<string, any>>(
  params: T,
): T & { category?: StudentCategory } {
  const cat = useCategoryFilterStore.getState().selectedCategory
  if (cat == null) return params
  // Caller-supplied category wins (e.g. when a page hard-codes one).
  if ((params as any).category != null && (params as any).category !== '') return params
  return { ...params, category: cat }
}

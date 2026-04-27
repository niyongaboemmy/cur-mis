import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Shared "scope" used across the Modules section (Scheduling, Registrations, …).
 * Persisted in localStorage so switching tabs preserves the admin's filter context.
 */
interface ModulesScopeState {
  facultyId:    number
  departmentIds: number[]
  programIds:   number[]
  setFaculty:   (id: number) => void
  setDepartments: (ids: number[]) => void
  setPrograms:  (ids: number[]) => void
  reset:        () => void
}

export const useModulesScopeStore = create<ModulesScopeState>()(
  persist(
    (set) => ({
      facultyId: 0,
      departmentIds: [],
      programIds: [],
      setFaculty:     (facultyId) => set({ facultyId, departmentIds: [], programIds: [] }),
      setDepartments: (departmentIds) => set({ departmentIds, programIds: [] }),
      setPrograms:    (programIds) => set({ programIds }),
      reset:          () => set({ facultyId: 0, departmentIds: [], programIds: [] }),
    }),
    { name: 'curmis.modules-scope' },
  ),
)

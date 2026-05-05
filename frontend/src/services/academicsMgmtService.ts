import { api } from '@/services/api'
import type { PaginatedResponse } from '@/types'
import type { AcMgmtEntity } from '@/types/academic'

/** Generic CRUD for /api/academics-management/:entity — all endpoints follow
 *  the same list(paginate) / show / create / update / delete pattern. */

export const academicsMgmtService = {
  list: <T = any>(
    entity: AcMgmtEntity,
    params: { page?: number; per_page?: number } & Record<string, unknown> = {},
    signal?: AbortSignal,
  ) => api.get<PaginatedResponse<T>>(`/api/academics-management/${entity}`, params, signal),

  show: <T = any>(entity: AcMgmtEntity, id: number | string, signal?: AbortSignal) =>
    api.get<T>(`/api/academics-management/${entity}/${id}`, {}, signal),

  create: <T = { id: number }>(entity: AcMgmtEntity, data: Record<string, unknown>) =>
    api.post<T>(`/api/academics-management/${entity}`, data),

  update: (entity: AcMgmtEntity, id: number | string, data: Record<string, unknown>) =>
    api.put<null>(`/api/academics-management/${entity}/${id}`, data),

  remove: (entity: AcMgmtEntity, id: number | string) =>
    api.delete<null>(`/api/academics-management/${entity}/${id}`),

  /** Campuses linked to a program (`options`). */
  listOptionCampuses: (optionId: number | string, signal?: AbortSignal) =>
    api.get<{ option_id: number; campus_ids: number[]; campuses: Array<Record<string, any>> }>(
      `/api/academics-management/options/${optionId}/campuses`, {}, signal,
    ),

  setOptionCampuses: (optionId: number | string, campusIds: number[]) =>
    api.put<{ option_id: number; campus_ids: number[] }>(
      `/api/academics-management/options/${optionId}/campuses`,
      { campus_ids: campusIds },
    ),
}

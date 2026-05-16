import { api } from '@/services/api'
import type { SystemBasics } from '@/types/academic'

export interface GuidanceVideos {
  video_application_guide_url: string
  video_login_guide_url:       string
}

export const systemService = {
  getBasics: (signal?: AbortSignal) =>
    api.get<SystemBasics>('/api/system/basics', {}, signal),

  /** Public — readable from the apply page and login page without auth. */
  getGuidanceVideos: (signal?: AbortSignal) =>
    api.get<GuidanceVideos>('/api/portal/guidance-videos', {}, signal),

  /** Admin — persist the two URLs (requires MANAGE_SETTINGS). */
  saveGuidanceVideos: (d: GuidanceVideos) =>
    api.put<GuidanceVideos>('/api/system/guidance-videos', d),
}

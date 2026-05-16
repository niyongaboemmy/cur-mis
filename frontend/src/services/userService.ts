import { api } from "./api";
import { useAuthStore } from "@/store/authStore";

export interface User {
  id: number;
  username: string;
  full_name: string;
  email: string;
  role_id: number;
  role_name?: string;
  is_active: number;
  photo?: string | null;
}

export interface UserListResponse {
  data: User[];
  total: number;
  per_page: number;
  current_page: number;
  last_page: number;
}

export interface UserStats {
  total: number;
  active: number;
  inactive: number;
  applicants: number;
  must_change_pw: number;
  never_logged_in: number;
  new_this_month: number;
  by_role: { role: string; count: number }[];
  by_month: { month: string; count: number }[];
}

export interface UserFilters {
  role_id?: number | "";
  status?: "active" | "inactive" | "";
  is_applicant?: "1" | "0" | "";
  must_change_pw?: "1" | "0" | "";
}

const userService = {
  getUsers: async (
    page = 1,
    search = "",
    perPage = 15,
    signal?: AbortSignal,
    filters?: UserFilters,
  ) => {
    return api.get<UserListResponse>(
      `/api/users`,
      { page, search, per_page: perPage, ...filters },
      signal,
    );
  },

  getUserStats: async (signal?: AbortSignal) => {
    return api.get<UserStats>(`/api/users/stats`, {}, signal);
  },

  getUser: async (id: number, signal?: AbortSignal) => {
    return api.get<User>(`/api/users/${id}`, {}, signal);
  },

  createUser: async (data: Partial<User> & { password?: string }) => {
    return api.post<void>(`/api/users`, data);
  },

  updateUser: async (id: number, data: Partial<User> & { password?: string }) => {
    return api.put<void>(`/api/users/${id}`, data);
  },

  toggleStatus: async (id: number) => {
    return api.patch<void>(`/api/users/${id}/toggle-status`);
  },

  deleteUser: async (id: number) => {
    return api.delete<void>(`/api/users/${id}`);
  },

  bulkPreview: async (targetTable: string, signal?: AbortSignal) => {
    return api.get<{ items: { id: number; username: string; full_name: string; email: string }[]; count: number }>(
      `/api/users/bulk-preview`,
      { target_table: targetTable },
      signal,
    );
  },

  bulkCreateAccounts: async (data: { target_table: string; default_password: string }) => {
    return api.post<{ total_processed: number; created_count: number; skipped_count: number }>(
      `/api/users/bulk-create`,
      data,
    );
  },

  /** Token-bearing URL for a user's profile photo. Returns null if no photo set. */
  photoUrl: (user: User): string | null => {
    if (!user.photo) return null;
    const token = useAuthStore.getState().token;
    const base  = import.meta.env.VITE_API_URL ?? "";
    return `${base}/api/users/${user.id}/photo?token=${token}&v=${encodeURIComponent(user.photo)}`;
  },
};

export default userService;

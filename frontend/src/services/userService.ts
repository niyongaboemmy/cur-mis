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

const userService = {
  getUsers: async (page = 1, search = "", perPage = 15, signal?: AbortSignal) => {
    return api.get<UserListResponse>(`/api/users`, {
      page,
      search,
      per_page: perPage,
    }, signal);
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

  /** Token-bearing URL for a user's profile photo. Returns null if no photo set. */
  photoUrl: (user: User): string | null => {
    if (!user.photo) return null;
    const token = useAuthStore.getState().token;
    const base  = import.meta.env.VITE_API_URL ?? '';
    return `${base}/api/users/${user.id}/photo?token=${token}&v=${encodeURIComponent(user.photo)}`;
  },
};

export default userService;

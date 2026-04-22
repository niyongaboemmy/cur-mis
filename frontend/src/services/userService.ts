import { api } from "./api";

export interface User {
  id: number;
  username: string;
  full_name: string;
  email: string;
  role_id: number;
  role_name?: string;
  is_active: number;
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
};

export default userService;

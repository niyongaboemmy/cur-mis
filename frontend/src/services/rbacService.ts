import { api } from './api';

export interface Role {
  id: number;
  name: string;
  description: string | null;
  permissions?: string[];
  user_count?: number;
  created_at: string;
}

export interface Permission {
  id: number;
  category_id: number;
  name: string;
  slug: string;
  description: string | null;
}

export interface PermissionCategory {
  id: number;
  name: string;
  description: string | null;
  permissions?: Permission[];
}

export const rbacService = {
  // Roles
  getRoles: (signal?: AbortSignal) => api.get<Role[]>('/api/roles', {}, signal),
  createRole: (data: Partial<Role>) => api.post<{ id: number }>('/api/roles', data),
  updateRole: (id: number, data: Partial<Role>) => api.put<null>(`/api/roles/${id}`, data),
  deleteRole: (id: number) => api.delete<null>(`/api/roles/${id}`),
  assignRolePermissions: (id: number, permissions: number[]) => 
    api.post<null>(`/api/roles/${id}/permissions`, { permissions }),

  // Permissions & Categories
  getPermissions: (signal?: AbortSignal) => api.get<PermissionCategory[]>('/api/permissions', {}, signal),
  
  createCategory: (data: { name: string; description?: string }) => 
    api.post<{ id: number }>('/api/permissions/categories', data),
  updateCategory: (id: number, data: { name: string; description?: string }) => 
    api.put<null>(`/api/permissions/categories/${id}`, data),

  createPermission: (data: { category_id: number; name: string; slug: string; description?: string }) => 
    api.post<{ id: number }>('/api/permissions', data),
  updatePermission: (id: number, data: Partial<Permission>) => 
    api.put<null>(`/api/permissions/${id}`, data),
  deletePermission: (id: number) => 
    api.delete<null>(`/api/permissions/${id}`),
};

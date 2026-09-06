import { api } from './api';

export interface Role {
  id: number;
  name: string;
  description: string | null;
  permissions?: string[];
  user_count?: number;
  created_at: string;
  /** When 1, users with this role only ever see data belonging to the
   *  campuses they're assigned to — even if they have an "admin" role name. */
  enforce_campus_scope?: 0 | 1 | boolean;
  /** When 1, this is one of the 8 canonical roles — cannot be renamed or deleted. */
  is_system?: 0 | 1 | boolean;
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
  getRoles: (signal?: AbortSignal) => api.get<Role[]>('/roles', {}, signal),
  createRole: (data: Partial<Role>) => api.post<{ id: number }>('/roles', data),
  updateRole: (id: number, data: Partial<Role>) => api.put<null>(`/api/roles/${id}`, data),
  deleteRole: (id: number) => api.delete<null>(`/api/roles/${id}`),
  assignRolePermissions: (id: number, permissions: number[], opts: { enforce_campus_scope?: boolean } = {}) =>
    api.post<null>(`/api/roles/${id}/permissions`, {
      permissions,
      ...(opts.enforce_campus_scope !== undefined
        ? { enforce_campus_scope: opts.enforce_campus_scope ? 1 : 0 }
        : {}),
    }),

  // Permissions & Categories
  getPermissions: (signal?: AbortSignal) => api.get<PermissionCategory[]>('/permissions', {}, signal),
  
  createCategory: (data: { name: string; description?: string }) => 
    api.post<{ id: number }>('/permissions/categories', data),
  updateCategory: (id: number, data: { name: string; description?: string }) => 
    api.put<null>(`/api/permissions/categories/${id}`, data),

  createPermission: (data: { category_id: number; name: string; slug: string; description?: string }) => 
    api.post<{ id: number }>('/permissions', data),
  updatePermission: (id: number, data: Partial<Permission>) => 
    api.put<null>(`/api/permissions/${id}`, data),
  deletePermission: (id: number) => 
    api.delete<null>(`/api/permissions/${id}`),
};

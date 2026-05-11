import React from 'react';
import { useAuthStore } from '@/store/authStore';

interface HasPermissionProps {
  permission: string | string[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export default function HasPermission({ permission, children, fallback = null }: HasPermissionProps) {
  const user = useAuthStore((state) => state.user);

  // Superadmin always has access, or if there's no auth system loaded properly it's safer to fail-open/closed based on context.
  // We'll let superadmin bypass, or strictly check permissions.
  if (user?.role === 'superadmin' || user?.role === 'admin') {
    return <>{children}</>;
  }

  const userPermissions = user?.permissions || [];
  
  const hasAccess = Array.isArray(permission)
    ? permission.some((p) => userPermissions.includes(p))
    : userPermissions.includes(permission);

  if (!hasAccess) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

import React from 'react';
import { useAnyPermission } from '@/utils/permissions';

interface HasPermissionProps {
  permission: string | string[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/** Reusable permission gate — backed by the same superadmin-bypass logic as ProtectedRoute. */
export default function HasPermission({ permission, children, fallback = null }: HasPermissionProps) {
  const slugs = Array.isArray(permission) ? permission : [permission];
  const hasAccess = useAnyPermission(slugs);

  return <>{hasAccess ? children : fallback}</>;
}

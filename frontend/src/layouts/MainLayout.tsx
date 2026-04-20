import {
  Home,
  Menu,
  X,
  Users,
  Settings,
  GraduationCap,
  CreditCard,
  ClipboardList,
  BookOpen,
  Activity,
} from "lucide-react";
import { useState, useEffect, useMemo, useRef } from "react";
import { APP_NAME } from "@/constants";
import { PERMISSIONS } from "@/constants/permissions";
import UserDropdown from "@/components/layout/UserDropdown";
import navigationService, {
  NavGroup as ApiNavGroup,
} from "@/services/navigationService";

import { NavLink, Outlet } from "react-router-dom";
import { motion } from "framer-motion";

// Map permission slugs to their frontend metadata (Route and Icon)
const NAV_METADATA_REGISTRY: Record<string, { to: string; icon: any }> = {
  [PERMISSIONS.MANAGE_USERS]: { to: "/users", icon: Users },
  [PERMISSIONS.MANAGE_ROLES]: { to: "/roles", icon: Settings },
  [PERMISSIONS.MANAGE_PERMISSIONS]: { to: "/permissions", icon: Settings },
  [PERMISSIONS.VIEW_SYSTEM_LOGS]: { to: "/logs", icon: Activity },
  [PERMISSIONS.VIEW_STUDENTS]: { to: "/students", icon: GraduationCap },
  [PERMISSIONS.MANAGE_ACADEMICS]: { to: "/programs", icon: BookOpen },
  [PERMISSIONS.MANAGE_FINANCE]: { to: "/finance", icon: CreditCard },
  [PERMISSIONS.MANAGE_EXAMS]: { to: "/exams", icon: ClipboardList },
};

export default function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dynamicGroups, setDynamicGroups] = useState<ApiNavGroup[]>([]);
  const hasFetched = useRef(false);

  useEffect(() => {
    // If already fetched or fetching in this mount, skip
    if (hasFetched.current) return;
    hasFetched.current = true;

    const controller = new AbortController();

    const fetchNav = async () => {
      try {
        const structure = await navigationService.getStructure();
        setDynamicGroups(structure);
      } catch (error) {
        console.error("Failed to load navigation structure");
        hasFetched.current = false; // Allow retry on error
      }
    };
    fetchNav();

    return () => controller.abort();
  }, []);

  const navGroups = useMemo(() => {
    // 1. Start with hardcoded general items that don't need grouped permissions
    const groups = [
      {
        label: "General",
        items: [{ to: "/", icon: Home, label: "Dashboard" }],
      },
    ];

    // 2. Add dynamic groups from DB
    dynamicGroups.forEach((group) => {
      const items = group.items
        .map((item) => {
          const meta = NAV_METADATA_REGISTRY[item.slug];
          if (!meta) return null;
          return {
            to: meta.to,
            icon: meta.icon,
            label: item.name,
          };
        })
        .filter(Boolean) as any[];

      if (items.length > 0) {
        groups.push({
          label: group.label,
          items: items,
        });
      }
    });

    return groups;
  }, [dynamicGroups]);

  return (
    <div className="min-h-screen flex bg-gray-50 transform transition-all duration-500">
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-900 shadow-2xl border-r border-gray-200 dark:border-gray-800 transform transition-transform duration-300 ease-in-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:relative lg:translate-x-0`}
      >
        <div className="flex h-20 items-center justify-between px-6 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold">{APP_NAME.charAt(0)}</span>
            </div>
            <span className="text-xl font-bold bg-gradient-to-br from-primary-700 to-primary-900 bg-clip-text text-transparent">
              {APP_NAME}
            </span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-gray-500 hover:text-gray-900"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <nav className="mt-6 px-4 space-y-8 overflow-y-auto max-h-[calc(100vh-80px)] pb-10 custom-scrollbar">
          {navGroups.map((group) => (
            <div key={group.label} className="space-y-2">
              <h3 className="px-3 text-[10px] font-bold tracking-widest text-gray-400 dark:text-gray-500 uppercase">
                {group.label}
              </h3>
              <div className="space-y-1">
                {group.items.map(({ to, icon: Icon, label }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 group
                       ${
                         isActive
                           ? "bg-primary-600 text-white shadow-lg shadow-primary-600/30 translate-x-1"
                           : "text-gray-600 dark:text-gray-400 hover:bg-primary-50 dark:hover:bg-gray-800 hover:text-primary-600 dark:hover:text-primary-400"
                       }`
                    }
                  >
                    <Icon className="h-4 w-4" />
                    <span>{label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white dark:bg-gray-900 shadow-sm flex items-center justify-between px-4 lg:px-8 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 bg-clip-text text-transparent">
              Dashboard
            </h1>
          </div>

          <UserDropdown />
        </header>

        <motion.main
          key="outlet"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="flex-1 p-6 dark:bg-black"
        >
          <Outlet />
        </motion.main>
      </div>
    </div>
  );
}

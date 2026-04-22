import {
  Home,
  Menu,
  X,
  Users,
  User as UserIcon,
  Settings,
  GraduationCap,
  CreditCard,
  ClipboardList,
  BookOpen,
  Layers,
  Sliders,
  Activity,
  Search,
  Bell,
  MessageSquare,
  ShieldCheck,
  LayoutGrid,
  BookMarked,
  CalendarDays,
  ClipboardCheck,
  Megaphone,
  Bus,
  Building2,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import UserDropdown from "@/components/layout/UserDropdown";
import Logo from "@/components/brand/Logo";
import { useCurrentUser } from "@/hooks/useAuth";
import { useSystemBasics } from "@/hooks/useSystemBasics";

import { NavLink, Outlet, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";

/* ------------------------------------------------------------------
 * Nav tree — Home is a direct leaf (no sub-items). Groups with
 * `children` expand when clicked.
 * ------------------------------------------------------------------ */

type NavChild = { to: string; label: string };
type NavNode = {
  id:        string;
  label:     string;
  icon:      LucideIcon;
  to?:       string;
  children?: NavChild[];
};

const NAV_TREE: NavNode[] = [
  { id: "home", label: "Home", icon: Home, to: "/" },
  {
    id: "students-group",
    label: "Students",
    icon: GraduationCap,
    children: [
      { to: "/students",         label: "All students" },
      { to: "/students/new",     label: "Admissions"   },
      { to: "/students/alumni",  label: "Alumni"       },
    ],
  },
  // ─── Academic (promoted to top-level for visibility) ───
  { id: "academic-settings",    label: "Academic settings",    icon: Sliders,  to: "/academic/settings"   },
  { id: "academics-management", label: "Academics management", icon: Layers,   to: "/academic/management" },
  {
    id: "teachers-group",
    label: "Teachers",
    icon: Users,
    children: [
      { to: "/teachers",           label: "All teachers" },
      { to: "/teachers/schedules", label: "Schedules"    },
    ],
  },
  { id: "library",    label: "Library",    icon: BookMarked,     to: "/library" },
  {
    id: "account",
    label: "Account",
    icon: CreditCard,
    children: [
      { to: "/finance",          label: "Finance"  },
      { to: "/account/billing",  label: "Billing"  },
      { to: "/account/salaries", label: "Salaries" },
    ],
  },
  { id: "class",      label: "Class",      icon: LayoutGrid,     to: "/class" },
  { id: "subject",    label: "Subject",    icon: BookOpen,       to: "/subject" },
  { id: "routine",    label: "Routine",    icon: CalendarDays,   to: "/routine" },
  { id: "attendance", label: "Attendance", icon: ClipboardCheck, to: "/attendance" },
  {
    id: "exam",
    label: "Exam",
    icon: ClipboardList,
    children: [
      { to: "/exams",         label: "Exam schedule" },
      { to: "/exams/results", label: "Results"       },
    ],
  },
  { id: "notice",     label: "Notice",     icon: Megaphone,      to: "/notice" },
  { id: "transport",  label: "Transport",  icon: Bus,            to: "/transport" },
  { id: "hostel",     label: "Hostel",     icon: Building2,      to: "/hostel" },
];

const ADMIN_TREE: NavNode[] = [
  { id: "users",       label: "Users",       icon: UserIcon,    to: "/users" },
  { id: "roles",       label: "Roles",       icon: ShieldCheck, to: "/roles" },
  { id: "permissions", label: "Permissions", icon: Settings,    to: "/permissions" },
  { id: "logs",        label: "System logs", icon: Activity,    to: "/logs" },
];

const ROUTE_TITLES: Record<string, { title: string; sub?: string }> = {
  "/":                   { title: "Admin Dashboard", sub: "Welcome back to Catholic University of Rwanda" },
  "/users":              { title: "User management", sub: "Staff, faculty and student accounts" },
  "/roles":              { title: "Roles",           sub: "Who can do what in the system" },
  "/permissions":        { title: "Permissions",     sub: "Fine-grained access control" },
  "/logs":               { title: "System logs",     sub: "Audit trail across the platform" },
  "/students":           { title: "Students & Staff", sub: "CUR student registry & HR employees" },
  "/academic/settings":   { title: "Academic settings",    sub: "Academic years & terms" },
  "/academic/management": { title: "Academics management", sub: "Degrees, schools, departments, modules, facilities and more" },
  "/students/new":       { title: "Admissions",      sub: "New student applications" },
  "/students/alumni":    { title: "Alumni",          sub: "CUR alumni directory" },
  "/teachers":           { title: "Teachers",        sub: "Lecturers and faculty members" },
  "/teachers/schedules": { title: "Teacher schedules", sub: "Weekly teaching assignments" },
  "/programs":           { title: "Programs",        sub: "Academic programs & curriculum" },
  "/finance":            { title: "Finance",         sub: "Fees, payments and billing" },
  "/account/billing":    { title: "Billing",         sub: "Invoices and statements" },
  "/account/salaries":   { title: "Salaries",        sub: "Staff payroll" },
  "/exams":              { title: "Examinations",    sub: "Exams, results and transcripts" },
  "/exams/results":      { title: "Exam results",    sub: "All examination results" },
  "/library":            { title: "Library",         sub: "Books and digital resources" },
  "/class":              { title: "Classes",         sub: "Class schedules and rooms" },
  "/subject":            { title: "Subjects",        sub: "All academic subjects" },
  "/routine":            { title: "Routine",         sub: "Weekly class routine" },
  "/attendance":         { title: "Attendance",      sub: "Student and staff attendance" },
  "/notice":             { title: "Notice board",    sub: "Announcements and circulars" },
  "/transport":          { title: "Transport",       sub: "Routes and vehicles" },
  "/hostel":             { title: "Hostel",          sub: "Accommodation management" },
};

const STORAGE_KEY = "cur-mis-sidebar-collapsed";

/* ------------------------------------------------------------------ */

export default function MainLayout() {
  const location = useLocation();
  // Fetch /auth/me once on mount — keeps the Zustand user (role, permissions)
  // in sync with the server. The hook syncs the response back via setUser.
  useCurrentUser();
  // Fetch /system/basics once — active academic year / term become globally
  // available via useSystemStore.
  useSystemBasics();

  const [sidebarOpen, setSidebarOpen] = useState(false); // mobile drawer
  const [collapsed,   setCollapsed]   = useState<boolean>(() => {
    try { return localStorage.getItem(STORAGE_KEY) === "1"; } catch { return false; }
  });
  const [query, setQuery] = useState("");

  const initiallyOpen = useMemo<Set<string>>(() => {
    const set = new Set<string>();
    for (const node of [...NAV_TREE, ...ADMIN_TREE]) {
      if (node.children?.some((c) => c.to === location.pathname)) set.add(node.id);
    }
    return set;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [openIds, setOpenIds] = useState<Set<string>>(initiallyOpen);

  // If navigating to a child route, keep its parent expanded
  useEffect(() => {
    setOpenIds((prev) => {
      for (const node of [...NAV_TREE, ...ADMIN_TREE]) {
        if (node.children?.some((c) => c.to === location.pathname) && !prev.has(node.id)) {
          const next = new Set(prev);
          next.add(node.id);
          return next;
        }
      }
      return prev;
    });
  }, [location.pathname]);

  // Close mobile drawer on route change
  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  // Persist collapse state
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0"); } catch {}
  }, [collapsed]);

  const toggleGroup = useCallback((id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleCollapse = useCallback(() => setCollapsed((v) => !v), []);
  const openSidebar    = useCallback(() => setSidebarOpen(true),  []);
  const closeSidebar   = useCallback(() => setSidebarOpen(false), []);
  const onQuery        = useCallback((e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value), []);

  const filtered = useMemo<NavNode[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return NAV_TREE;
    return NAV_TREE
      .map((n) => {
        if (n.label.toLowerCase().includes(q)) return n;
        if (n.children) {
          const kids = n.children.filter((c) => c.label.toLowerCase().includes(q));
          if (kids.length) return { ...n, children: kids };
        }
        return null;
      })
      .filter(Boolean) as NavNode[];
  }, [query]);

  const headerMeta = ROUTE_TITLES[location.pathname] ?? { title: "CUR-MIS" };
  const sidebarWidth = collapsed ? 72 : 240;

  return (
    <div className="h-screen flex bg-[rgb(var(--bg-app))] text-ink-800 dark:text-ink-100 overflow-hidden">
      {/* ───────────────────────── Sidebar ───────────────────────── */}
      <aside
        style={{ width: sidebarWidth }}
        className={`fixed lg:sticky top-0 left-0 z-50 h-screen shrink-0 bg-white dark:bg-ink-800 border-r border-ink-100 dark:border-ink-700
          transition-[width,transform] duration-300 ease-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
          flex flex-col`}
      >
        {/* Logo header */}
        <div className={`h-16 flex items-center justify-between border-b border-ink-100 dark:border-ink-700 shrink-0 ${collapsed ? "px-3" : "px-5"}`}>
          {collapsed ? (
            <Logo to="/" size="sm" showText={false} />
          ) : (
            <Logo to="/" size="md" />
          )}
          <button
            onClick={closeSidebar}
            className="lg:hidden icon-btn"
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Sidebar search (hidden when collapsed) */}
        {!collapsed && (
          <div className="px-4 pt-4 shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400 pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={onQuery}
                placeholder="Quick find…"
                className="w-full rounded-lg bg-ink-50 dark:bg-ink-700/40 border border-transparent focus:border-primary-300 focus:bg-white focus:ring-2 focus:ring-primary-100 dark:focus:ring-primary-900/40 focus:outline-none text-[13px] pl-9 pr-3 py-2 transition"
              />
            </div>
          </div>
        )}

        {/* Scrollable nav area */}
        <nav className={`${collapsed ? "mt-3" : "mt-4"} pb-4 overflow-y-auto no-scrollbar flex-1 space-y-0.5 ${collapsed ? "px-2" : "px-3"}`}>
          {filtered.length === 0 && !collapsed && (
            <p className="px-3 py-6 text-[12px] text-ink-400 text-center">
              No matches for “{query}”.
            </p>
          )}

          {filtered.map((node) => (
            <NavNodeItem
              key={node.id}
              node={node}
              collapsed={collapsed}
              isOpen={openIds.has(node.id)}
              onToggle={toggleGroup}
            />
          ))}

          {/* Admin tools band */}
          <div className="pt-4 mt-4 border-t border-ink-100 dark:border-ink-700 space-y-0.5">
            {!collapsed && <h3 className="nav-group-label mb-1">Administration</h3>}
            {ADMIN_TREE.map((node) => (
              <NavNodeItem
                key={node.id}
                node={node}
                collapsed={collapsed}
                isOpen={openIds.has(node.id)}
                onToggle={toggleGroup}
              />
            ))}
          </div>
        </nav>

        {/* Footer — collapse toggle */}
        <div className="border-t border-ink-100 dark:border-ink-700 shrink-0 p-2">
          <button
            onClick={toggleCollapse}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-md text-ink-500 hover:bg-ink-50 hover:text-ink-800 dark:hover:bg-ink-700 dark:hover:text-white transition-colors"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed
              ? <PanelLeftOpen className="w-4 h-4" />
              : <><PanelLeftClose className="w-4 h-4" /><span className="text-[12.5px] font-medium">Collapse</span></>}
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-ink-900/50 backdrop-blur-sm lg:hidden"
            onClick={closeSidebar}
          />
        )}
      </AnimatePresence>

      {/* ───────────────────────── Main column ───────────────────────── */}
      {/*
        No `overflow-hidden` on this column — that would clip popovers
        (like the user-profile dropdown) that extend below the header.
        Viewport-lock is already enforced by the root `h-screen + overflow-hidden`;
        vertical scrolling lives on <main> below via `overflow-y-auto`.
      */}
      <div className="flex-1 flex flex-col min-w-0 h-screen">
        {/* Topbar — solid bg so the dropdown doesn't get trapped in a
             backdrop-filter stacking context. z-30 keeps it above page content. */}
        <header className="relative z-30 h-16 shrink-0 bg-[rgb(var(--bg-app))] dark:bg-ink-900 border-b border-ink-100 dark:border-ink-700 flex items-center justify-between gap-4 px-5 lg:px-8">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={openSidebar}
              className="lg:hidden icon-btn"
              aria-label="Open sidebar"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0 md:hidden">
              <h1 className="text-[14px] font-medium text-ink-900 dark:text-white leading-tight truncate">
                {headerMeta.title}
              </h1>
            </div>
            {/* Global pill search */}
            <div className="hidden md:flex">
              <div className="relative w-[280px] lg:w-[400px]">
                <Search className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="What do you want to find?"
                  className="w-full h-10 rounded-full bg-ink-50/80 dark:bg-ink-800 border border-ink-100 dark:border-ink-700 pl-5 pr-11 text-[13.5px] placeholder-ink-400 focus:outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-100 dark:focus:ring-primary-900/40 transition"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <RoundIconBtn label="Notifications" dot>
              <Bell className="w-[18px] h-[18px]" />
            </RoundIconBtn>
            <RoundIconBtn label="Messages">
              <MessageSquare className="w-[18px] h-[18px]" />
            </RoundIconBtn>
            <UserDropdown />
          </div>
        </header>

        {/* Scrollable page content (fills remaining height) */}
        <motion.main
          key={location.pathname}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
          className="flex-1 overflow-y-auto px-5 sm:px-6 lg:px-8 py-6"
        >
          <Outlet />
        </motion.main>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
 * Sub-components
 * ------------------------------------------------------------------ */

const NavNodeItem = memo(function NavNodeItem({
  node,
  collapsed,
  isOpen,
  onToggle,
}: {
  node:      NavNode;
  collapsed: boolean;
  isOpen:    boolean;
  onToggle:  (id: string) => void;
}) {
  const location = useLocation();

  // Leaf route
  if (!node.children) {
    return (
      <NavLink
        to={node.to!}
        end
        title={collapsed ? node.label : undefined}
        className={({ isActive }) =>
          `${collapsed ? "flex items-center justify-center h-10 w-full rounded-lg transition-colors" : "nav-link"}
           ${isActive
              ? collapsed
                ? "bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-200"
                : "nav-link-active"
              : collapsed
                ? "text-ink-500 hover:bg-ink-50 hover:text-ink-900 dark:text-ink-400 dark:hover:bg-ink-700/50 dark:hover:text-white"
                : "nav-link-idle"}`
        }
      >
        <node.icon className="h-[18px] w-[18px] shrink-0" />
        {!collapsed && <span className="truncate">{node.label}</span>}
      </NavLink>
    );
  }

  // When collapsed, treat groups as an "icon-only" button — click goes to first child.
  if (collapsed) {
    const hasActiveChild = node.children.some((c) => c.to === location.pathname);
    return (
      <NavLink
        to={node.children[0].to}
        title={node.label}
        className={`flex items-center justify-center h-10 w-full rounded-lg transition-colors ${
          hasActiveChild
            ? "bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-200"
            : "text-ink-500 hover:bg-ink-50 hover:text-ink-900 dark:text-ink-400 dark:hover:bg-ink-700/50 dark:hover:text-white"
        }`}
      >
        <node.icon className="h-[18px] w-[18px]" />
      </NavLink>
    );
  }

  // Expanded group
  const hasActiveChild = node.children.some((c) => c.to === location.pathname);

  return (
    <div>
      <button
        type="button"
        onClick={() => onToggle(node.id)}
        className={`nav-link w-full text-left ${hasActiveChild ? "nav-link-active" : "nav-link-idle"}`}
      >
        <node.icon className="h-[18px] w-[18px] shrink-0" />
        <span className="truncate flex-1">{node.label}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="mt-0.5 mb-1 space-y-0.5">
              {node.children.map((child) => (
                <NavLink
                  key={child.to}
                  to={child.to}
                  end
                  className={({ isActive }) =>
                    `nav-sublink ${isActive ? "nav-sublink-active" : "nav-sublink-idle"}`
                  }
                >
                  {child.label}
                </NavLink>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

const RoundIconBtn = memo(function RoundIconBtn({
  children,
  label,
  dot = false,
}: {
  children: ReactNode;
  label:    string;
  dot?:     boolean;
}) {
  return (
    <button
      aria-label={label}
      className="relative w-10 h-10 rounded-full border border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-800 text-ink-600 dark:text-ink-300 hover:text-primary-700 hover:border-primary-200 dark:hover:bg-ink-700 transition-colors flex items-center justify-center"
    >
      {children}
      {dot && (
        <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary-700 ring-2 ring-white dark:ring-ink-800" />
      )}
    </button>
  );
});

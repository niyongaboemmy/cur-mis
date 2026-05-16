import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  UserPlus,
  Users,
  Edit2,
  Shield,
  User as UserIcon,
  Mail,
  Search,
  RefreshCw,
  Power,
  CheckCircle2,
  XCircle,
  X,
  ChevronLeft,
  ChevronRight,
  Activity,
  AlertTriangle,
  LayoutDashboard,
  List,
  TrendingUp,
  UserX,
  Filter,
  Building2,
  Trash2,
} from "lucide-react";
import userService, { User, UserStats, UserFilters, UserCampusAssignment } from "@/services/userService";
import { rbacService, Role } from "@/services/rbacService";
import { toast } from "react-hot-toast";
import ModalPortal from "@/components/ui/ModalPortal";
import BulkAccountCreationModal from "@/components/admin/BulkAccountCreationModal";
import StatCard from "@/components/dashboard/StatCard";
import DonutChart from "@/components/dashboard/DonutChart";
import ColumnChart from "@/components/dashboard/ColumnChart";

// ── Role colour palette for donut chart ──────────────────────────────────────
const ROLE_COLORS: Record<string, string> = {
  student:       "#3B82F6",
  lecturer:      "#8B5CF6",
  admin:         "#F59E0B",
  superadmin:    "#EF4444",
  hr_manager:    "#10B981",
  registrar:     "#06B6D4",
  finance_officer: "#F97316",
  applicant:     "#6B7280",
};
const FALLBACK_COLORS = ["#64748B","#94A3B8","#CBD5E1","#E2E8F0"];

// ── Smart ellipsis page list ──────────────────────────────────────────────────
function buildPages(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "…")[] = [1];
  if (current > 3) pages.push("…");
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i);
  if (current < total - 2) pages.push("…");
  pages.push(total);
  return pages;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function UsersManagementPage() {
  const [tab, setTab] = useState<"dashboard" | "list">("dashboard");

  // ── Dashboard state ───────────────────────────────────────────────────────
  const [stats, setStats]           = useState<UserStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // ── List state ────────────────────────────────────────────────────────────
  const [users, setUsers]           = useState<User[]>([]);
  const [roles, setRoles]           = useState<Role[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const [page, setPage]             = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);

  // Filters
  const [filters, setFilters] = useState<UserFilters>({
    role_id: "", status: "", is_applicant: "", must_change_pw: "",
  });

  const activeFilterCount = [
    filters.role_id, filters.status, filters.is_applicant, filters.must_change_pw,
  ].filter((v) => v !== "").length;

  const clearFilters = () =>
    setFilters({ role_id: "", status: "", is_applicant: "", must_change_pw: "" });

  // ── Modal state ───────────────────────────────────────────────────────────
  const [showModal, setShowModal]       = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [editingUser, setEditingUser]   = useState<User | null>(null);
  const [formData, setFormData]         = useState({
    full_name: "", email: "", username: "", password: "", role_id: "",
  });

  // ── Campus assignment state (registry scoping) ────────────────────────────
  const [allCampuses, setAllCampuses]               = useState<{ id: number; name: string; code: string | null; location: string | null }[]>([]);
  const [userCampuses, setUserCampuses]             = useState<UserCampusAssignment[]>([]);
  const [campusAssignmentBusy, setCampusAssignmentBusy] = useState(false);
  const [selectedCampusToAdd, setSelectedCampusToAdd]   = useState<string>("");

  const searchTimeout   = useRef<NodeJS.Timeout | null>(null);
  const abortController = useRef<AbortController | null>(null);
  const statsAbort      = useRef<AbortController | null>(null);

  // ── Fetch stats ───────────────────────────────────────────────────────────
  const fetchStats = useCallback(async (signal?: AbortSignal) => {
    setStatsLoading(true);
    try {
      const res = await userService.getUserStats(signal);
      if (res.data) setStats(res.data);
    } catch (err: any) {
      if (err.name === "CanceledError" || err.name === "AbortError") return;
      toast.error("Failed to load user statistics");
    } finally {
      setStatsLoading(false);
    }
  }, []);

  // ── Fetch list ────────────────────────────────────────────────────────────
  const fetchData = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      try {
        const [userRes, roleRes] = await Promise.all([
          userService.getUsers(page, search, 15, signal, filters),
          rbacService.getRoles(signal),
        ]);
        setUsers(userRes.data?.data || []);
        setTotalPages(userRes.data?.last_page || 1);
        setTotalUsers(userRes.data?.total || 0);
        setRoles(roleRes.data || []);
      } catch (error: any) {
        if (error.name === "CanceledError" || error.name === "AbortError") return;
        toast.error("Failed to load user management data");
      } finally {
        setLoading(false);
      }
    },
    [page, search, filters],
  );

  // Load stats when dashboard tab is active
  useEffect(() => {
    if (tab !== "dashboard") return;
    statsAbort.current?.abort();
    statsAbort.current = new AbortController();
    fetchStats(statsAbort.current.signal);
    return () => statsAbort.current?.abort();
  }, [tab, fetchStats]);

  // Load list whenever page / search / filters change
  useEffect(() => {
    abortController.current?.abort();
    abortController.current = new AbortController();
    const delay = search ? 300 : 0;
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      fetchData(abortController.current?.signal);
    }, delay);
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
      abortController.current?.abort();
    };
  }, [fetchData]);

  // Reset to page 1 when filters or search change
  const handleSearchChange = (val: string) => { setSearch(val); setPage(1); };
  const handleFilterChange = (patch: Partial<UserFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };

  // ── User modal helpers ────────────────────────────────────────────────────
  const handleOpenModal = async (user: User | null = null) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        full_name: user.full_name, email: user.email,
        username: user.username, password: "", role_id: user.role_id.toString(),
      });
      // Load this user's campus assignments + the full active-campus catalog.
      try {
        const [assignmentsRes, catalogRes] = await Promise.all([
          userService.listCampusAssignments(user.id),
          allCampuses.length ? Promise.resolve(null) : userService.listAllCampuses(),
        ]);
        setUserCampuses(assignmentsRes.data?.assignments ?? []);
        if (catalogRes) setAllCampuses(catalogRes.data?.campuses ?? []);
      } catch {
        // Soft-fail — the campus block just shows empty, the rest of the modal still works.
        setUserCampuses([]);
      }
    } else {
      setEditingUser(null);
      setFormData({ full_name: "", email: "", username: "", password: "", role_id: "" });
      setUserCampuses([]);
    }
    setSelectedCampusToAdd("");
    setShowModal(true);
  };

  const handleAssignCampus = async (campusIdRaw?: string) => {
    const raw = campusIdRaw ?? selectedCampusToAdd;
    if (!editingUser || !raw) return;
    const campusId = Number(raw);
    setCampusAssignmentBusy(true);
    try {
      const res = await userService.assignCampus(editingUser.id, campusId);
      setUserCampuses(res.data?.assignments ?? []);
      setSelectedCampusToAdd("");
      toast.success("Campus assigned");
      // Also refresh the main user list so the new chip shows up immediately
      // on the row behind the modal.
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? "Failed to assign campus");
    } finally {
      setCampusAssignmentBusy(false);
    }
  };

  const handleRevokeCampus = async (campusId: number) => {
    if (!editingUser) return;
    setCampusAssignmentBusy(true);
    try {
      const res = await userService.revokeCampus(editingUser.id, campusId);
      setUserCampuses(res.data?.assignments ?? []);
      toast.success("Campus removed");
      // Same as assign — keep the row chips in sync with the modal.
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? "Failed to remove campus");
    } finally {
      setCampusAssignmentBusy(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = { ...formData, role_id: parseInt(formData.role_id) };
      if (editingUser) {
        await userService.updateUser(editingUser.id, payload);
        toast.success("User updated successfully");
      } else {
        await userService.createUser(payload);
        toast.success("User registered successfully");
      }
      setShowModal(false);
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to save user");
    }
  };

  const toggleStatus = async (user: User) => {
    try {
      await userService.toggleStatus(user.id);
      toast.success(`User ${user.is_active ? "deactivated" : "activated"} successfully`);
      fetchData();
    } catch {
      toast.error("Failed to change user status");
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 animate-in fade-in">

      {/* Page header */}
      <div className="card-tight flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-[15px] font-semibold font-display text-ink-900 dark:text-white">
            <UserIcon className="w-4 h-4 text-primary-600" />
            User management
          </h1>
          <p className="section-sub mt-0.5">
            Manage system users, authentication roles, and account security.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={() => setShowBulkModal(true)} className="btn-secondary">
            <Users className="w-3.5 h-3.5" />
            Bulk create accounts
          </button>
          <button onClick={() => handleOpenModal()} className="btn-primary">
            <UserPlus className="w-3.5 h-3.5" />
            Register new user
          </button>
        </div>
      </div>

      {/* ── Tab switcher ── */}
      <div className="flex items-center gap-1 p-1 bg-ink-100 dark:bg-ink-800 rounded-xl w-fit">
        <button
          onClick={() => setTab("dashboard")}
          className={`flex items-center gap-1.5 px-5 py-2 text-[13px] font-semibold rounded-lg transition-all ${
            tab === "dashboard"
              ? "bg-white dark:bg-ink-900 text-primary-700 dark:text-primary-300 shadow-sm"
              : "text-ink-500 hover:text-ink-700 dark:hover:text-ink-300"
          }`}
        >
          <LayoutDashboard className="w-3.5 h-3.5" />
          Users Dashboard
        </button>
        <button
          onClick={() => setTab("list")}
          className={`flex items-center gap-1.5 px-5 py-2 text-[13px] font-semibold rounded-lg transition-all ${
            tab === "list"
              ? "bg-white dark:bg-ink-900 text-primary-700 dark:text-primary-300 shadow-sm"
              : "text-ink-500 hover:text-ink-700 dark:hover:text-ink-300"
          }`}
        >
          <List className="w-3.5 h-3.5" />
          Users List
          {activeFilterCount > 0 && (
            <span className="ml-0.5 min-w-[18px] h-[18px] rounded-full bg-primary-600 text-white text-[10px] font-bold flex items-center justify-center px-1">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════
          TAB 1 — USERS DASHBOARD
      ══════════════════════════════════════════════════════ */}
      {tab === "dashboard" && (
        <div className="space-y-5">

          {/* Stat cards */}
          {statsLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="stat-card bg-ink-100 dark:bg-ink-800 animate-pulse h-24" />
              ))}
            </div>
          ) : stats ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
              <StatCard label="Total users"        value={stats.total.toLocaleString()}           icon={Users}         tone="lilac" />
              <StatCard label="Active"             value={stats.active.toLocaleString()}          icon={CheckCircle2}  tone="mint"  />
              <StatCard label="Inactive"           value={stats.inactive.toLocaleString()}        icon={XCircle}       tone="peach" />
              <StatCard label="Applicants"         value={stats.applicants.toLocaleString()}      icon={UserIcon}      tone="sky"   />
              <StatCard label="Must change PW"     value={stats.must_change_pw.toLocaleString()}  icon={AlertTriangle} tone="sun"   />
              <StatCard label="Never logged in"    value={stats.never_logged_in.toLocaleString()} icon={UserX}         tone="peach" />
            </div>
          ) : null}

          {/* Charts row */}
          {!statsLoading && stats && (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

              {/* Monthly trend — column chart */}
              <div className="lg:col-span-3 card p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-[13px] font-semibold text-ink-900 dark:text-white">
                      Registration trend
                    </h3>
                    <p className="section-sub mt-0.5">New accounts — last 6 months</p>
                  </div>
                  <div className="flex items-center gap-1.5 chip-primary">
                    <TrendingUp className="w-3 h-3" />
                    {stats.new_this_month} this month
                  </div>
                </div>
                {stats.by_month.length > 0 ? (
                  <ColumnChart
                    data={stats.by_month.map((m) => ({
                      value: m.month,
                      label: m.month,
                      total: m.count,
                      color: "#1A4A8C",
                    }))}
                    height={220}
                  />
                ) : (
                  <div className="flex items-center justify-center h-40 text-ink-400 text-[12.5px]">
                    No registration data for the last 6 months.
                  </div>
                )}
              </div>

              {/* Role breakdown — donut chart */}
              <div className="lg:col-span-2 card p-5 space-y-3">
                <div>
                  <h3 className="text-[13px] font-semibold text-ink-900 dark:text-white">
                    Users by role
                  </h3>
                  <p className="section-sub mt-0.5">Distribution across all roles</p>
                </div>
                <div className="flex flex-col items-center gap-4">
                  <DonutChart
                    segments={stats.by_role.map((r, i) => ({
                      label: r.role,
                      value: r.count,
                      color: ROLE_COLORS[r.role] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length],
                    }))}
                    centerTop="Users"
                    centerBig={stats.total.toLocaleString()}
                    size={180}
                    thickness={20}
                  />
                  {/* Legend */}
                  <div className="w-full space-y-1.5">
                    {stats.by_role.map((r, i) => (
                      <div key={r.role} className="flex items-center justify-between text-[11.5px]">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: ROLE_COLORS[r.role] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length] }}
                          />
                          <span className="truncate text-ink-700 dark:text-ink-300 capitalize">{r.role.replace("_", " ")}</span>
                        </div>
                        <span className="font-semibold tabular-nums text-ink-900 dark:text-white ml-2 shrink-0">
                          {r.count.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Activity summary strip */}
          {!statsLoading && stats && (
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Activity className="w-4 h-4 text-primary-600" />
                <h3 className="text-[13px] font-semibold text-ink-900 dark:text-white">Account health</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

                {/* Active rate */}
                <div className="space-y-2">
                  <div className="flex justify-between text-[12px]">
                    <span className="text-ink-500">Active rate</span>
                    <span className="font-semibold text-ink-900 dark:text-white">
                      {stats.total > 0 ? Math.round((stats.active / stats.total) * 100) : 0}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-ink-100 dark:bg-ink-700 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all duration-700"
                      style={{ width: `${stats.total > 0 ? (stats.active / stats.total) * 100 : 0}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-ink-400">{stats.active.toLocaleString()} of {stats.total.toLocaleString()} accounts</p>
                </div>

                {/* Password-change pending */}
                <div className="space-y-2">
                  <div className="flex justify-between text-[12px]">
                    <span className="text-ink-500">Password change pending</span>
                    <span className="font-semibold text-amber-600">
                      {stats.total > 0 ? Math.round((stats.must_change_pw / stats.total) * 100) : 0}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-ink-100 dark:bg-ink-700 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-amber-400 transition-all duration-700"
                      style={{ width: `${stats.total > 0 ? (stats.must_change_pw / stats.total) * 100 : 0}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-ink-400">{stats.must_change_pw.toLocaleString()} accounts need a reset</p>
                </div>

                {/* Never logged in */}
                <div className="space-y-2">
                  <div className="flex justify-between text-[12px]">
                    <span className="text-ink-500">Never logged in</span>
                    <span className="font-semibold text-red-500">
                      {stats.total > 0 ? Math.round((stats.never_logged_in / stats.total) * 100) : 0}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-ink-100 dark:bg-ink-700 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-red-400 transition-all duration-700"
                      style={{ width: `${stats.total > 0 ? (stats.never_logged_in / stats.total) * 100 : 0}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-ink-400">{stats.never_logged_in.toLocaleString()} accounts unused</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          TAB 2 — USERS LIST
      ══════════════════════════════════════════════════════ */}
      {tab === "list" && (
        <div className="card overflow-hidden">

          {/* Search + filters toolbar */}
          <div className="px-4 py-3 border-b hairline space-y-2.5">
            {/* Row 1: search + refresh */}
            <div className="flex flex-col md:flex-row gap-2.5 items-stretch md:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 w-3.5 h-3.5" />
                <input
                  type="text"
                  placeholder="Search by name, email or username…"
                  className="input pl-8"
                  value={search}
                  onChange={(e) => handleSearchChange(e.target.value)}
                />
              </div>
              <div className="flex gap-2 shrink-0">
                {activeFilterCount > 0 && (
                  <button onClick={clearFilters} className="btn-secondary btn-sm gap-1.5 text-red-500 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20">
                    <X className="w-3.5 h-3.5" />
                    Clear filters
                  </button>
                )}
                <button onClick={() => fetchData()} className="btn-secondary btn-sm shrink-0" title="Refresh">
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                  Refresh
                </button>
              </div>
            </div>

            {/* Row 2: filter dropdowns */}
            <div className="flex flex-wrap gap-2 items-center">
              <Filter className="w-3.5 h-3.5 text-ink-400 shrink-0" />

              <select
                className="input input-sm max-w-[160px]"
                value={filters.role_id ?? ""}
                onChange={(e) => handleFilterChange({ role_id: e.target.value === "" ? "" : Number(e.target.value) })}
              >
                <option value="">All roles</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>

              <select
                className="input input-sm max-w-[140px]"
                value={filters.status ?? ""}
                onChange={(e) => handleFilterChange({ status: e.target.value as UserFilters["status"] })}
              >
                <option value="">Any status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>

              <select
                className="input input-sm max-w-[150px]"
                value={filters.is_applicant ?? ""}
                onChange={(e) => handleFilterChange({ is_applicant: e.target.value as UserFilters["is_applicant"] })}
              >
                <option value="">All types</option>
                <option value="0">Regular users</option>
                <option value="1">Applicants only</option>
              </select>

              <select
                className="input input-sm max-w-[170px]"
                value={filters.must_change_pw ?? ""}
                onChange={(e) => handleFilterChange({ must_change_pw: e.target.value as UserFilters["must_change_pw"] })}
              >
                <option value="">Any password</option>
                <option value="1">Must change password</option>
                <option value="0">Password OK</option>
              </select>

              {totalUsers > 0 && (
                <span className="text-[11.5px] text-ink-400 ml-auto tabular-nums hidden sm:block">
                  {totalUsers.toLocaleString()} result{totalUsers !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>User details</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Assigned campus</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td><div className="h-8 w-44 bg-ink-100 dark:bg-ink-700 rounded" /></td>
                      <td><div className="h-5 w-20 bg-ink-100 dark:bg-ink-700 rounded-full" /></td>
                      <td><div className="h-5 w-14 bg-ink-100 dark:bg-ink-700 rounded-full" /></td>
                      <td><div className="h-5 w-24 bg-ink-100 dark:bg-ink-700 rounded-full" /></td>
                      <td><div className="h-6 w-12 ml-auto bg-ink-100 dark:bg-ink-700 rounded" /></td>
                    </tr>
                  ))
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-ink-500 text-[12.5px]">
                      {activeFilterCount > 0 || search
                        ? "No users match your search and filters."
                        : "No users found."}
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id} className="group">
                      <td>
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-700 dark:text-primary-300 font-semibold text-[11px] shrink-0 overflow-hidden">
                            {userService.photoUrl(user) ? (
                              <img
                                src={userService.photoUrl(user)!}
                                alt={user.full_name}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  const img = e.currentTarget as HTMLImageElement;
                                  img.style.display = "none";
                                  (img.nextElementSibling as HTMLElement | null)?.removeAttribute("style");
                                }}
                              />
                            ) : null}
                            <UserIcon className="w-4 h-4" style={userService.photoUrl(user) ? { display: "none" } : undefined} />
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-ink-900 dark:text-white truncate text-[12.5px]">
                              {user.full_name}
                            </div>
                            <div className="text-ink-500 text-[11px] flex items-center gap-1 mt-0.5">
                              <Mail className="w-2.5 h-2.5 shrink-0" />
                              <span className="truncate">{user.email}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="chip-primary">
                          <Shield className="w-2.5 h-2.5" />
                          {user.role_name}
                        </span>
                      </td>
                      <td>
                        <span className={user.is_active ? "chip-success" : "chip-danger"}>
                          {user.is_active ? <CheckCircle2 className="w-2.5 h-2.5" /> : <XCircle className="w-2.5 h-2.5" />}
                          {user.is_active ? "Active" : "Disabled"}
                        </span>
                      </td>
                      <td>
                        {user.campus_assignments && user.campus_assignments.length > 0 ? (
                          <div className="flex flex-wrap gap-1 max-w-[280px]">
                            {user.campus_assignments.map((c) => (
                              <span
                                key={c.id}
                                title={c.location ? `${c.name} — ${c.location}` : c.name}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-200 text-[11px] font-medium"
                              >
                                <Building2 className="w-2.5 h-2.5" />
                                {c.name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[11.5px] italic text-ink-400">All campuses</span>
                        )}
                      </td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          <button
                            onClick={() => toggleStatus(user)}
                            title={user.is_active ? "Deactivate" : "Activate"}
                            className={`p-1.5 rounded-md transition-colors ${
                              user.is_active
                                ? "text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                                : "text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                            }`}
                          >
                            <Power className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleOpenModal(user)} className="icon-btn" title="Edit">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-4 py-3 border-t hairline flex flex-col sm:flex-row items-center justify-between gap-2.5">
              <p className="text-[11.5px] text-ink-500 order-2 sm:order-1 tabular-nums">
                Showing{" "}
                <span className="font-semibold text-ink-700 dark:text-ink-200">
                  {((page - 1) * 15 + 1).toLocaleString()}–{Math.min(page * 15, totalUsers).toLocaleString()}
                </span>{" "}
                of <span className="font-semibold text-ink-700 dark:text-ink-200">{totalUsers.toLocaleString()}</span> users
              </p>
              <div className="flex items-center gap-1 order-1 sm:order-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11.5px] font-medium transition-colors disabled:opacity-30 bg-ink-50 dark:bg-ink-700 text-ink-600 dark:text-ink-300 hover:bg-ink-100 dark:hover:bg-ink-600 disabled:pointer-events-none"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Prev</span>
                </button>

                {buildPages(page, totalPages).map((p, idx) =>
                  p === "…" ? (
                    <span key={`e-${idx}`} className="w-7 text-center text-ink-400 text-[12px] select-none">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`w-8 h-8 rounded-lg text-[12px] font-semibold transition-colors ${
                        page === p
                          ? "bg-primary-600 text-white shadow-sm"
                          : "bg-ink-50 dark:bg-ink-700 text-ink-600 dark:text-ink-300 hover:bg-ink-100 dark:hover:bg-ink-600"
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}

                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11.5px] font-medium transition-colors disabled:opacity-30 bg-ink-50 dark:bg-ink-700 text-ink-600 dark:text-ink-300 hover:bg-ink-100 dark:hover:bg-ink-600 disabled:pointer-events-none"
                >
                  <span className="hidden sm:inline">Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <BulkAccountCreationModal
        open={showBulkModal}
        onClose={() => setShowBulkModal(false)}
        onSuccess={() => { fetchData(); fetchStats(); }}
      />

      {showModal && (
        <ModalPortal>
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-in fade-in">
            <div className="absolute inset-0 bg-ink-900/60 backdrop-blur-sm" onClick={() => setShowModal(false)} />
            <div className="relative w-full max-w-md card overflow-hidden animate-in">
              <div className="px-5 py-3.5 border-b hairline flex justify-between items-center">
                <div className="min-w-0">
                  <h2 className="text-[14px] font-semibold text-ink-900 dark:text-white">
                    {editingUser ? "Edit user account" : "Register new user"}
                  </h2>
                  <p className="section-sub mt-0.5">
                    {editingUser ? "Modify account details and permissions." : "Create a new system user with a specific role."}
                  </p>
                </div>
                <button onClick={() => setShowModal(false)} className="icon-btn" aria-label="Close">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-5 space-y-3.5">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Full name</label>
                    <input required type="text" className="input" placeholder="e.g. John Doe"
                      value={formData.full_name}
                      onChange={(e) => setFormData({ ...formData, full_name: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Username</label>
                    <input required type="text" className="input" placeholder="e.g. john_doe"
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })} />
                  </div>
                </div>

                <div>
                  <label className="label">Email address</label>
                  <input required type="email" className="input" placeholder="john@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Assign role</label>
                    <select required className="input" value={formData.role_id}
                      onChange={(e) => setFormData({ ...formData, role_id: e.target.value })}>
                      <option value="">Select role…</option>
                      {roles.map((role) => (
                        <option key={role.id} value={role.id}>{role.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">{editingUser ? "New password" : "Password"}</label>
                    <input required={!editingUser} type="password" className="input"
                      placeholder={editingUser ? "Leave blank to keep current" : "Minimum 6 characters"}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })} />
                  </div>
                </div>

                {editingUser && (
                  <div className="pt-2 mt-2 border-t hairline">
                    <div className="flex items-center gap-2 mb-2">
                      <Building2 className="w-3.5 h-3.5 text-primary-600" />
                      <h3 className="text-[12.5px] font-semibold text-ink-900 dark:text-white">Campus assignments</h3>
                    </div>
                    <p className="text-[11px] text-ink-500 mb-2.5">
                      Restrict this user to applications belonging to the campus(es) below.
                      Leave empty for unrestricted access.
                    </p>

                    {userCampuses.length === 0 ? (
                      <p className="text-[11.5px] text-ink-500 italic mb-2">No campuses assigned yet.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 mb-2.5">
                        {userCampuses.map((c) => (
                          <span
                            key={c.assignment_id}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-200 text-[11.5px] font-medium"
                          >
                            <Building2 className="w-3 h-3" />
                            {c.name}
                            {c.code && <span className="text-[10px] opacity-70">({c.code})</span>}
                            <button
                              type="button"
                              onClick={() => handleRevokeCampus(c.id)}
                              disabled={campusAssignmentBusy}
                              className="ml-0.5 text-primary-700/70 hover:text-red-600 disabled:opacity-50"
                              title={`Remove ${c.name}`}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    <select
                      className="input text-[12px]"
                      value={selectedCampusToAdd}
                      onChange={(e) => {
                        const v = e.target.value;
                        // Auto-assign as soon as a campus is picked — no
                        // separate Add click required, so users can't forget
                        // to commit before clicking Save changes.
                        if (v) {
                          handleAssignCampus(v);
                        } else {
                          setSelectedCampusToAdd("");
                        }
                      }}
                      disabled={campusAssignmentBusy}
                    >
                      <option value="">+ Add a campus…</option>
                      {allCampuses
                        .filter((c) => !userCampuses.some((uc) => uc.id === c.id))
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}{c.code ? ` (${c.code})` : ""}
                          </option>
                        ))}
                    </select>
                    <p className="text-[10.5px] text-ink-400 mt-1">
                      Picking a campus assigns it immediately. Use the trash icon to remove.
                    </p>
                  </div>
                )}

                <div className="pt-2 flex gap-2 justify-end">
                  <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
                  <button type="submit" className="btn-primary">
                    {editingUser ? "Save changes" : "Create account"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}

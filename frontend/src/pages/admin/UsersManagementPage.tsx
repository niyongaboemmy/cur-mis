import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  UserPlus,
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
} from "lucide-react";
import userService, { User } from "@/services/userService";
import { rbacService, Role } from "@/services/rbacService";
import { toast } from "react-hot-toast";
import ModalPortal from "@/components/ui/ModalPortal";

export default function UsersManagementPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    username: "",
    password: "",
    role_id: "",
  });

  const searchTimeout = useRef<NodeJS.Timeout | null>(null);
  const abortController = useRef<AbortController | null>(null);

  const fetchData = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      try {
        const [userRes, roleRes] = await Promise.all([
          userService.getUsers(page, search, 15, signal),
          rbacService.getRoles(signal),
        ]);
        setUsers(userRes.data?.data || []);
        setTotalPages(userRes.data?.last_page || 1);
        setRoles(roleRes.data || []);
      } catch (error: any) {
        if (error.name === "CanceledError" || error.name === "AbortError") return;
        toast.error("Failed to load user management data");
      } finally {
        setLoading(false);
      }
    },
    [page, search],
  );

  useEffect(() => {
    if (abortController.current) abortController.current.abort();
    abortController.current = new AbortController();

    const delay = search ? 300 : 0;
    if (searchTimeout.current) clearTimeout(searchTimeout.current);

    searchTimeout.current = setTimeout(() => {
      fetchData(abortController.current?.signal);
    }, delay);

    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
      if (abortController.current) abortController.current.abort();
    };
  }, [fetchData, search]);

  const handleOpenModal = (user: User | null = null) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        full_name: user.full_name,
        email: user.email,
        username: user.username,
        password: "",
        role_id: user.role_id.toString(),
      });
    } else {
      setEditingUser(null);
      setFormData({ full_name: "", email: "", username: "", password: "", role_id: "" });
    }
    setShowModal(true);
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
        <button
          onClick={() => handleOpenModal()}
          className="btn-primary shrink-0"
        >
          <UserPlus className="w-3.5 h-3.5" />
          Register new user
        </button>
      </div>

      {/* Table card */}
      <div className="card overflow-hidden">
        {/* Toolbar */}
        <div className="px-4 py-3 border-b hairline flex flex-col md:flex-row gap-2.5 justify-between items-stretch md:items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 w-3.5 h-3.5" />
            <input
              type="text"
              placeholder="Search by name, email or username…"
              className="input pl-8"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <button
            onClick={() => fetchData()}
            className="btn-secondary btn-sm shrink-0"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>User details</th>
                <th>Role</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td><div className="h-8 w-44 bg-ink-100 dark:bg-ink-700 rounded" /></td>
                    <td><div className="h-5 w-20 bg-ink-100 dark:bg-ink-700 rounded-full" /></td>
                    <td><div className="h-5 w-14 bg-ink-100 dark:bg-ink-700 rounded-full" /></td>
                    <td><div className="h-6 w-12 ml-auto bg-ink-100 dark:bg-ink-700 rounded" /></td>
                  </tr>
                ))
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-10 text-ink-500 text-[12.5px]">
                    No users found matching your search.
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="group">
                    <td>
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-700 dark:text-primary-300 font-semibold text-[11px] shrink-0">
                          {user.full_name.charAt(0).toUpperCase()}
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
                        {user.is_active ? (
                          <CheckCircle2 className="w-2.5 h-2.5" />
                        ) : (
                          <XCircle className="w-2.5 h-2.5" />
                        )}
                        {user.is_active ? "Active" : "Disabled"}
                      </span>
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
                        <button
                          onClick={() => handleOpenModal(user)}
                          className="icon-btn"
                          title="Edit"
                        >
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
          <div className="px-4 py-3 border-t hairline flex items-center justify-between gap-2">
            <p className="text-[11px] text-ink-500">
              Page <span className="font-semibold text-ink-700 dark:text-ink-200">{page}</span> of {totalPages}
            </p>
            <div className="flex gap-1">
              {Array.from({ length: totalPages }).map((_, i) => (
                <button
                  key={i + 1}
                  onClick={() => setPage(i + 1)}
                  className={`w-7 h-7 rounded-md text-[11.5px] font-semibold transition-colors ${
                    page === i + 1
                      ? "bg-primary-600 text-white"
                      : "bg-ink-50 dark:bg-ink-700 text-ink-600 dark:text-ink-300 hover:bg-ink-100 dark:hover:bg-ink-600"
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <ModalPortal>
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-in fade-in">
          <div
            className="absolute inset-0 bg-ink-900/60 backdrop-blur-sm"
            onClick={() => setShowModal(false)}
          />
          <div className="relative w-full max-w-md card overflow-hidden animate-in">
            <div className="px-5 py-3.5 border-b hairline flex justify-between items-center">
              <div className="min-w-0">
                <h2 className="text-[14px] font-semibold text-ink-900 dark:text-white">
                  {editingUser ? "Edit user account" : "Register new user"}
                </h2>
                <p className="section-sub mt-0.5">
                  {editingUser
                    ? "Modify account details and permissions."
                    : "Create a new system user with a specific role."}
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="icon-btn"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Full name</label>
                  <input
                    required
                    type="text"
                    className="input"
                    placeholder="e.g. John Doe"
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">Username</label>
                  <input
                    required
                    type="text"
                    className="input"
                    placeholder="e.g. john_doe"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="label">Email address</label>
                <input
                  required
                  type="email"
                  className="input"
                  placeholder="john@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Assign role</label>
                  <select
                    required
                    className="input"
                    value={formData.role_id}
                    onChange={(e) => setFormData({ ...formData, role_id: e.target.value })}
                  >
                    <option value="">Select role…</option>
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>{role.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">{editingUser ? "New password" : "Password"}</label>
                  <input
                    required={!editingUser}
                    type="password"
                    className="input"
                    placeholder={editingUser ? "Leave blank to keep current" : "Minimum 6 characters"}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  />
                </div>
              </div>

              <div className="pt-2 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
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

import React, { useEffect, useRef, useState } from "react";
import { rbacService, Role, PermissionCategory } from "@/services/rbacService";
import {
  Shield,
  Plus,
  Edit,
  Trash2,
  X,
  Check,
  Lock,
  Search,
  Users,
  Activity,
} from "lucide-react";
import toast from "react-hot-toast";

export default function RolesManagementPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [categories, setCategories] = useState<PermissionCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [roleForm, setRoleForm] = useState({ name: "", description: "" });

  const [isPermsOpen, setIsPermsOpen] = useState(false);
  const [selectedRoleForPerms, setSelectedRoleForPerms] = useState<Role | null>(
    null,
  );
  const [selectedPerms, setSelectedPerms] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState<number | "all">(
    "all",
  );

  // Roles list management
  const [rolesSearchQuery, setRolesSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "users">("name");

  const abortController = useRef<AbortController | null>(null);

  useEffect(() => {
    fetchData();
    return () => abortController.current?.abort();
  }, []);

  const fetchData = async () => {
    if (abortController.current) abortController.current.abort();
    abortController.current = new AbortController();

    setLoading(true);
    try {
      const [rolesRes, permsRes] = await Promise.all([
        rbacService.getRoles(abortController.current.signal),
        rbacService.getPermissions(abortController.current.signal),
      ]);
      setRoles((rolesRes.data as any) || rolesRes || []);
      setCategories((permsRes.data as any) || permsRes || []);
    } catch (err: any) {
      if (err.name === "CanceledError" || err.name === "AbortError") return;
      toast.error("Failed to load roles");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const openForm = (role?: Role) => {
    if (role) {
      setEditingRole(role);
      setRoleForm({ name: role.name, description: role.description || "" });
    } else {
      setEditingRole(null);
      setRoleForm({ name: "", description: "" });
    }
    setIsModalOpen(true);
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingRole) {
        await rbacService.updateRole(editingRole.id, roleForm);
        toast.success("Role updated successfully");
      } else {
        await rbacService.createRole(roleForm);
        toast.success("Role created successfully");
      }
      setIsModalOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to save role");
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this role?")) return;
    try {
      await rbacService.deleteRole(id);
      toast.success("Role deleted");
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to delete role");
    }
  };

  const openPerms = (role: Role) => {
    setSelectedRoleForPerms(role);
    // Find all permission IDs that match the role's current string slugs
    if (role.permissions && categories.length > 0) {
      const allPerms = categories.flatMap((c) => c.permissions || []);
      const matchedIds = role.permissions
        .map((slug) => allPerms.find((p) => p.slug === slug)?.id)
        .filter(Boolean) as number[];
      setSelectedPerms(matchedIds);
    } else {
      setSelectedPerms([]);
    }
    setIsPermsOpen(true);
  };

  const togglePerm = (permId: number) => {
    setSelectedPerms((prev) =>
      prev.includes(permId)
        ? prev.filter((id) => id !== permId)
        : [...prev, permId],
    );
  };

  const handleSavePerms = async () => {
    if (!selectedRoleForPerms) return;
    try {
      await rbacService.assignRolePermissions(
        selectedRoleForPerms.id,
        selectedPerms,
      );
      toast.success("Permissions updated successfully");
      setIsPermsOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(
        err.response?.data?.message || "Failed to assign permissions",
      );
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center animate-pulse text-gray-500">
        Loading roles...
      </div>
    );
  }

  const allPermissions = categories.flatMap((cat) => cat.permissions || []);

  const filteredRoles = roles
    .filter(
      (role) =>
        role.name.toLowerCase().includes(rolesSearchQuery.toLowerCase()) ||
        role.description
          ?.toLowerCase()
          .includes(rolesSearchQuery.toLowerCase()),
    )
    .sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "users") return (b.user_count || 0) - (a.user_count || 0);
      return 0;
    });

  const totalAssignedUsers = roles.reduce(
    (acc, r) => acc + (r.user_count || 0),
    0,
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Top Header & Quick Stats */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary-600 flex items-center justify-center text-white">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
                Roles Management
              </h1>
              <p className="text-sm text-gray-500 font-medium">
                Configure access levels and permission matrices.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full xl:w-auto">
          {[
            {
              label: "Total Roles",
              value: roles.length,
              icon: Shield,
              color: "text-primary-600",
              bg: "bg-primary-50 dark:bg-primary-900/20",
            },
            {
              label: "Assigned Users",
              value: totalAssignedUsers,
              icon: Users,
              color: "text-indigo-600",
              bg: "bg-indigo-50 dark:bg-indigo-900/20",
            },
            {
              label: "Total Perms",
              value: allPermissions.length,
              icon: Lock,
              color: "text-amber-600",
              bg: "bg-amber-50 dark:bg-amber-900/20",
            },
          ].map((stat, i) => (
            <div
              key={i}
              className="flex items-center gap-4 px-6 py-4 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700"
            >
              <div
                className={`w-10 h-10 rounded-xl ${stat.bg} ${stat.color} flex items-center justify-center`}
              >
                <stat.icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  {stat.label}
                </p>
                <p className="text-xl font-black text-gray-900 dark:text-white">
                  {stat.value}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white/50 dark:bg-gray-800/50 backdrop-blur-md p-4 rounded-3xl border border-white/20 dark:border-gray-700/30">
        <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
          <div className="relative w-full md:w-80 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-primary-500 transition-colors" />
            <input
              type="text"
              placeholder="Search roles by name or description..."
              value={rolesSearchQuery}
              onChange={(e) => setRolesSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-gray-100 dark:bg-gray-900 border-transparent focus:bg-white dark:focus:bg-gray-800 focus:ring-2 focus:ring-primary-500/20 rounded-2xl text-sm transition-all outline-none font-medium"
            />
          </div>

          <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-900 p-1 rounded-2xl w-full md:w-auto">
            <button
              onClick={() => setSortBy("name")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${sortBy === "name" ? "bg-white dark:bg-gray-800 text-primary-600" : "text-gray-500 hover:text-gray-700"}`}
            >
              Sort by Name
            </button>
            <button
              onClick={() => setSortBy("users")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${sortBy === "users" ? "bg-white dark:bg-gray-800 text-primary-600" : "text-gray-500 hover:text-gray-700"}`}
            >
              Sort by Users
            </button>
          </div>
        </div>

        <button
          onClick={() => openForm()}
          className="w-full md:w-auto flex items-center justify-center gap-3 px-8 py-3.5 bg-primary-600 hover:bg-primary-700 text-white rounded-2xl transition-all duration-300 font-bold text-sm"
        >
          <Plus className="w-5 h-5" />
          <span>Create New Role</span>
        </button>
      </div>

      {/* Role Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
        {filteredRoles.map((role) => (
          <div
            key={role.id}
            className="group relative bg-white dark:bg-gray-800 rounded-[2rem] p-8 border border-gray-100 dark:border-gray-700 transition-all duration-500 flex flex-col h-full overflow-hidden"
          >
            {/* Hover actions */}
            <div className="absolute top-6 right-6 flex gap-2 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300 z-10">
              <button
                onClick={() => openForm(role)}
                className="w-10 h-10 rounded-xl bg-white dark:bg-gray-700 border border-gray-100 dark:border-gray-600 flex items-center justify-center text-gray-500 hover:text-primary-600 transition-colors"
                title="Edit Role"
              >
                <Edit className="w-4 h-4" />
              </button>
              {role.name !== "superadmin" && (
                <button
                  onClick={() => handleDelete(role.id)}
                  className="w-10 h-10 rounded-xl bg-white dark:bg-gray-700 border border-gray-100 dark:border-gray-600 flex items-center justify-center text-gray-500 hover:text-red-600 transition-colors"
                  title="Delete Role"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Role Header */}
            <div className="flex items-center gap-5 mb-6">
              <div className="w-16 h-16 rounded-[1.25rem] bg-gradient-to-br from-primary-500 to-indigo-600 flex items-center justify-center text-white transform group-hover:scale-110 group-hover:rotate-3 transition-transform duration-500">
                <Shield className="w-8 h-8" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white capitalize truncate pr-12">
                  {role.name}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-lg">
                    <Users className="w-3 h-3" />
                    {role.user_count || 0}{" "}
                    {role.user_count === 1 ? "User" : "Users"}
                  </span>
                </div>
              </div>
            </div>

            <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-3 font-medium leading-relaxed mb-8 flex-1">
              {role.description ||
                "No specific description has been provided for this system role."}
            </p>

            {/* Permissions Summary */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  Permissions
                </span>
                <span className="text-[10px] font-black text-primary-600">
                  {Math.round(
                    ((role.permissions?.length || 0) /
                      (allPermissions.length || 1)) *
                      100,
                  )}
                  %
                </span>
              </div>

              <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary-500 to-indigo-600 rounded-full transition-all duration-1000 ease-out group-hover:scale-x-105"
                  style={{
                    width: `${Math.min(100, Math.max(5, ((role.permissions?.length || 0) / (allPermissions.length || 1)) * 100))}%`,
                  }}
                />
              </div>

              <div className="flex items-center justify-between gap-3 pt-2">
                <div className="flex -space-x-2">
                  {(role.permissions || []).slice(0, 3).map((p, idx) => (
                    <div
                      key={idx}
                      className="w-8 h-8 rounded-full bg-white dark:bg-gray-700 border-2 border-gray-50 dark:border-gray-800 flex items-center justify-center"
                      title={p}
                    >
                      <Lock className="w-3.5 h-3.5 text-gray-400" />
                    </div>
                  ))}
                  {(role.permissions?.length || 0) > 3 && (
                    <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 border-2 border-white dark:border-gray-800 flex items-center justify-center text-[10px] font-bold text-gray-500">
                      +{(role.permissions?.length || 0) - 3}
                    </div>
                  )}
                  {(role.permissions?.length || 0) === 0 && (
                    <span className="text-[10px] font-bold text-gray-300 italic">
                      None assigned
                    </span>
                  )}
                </div>

                <button
                  onClick={() => openPerms(role)}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-50 hover:bg-primary-600 dark:bg-gray-900 dark:hover:bg-primary-600 text-gray-600 hover:text-white dark:text-gray-400 dark:hover:text-white rounded-xl transition-all duration-300 font-bold text-[10px]"
                >
                  <Activity className="w-3.5 h-3.5" />
                  Manage Perms
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {filteredRoles.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 px-4 text-center bg-white dark:bg-gray-800 rounded-[3rem] border border-gray-100 dark:border-gray-700">
          <div className="w-24 h-24 rounded-full bg-gray-50 dark:bg-gray-900 flex items-center justify-center text-gray-300 mb-6">
            <Shield className="w-12 h-12 opacity-20" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            No roles found
          </h3>
          <p className="text-gray-500 max-w-xs mx-auto text-sm font-medium">
            We couldn't find any roles matching "{rolesSearchQuery}". Try
            adjusting your filters.
          </p>
          <button
            onClick={() => setRolesSearchQuery("")}
            className="mt-6 text-primary-600 font-bold hover:underline"
          >
            Clear all filters
          </button>
        </div>
      )}

      {/* Role Form Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-md border border-gray-100 dark:border-gray-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editingRole ? "Edit Role" : "Create New Role"}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveRole} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Role Name
                </label>
                <input
                  autoFocus
                  required
                  value={roleForm.name}
                  onChange={(e) =>
                    setRoleForm({ ...roleForm, name: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all outline-none"
                  placeholder="e.g. manager"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description
                </label>
                <textarea
                  value={roleForm.description}
                  onChange={(e) =>
                    setRoleForm({ ...roleForm, description: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all outline-none min-h-[100px]"
                  placeholder="Optional description"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white transition-colors font-medium"
                >
                  Save Role
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Permissions Assignment Modal */}
      {isPermsOpen && selectedRoleForPerms && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md transition-all duration-300">
          <div className="bg-white dark:bg-gray-900 rounded-[2rem] w-full max-w-6xl overflow-hidden flex flex-col h-[85vh] animate-in fade-in zoom-in duration-300 border border-white/20">
            {/* Modal Header */}
            <div className="px-8 py-6 border-b border-gray-100 dark:border-gray-800 flex flex-col md:flex-row justify-between items-center gap-4 bg-white/50 dark:bg-gray-900/50 backdrop-blur-xl">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400">
                  <Lock className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    Permissions —{" "}
                    <span className="bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 px-3 py-1 rounded-lg text-sm font-semibold capitalize tracking-wide">
                      {selectedRoleForPerms.name}
                    </span>
                  </h3>
                  <p className="text-xs text-gray-500 mt-1 font-medium">
                    {selectedPerms.length} permissions assigned to this role
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 w-full md:w-auto">
                <div className="relative flex-1 md:w-80">
                  <X
                    className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 cursor-pointer hover:text-gray-600 transition-colors ${searchQuery ? "opacity-100" : "opacity-0 pointer-events-none"}`}
                    onClick={() => setSearchQuery("")}
                  />
                  <input
                    type="text"
                    placeholder="Search permissions..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-4 pr-10 py-2.5 bg-gray-100 dark:bg-gray-800 border-transparent focus:bg-white dark:focus:bg-gray-700 focus:ring-2 focus:ring-primary-500/20 rounded-2xl text-sm transition-all outline-none font-medium"
                  />
                </div>
                <button
                  onClick={() => setIsPermsOpen(false)}
                  className="p-2.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-2xl transition-all duration-300"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
              {/* Sidebar Categories */}
              <div className="w-72 border-r border-gray-100 dark:border-gray-800 bg-gray-50/30 dark:bg-gray-900/30 overflow-y-auto p-4 hidden lg:block">
                <div className="space-y-1">
                  <button
                    onClick={() => setActiveCategoryId("all")}
                    className={`w-full text-left px-4 py-3 rounded-2xl text-sm font-semibold transition-all duration-300 flex items-center justify-between group ${
                      activeCategoryId === "all"
                        ? "bg-primary-600 text-white translate-x-1"
                        : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <Shield
                        className={`w-4 h-4 ${activeCategoryId === "all" ? "text-white" : "text-gray-400 group-hover:text-primary-500"}`}
                      />
                      All Categories
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full ${activeCategoryId === "all" ? "bg-white/20 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-500"}`}
                    >
                      {categories.reduce(
                        (acc, c) => acc + (c.permissions?.length || 0),
                        0,
                      )}
                    </span>
                  </button>

                  <div className="pt-4 pb-2 px-4">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                      Modules
                    </span>
                  </div>

                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setActiveCategoryId(cat.id)}
                      className={`w-full text-left px-4 py-3 rounded-2xl text-sm font-semibold transition-all duration-300 flex items-center justify-between group ${
                        activeCategoryId === cat.id
                          ? "bg-white dark:bg-gray-800 text-primary-600 dark:text-primary-400 border border-gray-100 dark:border-gray-700 translate-x-1"
                          : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                      }`}
                    >
                      <span className="flex items-center gap-3 truncate pr-2">
                        <div
                          className={`w-1.5 h-1.5 rounded-full transition-colors ${activeCategoryId === cat.id ? "bg-primary-500" : "bg-gray-300 dark:bg-gray-600 group-hover:bg-primary-400"}`}
                        />
                        {cat.name}
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full ${activeCategoryId === cat.id ? "bg-primary-50 text-primary-600" : "bg-gray-200 dark:bg-gray-700 text-gray-500"}`}
                      >
                        {cat.permissions?.length || 0}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Permissions Grid */}
              <div className="flex-1 overflow-y-auto p-8 bg-gray-50/20 dark:bg-black/10">
                {categories
                  .filter(
                    (cat) =>
                      activeCategoryId === "all" || cat.id === activeCategoryId,
                  )
                  .map((cat) => {
                    const filteredPerms = (cat.permissions || []).filter(
                      (p) =>
                        p.name
                          .toLowerCase()
                          .includes(searchQuery.toLowerCase()) ||
                        p.slug
                          .toLowerCase()
                          .includes(searchQuery.toLowerCase()),
                    );

                    if (searchQuery && filteredPerms.length === 0) return null;

                    const allCatSelected =
                      filteredPerms.length > 0 &&
                      filteredPerms.every((p) => selectedPerms.includes(p.id));

                    return (
                      <div key={cat.id} className="mb-12 last:mb-0">
                        <div className="flex items-center justify-between mb-6 pb-2 border-b border-gray-100 dark:border-gray-800/50">
                          <div className="flex items-center gap-3">
                            <h4 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                              {cat.name}
                            </h4>
                            <span className="text-[10px] px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-500 rounded-full font-bold">
                              {filteredPerms.length} PERMS
                            </span>
                          </div>
                          <button
                            onClick={() => {
                              const pids = filteredPerms.map((p) => p.id);
                              if (allCatSelected) {
                                setSelectedPerms((prev) =>
                                  prev.filter((id) => !pids.includes(id)),
                                );
                              } else {
                                setSelectedPerms((prev) =>
                                  Array.from(new Set([...prev, ...pids])),
                                );
                              }
                            }}
                            className={`text-[10px] font-bold px-3 py-1.5 rounded-xl transition-all duration-300 ${
                              allCatSelected
                                ? "bg-red-50 text-red-600 hover:bg-red-100"
                                : "bg-primary-50 text-primary-600 hover:bg-primary-100"
                            }`}
                          >
                            {allCatSelected
                              ? "Deselect Category"
                              : "Select Category"}
                          </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                          {filteredPerms.map((perm) => {
                            const isSelected = selectedPerms.includes(perm.id);
                            return (
                              <div
                                key={perm.id}
                                onClick={() => togglePerm(perm.id)}
                                className={`group cursor-pointer p-5 rounded-2xl border-2 transition-all duration-300 relative overflow-hidden ${
                                  isSelected
                                    ? "border-primary-500 bg-primary-50/50 dark:bg-primary-900/10 ring-4 ring-primary-500/5"
                                    : "border-gray-100 dark:border-gray-800 hover:border-primary-200 dark:hover:border-primary-800"
                                }`}
                              >
                                {isSelected && (
                                  <div className="absolute top-0 right-0 w-12 h-12 bg-primary-500 text-white flex items-center justify-center rounded-bl-3xl animate-in slide-in-from-top-right duration-300">
                                    <Check className="w-5 h-5 stroke-[3]" />
                                  </div>
                                )}
                                <div className="space-y-3">
                                  <div className="pr-8">
                                    <h5
                                      className={`font-bold text-sm transition-colors ${isSelected ? "text-primary-700 dark:text-primary-300" : "text-gray-800 dark:text-gray-100 group-hover:text-primary-600"}`}
                                    >
                                      {perm.name}
                                    </h5>
                                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 line-clamp-2 leading-relaxed">
                                      {perm.description ||
                                        `Allows access to ${perm.name.toLowerCase()} features.`}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`text-[9px] font-bold px-2 py-0.5 rounded-lg font-mono uppercase tracking-tight ${
                                        isSelected
                                          ? "bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400"
                                          : "bg-gray-100 dark:bg-gray-800 text-gray-400 group-hover:text-primary-400"
                                      }`}
                                    >
                                      {perm.slug}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}

                {categories.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                    <div className="w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400">
                      <Lock className="w-10 h-10 opacity-20" />
                    </div>
                    <div>
                      <p className="text-gray-900 dark:text-white font-bold text-lg">
                        No permissions found
                      </p>
                      <p className="text-gray-500 text-sm">
                        Please register some permissions in the system settings
                        first.
                      </p>
                    </div>
                  </div>
                )}

                {searchQuery &&
                  categories.every(
                    (cat) =>
                      (cat.permissions || []).filter(
                        (p) =>
                          p.name
                            .toLowerCase()
                            .includes(searchQuery.toLowerCase()) ||
                          p.slug
                            .toLowerCase()
                            .includes(searchQuery.toLowerCase()),
                      ).length === 0,
                  ) && (
                    <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                      <div className="w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400">
                        <Shield className="w-10 h-10 opacity-20" />
                      </div>
                      <div>
                        <p className="text-gray-900 dark:text-white font-bold text-lg">
                          No results for "{searchQuery}"
                        </p>
                        <p className="text-gray-500 text-sm">
                          Try adjusting your search terms or filters.
                        </p>
                        <button
                          onClick={() => setSearchQuery("")}
                          className="mt-4 text-primary-600 font-bold hover:underline"
                        >
                          Clear search
                        </button>
                      </div>
                    </div>
                  )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-8 border-t border-gray-100 dark:border-gray-800 bg-white/50 dark:bg-gray-900/50 backdrop-blur-xl flex flex-col sm:flex-row justify-between items-center gap-6">
              <div className="flex items-center gap-6">
                <div className="flex -space-x-2">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="w-8 h-8 rounded-full bg-primary-50 dark:bg-primary-900/20 border-2 border-white dark:border-gray-900 flex items-center justify-center"
                    >
                      <Shield className="w-3.5 h-3.5 text-primary-500" />
                    </div>
                  ))}
                </div>
                <div className="text-xs">
                  <span className="block font-bold text-gray-900 dark:text-white">
                    {selectedPerms.length} Selected
                  </span>
                  <span className="text-gray-500 font-medium">
                    Total permissions: {allPermissions.length}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button
                  onClick={() => setIsPermsOpen(false)}
                  className="flex-1 sm:flex-none px-8 py-3 rounded-2xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all duration-300 font-bold text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSavePerms}
                  className="flex-1 sm:flex-none px-8 py-3 rounded-2xl bg-primary-600 hover:bg-primary-700 text-white transition-all duration-300 font-bold text-sm flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  Apply Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

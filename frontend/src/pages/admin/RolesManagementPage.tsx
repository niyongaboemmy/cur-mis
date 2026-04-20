import React, { useEffect, useRef, useState } from "react";
import { rbacService, Role, PermissionCategory } from "@/services/rbacService";
import { Shield, Plus, Edit, Trash2, X, Check, Lock } from "lucide-react";
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

  const allPermissions = categories.flatMap((c) => c.permissions || []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-primary-600 to-indigo-600 bg-clip-text text-transparent flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary-600" />
            Roles Management
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Manage system roles and their configurations.
          </p>
        </div>
        <button
          onClick={() => openForm()}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary-600 to-primary-500 hover:from-primary-700 hover:to-primary-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-300"
        >
          <Plus className="w-4 h-4" />
          <span>New Role</span>
        </button>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {(Array.isArray(roles) ? roles : []).map((role) => (
          <div
            key={role.id}
            className="relative group bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="w-12 h-12 rounded-full bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center text-primary-600 dark:text-primary-400">
                <Shield className="w-6 h-6" />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => openPerms(role)}
                  className="px-3 py-1 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-full transition-colors"
                >
                  Manage Perms
                </button>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => openForm(role)}
                    className="p-1.5 text-gray-400 hover:text-primary-600 rounded-full hover:bg-primary-50 transition-colors"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  {role.name !== "superadmin" && (
                    <button
                      onClick={() => handleDelete(role.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 rounded-full hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white capitalize">
              {role.name}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 line-clamp-2">
              {role.description || "No description provided."}
            </p>

            <div className="mt-auto pt-4 border-t border-gray-100 dark:border-gray-700">
              <div className="flex flex-wrap gap-2">
                {role.permissions?.length ? (
                  role.permissions.slice(0, 3).map((perm) => (
                    <span
                      key={perm}
                      className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                    >
                      {allPermissions.find((p) => p.slug === perm)?.name ||
                        perm}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-gray-400 italic">
                    No permissions assigned
                  </span>
                )}
                {(role.permissions?.length || 0) > 3 && (
                  <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-500">
                    +{(role.permissions?.length || 0) - 3} more
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Role Form Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Lock className="w-5 h-5 text-primary-500" />
                Assign Permissions —{" "}
                <span className="capitalize text-primary-600">
                  {selectedRoleForPerms.name}
                </span>
              </h3>
              <button
                onClick={() => setIsPermsOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              {(Array.isArray(categories) ? categories : []).map((cat) => (
                <div key={cat.id}>
                  <h4 className="text-md font-bold text-gray-800 dark:text-gray-200 mb-4 pb-2 border-b border-gray-100 dark:border-gray-800">
                    {cat.name}
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {cat.permissions?.map((perm) => {
                      const isSelected = selectedPerms.includes(perm.id);
                      return (
                        <div
                          key={perm.id}
                          onClick={() => togglePerm(perm.id)}
                          className={`cursor-pointer p-4 rounded-xl border-2 transition-all ${
                            isSelected
                              ? "border-primary-500 bg-primary-50 dark:bg-primary-900/10"
                              : "border-gray-100 dark:border-gray-800 hover:border-primary-200"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-semibold text-gray-900 dark:text-white text-sm">
                              {perm.name}
                            </span>
                            <div
                              className={`w-5 h-5 rounded-full flex items-center justify-center ${isSelected ? "bg-primary-500 text-white" : "bg-gray-200 dark:bg-gray-700"}`}
                            >
                              {isSelected && <Check className="w-3 h-3" />}
                            </div>
                          </div>
                          <span className="text-xs bg-gray-200/50 dark:bg-gray-800 px-1.5 py-0.5 rounded font-mono text-gray-600 dark:text-gray-400">
                            {perm.slug}
                          </span>
                        </div>
                      );
                    })}
                    {!cat.permissions?.length && (
                      <div className="text-sm text-gray-400 italic">
                        No permissions defined yet.
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {categories.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No permission categories found. Please create some first.
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900 flex justify-end gap-3">
              <button
                onClick={() => setIsPermsOpen(false)}
                className="px-6 py-2 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePerms}
                className="px-6 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white transition-colors font-medium"
              >
                Apply Permissions
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

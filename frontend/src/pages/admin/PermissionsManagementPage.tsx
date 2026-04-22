import React, { useEffect, useRef, useState } from "react";
import {
  rbacService,
  PermissionCategory,
  Permission,
} from "@/services/rbacService";
import { Lock, Plus, Settings, X, Edit2, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

export default function PermissionsManagementPage() {
  const [categories, setCategories] = useState<PermissionCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<PermissionCategory | null>(null);
  const [catForm, setCatForm] = useState({ name: "", description: "" });

  const [isPermModalOpen, setIsPermModalOpen] = useState(false);
  const [editingPerm, setEditingPerm] = useState<Permission | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const [permForm, setPermForm] = useState({
    name: "",
    slug: "",
    description: "",
  });

  const abortController = useRef<AbortController | null>(null);

  useEffect(() => {
    fetchPermissions();
    return () => abortController.current?.abort();
  }, []);

  const fetchPermissions = async () => {
    if (abortController.current) abortController.current.abort();
    abortController.current = new AbortController();

    setLoading(true);
    try {
      const data = await rbacService.getPermissions(
        abortController.current.signal,
      );
      setCategories((data.data as any) || data || []);
    } catch (err: any) {
      if (err.name === "CanceledError" || err.name === "AbortError") return;
      toast.error("Failed to load permissions");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const openCatForm = (cat?: PermissionCategory) => {
    if (cat) {
      setEditingCat(cat);
      setCatForm({ name: cat.name, description: cat.description || "" });
    } else {
      setEditingCat(null);
      setCatForm({ name: "", description: "" });
    }
    setIsCatModalOpen(true);
  };

  const handleSaveCat = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingCat) {
        await rbacService.updateCategory(editingCat.id, catForm);
        toast.success("Category updated");
      } else {
        await rbacService.createCategory(catForm);
        toast.success("Category created");
      }
      setIsCatModalOpen(false);
      fetchPermissions();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to save category");
    }
  };

  const openPermForm = (catId: number, perm?: Permission) => {
    setActiveCategoryId(catId);
    if (perm) {
      setEditingPerm(perm);
      setPermForm({
        name: perm.name,
        slug: perm.slug,
        description: perm.description || "",
      });
    } else {
      setEditingPerm(null);
      setPermForm({ name: "", slug: "", description: "" });
    }
    setIsPermModalOpen(true);
  };

  const handleSavePerm = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingPerm) {
        await rbacService.updatePermission(editingPerm.id, permForm);
        toast.success("Permission updated");
      } else {
        await rbacService.createPermission({
          ...permForm,
          category_id: activeCategoryId!,
        });
        toast.success("Permission created");
      }
      setIsPermModalOpen(false);
      fetchPermissions();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to save permission");
    }
  };

  const handleDeletePerm = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this permission?"))
      return;
    try {
      await rbacService.deletePermission(id);
      toast.success("Deleted successfully");
      fetchPermissions();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to delete");
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center animate-pulse text-gray-500">
        Loading permissions...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent flex items-center gap-2">
            <Lock className="w-6 h-6 text-emerald-600" />
            Permissions Management
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Organize access control permissions logically.
          </p>
        </div>
        <button
          onClick={() => openCatForm()}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-300"
        >
          <Plus className="w-4 h-4" />
          <span>New Category</span>
        </button>
      </div>

      <div className="grid gap-6">
        {(Array.isArray(categories) ? categories : []).map((category) => (
          <div
            key={category.id}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50 flex justify-between items-center group">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Settings className="w-4 h-4 text-emerald-500" />
                  {category.name}
                  <button
                    onClick={() => openCatForm(category)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-emerald-600 transition-all rounded"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  {category.description}
                </p>
              </div>
              <button
                onClick={() => openPermForm(category.id)}
                className="text-sm font-medium text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-full transition-colors flex items-center gap-1"
              >
                <Plus className="w-4 h-4" /> Add Permission
              </button>
            </div>
            <div className="p-6">
              {category.permissions?.length ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {category.permissions.map((perm) => (
                    <div
                      key={perm.id}
                      className="group p-4 rounded-xl border border-gray-100 dark:border-gray-700 hover:border-emerald-200 dark:hover:border-emerald-800 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/20 transition-all relative"
                    >
                      <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openPermForm(category.id, perm)}
                          className="text-gray-400 hover:text-emerald-600"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeletePerm(perm.id)}
                          className="text-gray-400 hover:text-red-500"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="font-semibold text-gray-900 dark:text-gray-100 text-sm pr-12">
                        {perm.name}
                      </div>
                      <div className="text-xs font-mono text-emerald-700 dark:text-emerald-400 mt-1 mb-2 bg-emerald-100/50 dark:bg-emerald-900/50 inline-block px-1.5 py-0.5 rounded border border-emerald-200/50 dark:border-emerald-800">
                        {perm.slug}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                        {perm.description}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-sm text-gray-400 italic">
                  No permissions in this category.
                </div>
              )}
            </div>
          </div>
        ))}
        {categories.length === 0 && (
          <div className="p-12 text-center text-gray-500 bg-white dark:bg-gray-800 rounded-2xl border border-dashed border-gray-300 dark:border-gray-700">
            No categories created yet. Click "New Category" to begin building
            your permission matrix.
          </div>
        )}
      </div>

      {/* Category Modal */}
      {isCatModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editingCat ? "Edit Category" : "Create Category"}
              </h3>
              <button
                onClick={() => setIsCatModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveCat} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Name
                </label>
                <input
                  autoFocus
                  required
                  value={catForm.name}
                  onChange={(e) =>
                    setCatForm({ ...catForm, name: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all outline-none"
                  placeholder="e.g. Finance Module"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description
                </label>
                <textarea
                  value={catForm.description}
                  onChange={(e) =>
                    setCatForm({ ...catForm, description: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsCatModalOpen(false)}
                  className="flex-1 px-4 py-2 rounded-xl border border-gray-300 hover:bg-gray-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Permission Modal */}
      {isPermModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editingPerm ? "Edit Permission" : "Add Permission"}
              </h3>
              <button
                onClick={() => setIsPermModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSavePerm} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Permission Name
                </label>
                <input
                  autoFocus
                  required
                  value={permForm.name}
                  onChange={(e) =>
                    setPermForm({ ...permForm, name: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="e.g. View Invoices"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Slug (System Identifier)
                </label>
                <input
                  required
                  value={permForm.slug}
                  onChange={(e) =>
                    setPermForm({
                      ...permForm,
                      slug: e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9_]/g, "_"),
                    })
                  }
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 font-mono text-sm outline-none"
                  placeholder="e.g. view_invoices"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Must be unique, lowercase, underscores only.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description
                </label>
                <textarea
                  value={permForm.description}
                  onChange={(e) =>
                    setPermForm({ ...permForm, description: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsPermModalOpen(false)}
                  className="flex-1 px-4 py-2 rounded-xl border border-gray-300 hover:bg-gray-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

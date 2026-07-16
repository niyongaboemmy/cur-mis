import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Tag,
  Plus,
  Edit2,
  Trash2,
  Search,
  Package,
  Info,
} from "lucide-react";
import { expenseService } from "@/services/financeService";
import { toast } from "sonner";
import type { ExpenseCategory } from "@/types/finance";
import Modal from "@/components/ui/Modal";
import { PERMISSIONS } from "@/constants";
import { usePermission } from "@/utils/permissions";

export default function ExpenseCategoriesPage() {
  const canManage = usePermission(PERMISSIONS.MANAGE_FINANCE);
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Form State
  const [formData, setFormData] = useState({ name: "", description: "" });

  const { data: categoriesQ, isLoading } = useQuery({
    queryKey: ["finance", "expenses", "categories"],
    queryFn: () => expenseService.listCategories(),
  });

  const saveMutation = useMutation<any, Error, any>({
    mutationFn: async (data: any) => {
      if (editingId) {
        return expenseService.updateCategory(editingId, data);
      } else {
        return expenseService.createCategory(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["finance", "expenses", "categories"],
      });
      toast.success(editingId ? "Category updated" : "Category created");
      closeForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => expenseService.deleteCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["finance", "expenses", "categories"],
      });
      toast.success("Category deleted");
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || "Failed to delete category");
    },
  });

  const closeForm = () => {
    setFormData({ name: "", description: "" });
    setEditingId(null);
    setIsFormOpen(false);
  };

  const handleEdit = (c: ExpenseCategory) => {
    setFormData({ name: c.name, description: c.description || "" });
    setEditingId(c.id);
    setIsFormOpen(true);
  };

  const handleDelete = (id: number) => {
    if (
      confirm(
        "Are you sure you want to delete this category? This only works if no expenses are linked to it.",
      )
    ) {
      deleteMutation.mutate(id);
    }
  };

  const categories = categoriesQ?.data ?? [];
  const filtered = categories.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.description?.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="space-y-6 max-w-[1000px] mx-auto pb-12">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-ink-900 p-6 rounded-xl border border-ink-200 dark:border-ink-800 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-brand/10 text-brand rounded-lg">
            <Tag className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-ink-900 dark:text-ink-50">
              Expense Categories
            </h1>
            <p className="text-sm text-ink-500">
              Manage classification for institutional expenditures
            </p>
          </div>
        </div>
        {canManage && (
          <button
            onClick={() => setIsFormOpen(true)}
            className="btn btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New Category
          </button>
        )}
      </header>

      {/* Modal Form - using 'open' prop as per Modal.tsx */}
      <Modal
        open={isFormOpen}
        onClose={closeForm}
        title={editingId ? "Update Category" : "Create New Category"}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate(formData);
          }}
          className="space-y-4 pt-2"
        >
          <div className="space-y-1">
            <label className="text-xs font-semibold text-ink-600">
              Category Name *
            </label>
            <input
              required
              autoFocus
              type="text"
              className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-800 border-none rounded-md text-sm focus:ring-2 ring-brand"
              placeholder="e.g. Office Supplies"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-ink-600">
              Description
            </label>
            <textarea
              rows={3}
              className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-800 border-none rounded-md text-sm focus:ring-2 ring-brand resize-none"
              placeholder="Brief purpose of this category"
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-ink-100 dark:border-ink-800">
            <button
              type="button"
              onClick={closeForm}
              className="btn btn-secondary px-6"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary px-8"
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending
                ? "Saving..."
                : editingId
                  ? "Update Category"
                  : "Create Category"}
            </button>
          </div>
        </form>
      </Modal>

      <div className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-ink-100 dark:border-ink-800 bg-ink-50/30">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
            <input
              type="text"
              placeholder="Search categories..."
              className="w-full pl-9 pr-4 py-2 bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-800 rounded-lg text-sm shadow-sm focus:ring-2 ring-brand/20 outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="bg-ink-50/50 dark:bg-ink-800/50 border-b border-ink-200 dark:border-ink-800">
              <th className="px-6 py-4 font-semibold w-12">#</th>
              <th className="px-6 py-4 font-semibold">Category Name</th>
              <th className="px-6 py-4 font-semibold">Description</th>
              <th className="px-6 py-4 font-semibold text-center">In Use</th>
              <th className="px-6 py-4 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
            {isLoading ? (
              [...Array(6)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td colSpan={5} className="px-6 py-4 h-12 bg-ink-50/20" />
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-6 py-12 text-center text-ink-500 italic"
                >
                  No expense categories found.
                </td>
              </tr>
            ) : (
              filtered.map((c, idx) => (
                <tr
                  key={c.id}
                  className="hover:bg-ink-50/30 dark:hover:bg-ink-800/30 transition-colors group"
                >
                  <td className="px-6 py-4 text-ink-400 font-mono text-xs">
                    {idx + 1}
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-bold text-ink-900 dark:text-ink-50">
                      {c.name}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-ink-500 max-w-xs truncate">
                    {c.description || "—"}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex justify-center">
                      <div
                        className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          (c as any).expense_count > 0
                            ? "bg-blue-100 text-blue-700"
                            : "bg-ink-100 text-ink-500"
                        }`}
                      >
                        <Package className="w-3 h-3" />
                        {(c as any).expense_count || 0} Expenses
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {canManage && (
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleEdit(c)}
                        className="p-1.5 text-brand hover:bg-brand/10 rounded-md transition-colors"
                        title="Edit Category"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(c.id)}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded-md transition-colors"
                        title="Delete Category"
                        disabled={(c as any).expense_count > 0}
                      >
                        <Trash2
                          className={`w-4 h-4 ${(c as any).expense_count > 0 ? "opacity-30" : ""}`}
                        />
                      </button>
                    </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-start gap-4 p-4 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 rounded-lg text-sm border border-amber-100 dark:border-amber-800">
        <Info className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-bold">Usage Policy</p>
          <p className="mt-1">
            Categories cannot be deleted if they are already linked to recorded
            expenses. Modifying a category name will affect all historical
            records associated with that category.
          </p>
        </div>
      </div>
    </div>
  );
}

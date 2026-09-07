import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Download, FileText, Search, Loader2, Edit2, Trash2, Eye } from 'lucide-react'
import toast from 'react-hot-toast'
import PageHeader from '@/components/ui/PageHeader'
import Spinner from '@/components/ui/Spinner'
import { hrService } from '@/services/hrService'

interface Staff {
  employee_id: number
  employee_fname: string
  employee_lname: string
  employee_position: string
  employee_phone: string
  employee_post: string
  faculty: string
  employee_status: string
  account_status: string
  salary: number
}

export default function AllStaffPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const queryClient = useQueryClient()

  const [formData, setFormData] = useState({
    employee_fname: '',
    employee_lname: '',
    employee_position: '',
    employee_phone: '',
    employee_post: '',
    employee_status: 'Active',
  })

  // Fetch all staff
  const { data: staffData, isLoading } = useQuery({
    queryKey: ['all-staff'],
    queryFn: async () => {
      try {
        const response = await fetch('/api/hr/staff/all')
        if (!response.ok) throw new Error('Failed to fetch staff')
        return response.json()
      } catch {
        return { data: [] }
      }
    },
  })

  const staff = (staffData?.data || []) as Staff[]

  // Filter staff based on search
  const filteredStaff = useMemo(() => {
    if (!searchTerm) return staff
    return staff.filter(
      (s) =>
        `${s.employee_fname} ${s.employee_lname}`
          .toLowerCase()
          .includes(searchTerm.toLowerCase()) ||
        s.employee_position.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.employee_phone.includes(searchTerm)
    )
  }, [staff, searchTerm])

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: any) => hrService.createStaff(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-staff'] })
      setShowForm(false)
      resetForm()
      toast.success('Staff added successfully')
    },
    onError: () => toast.error('Failed to add staff'),
  })

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data: any) =>
      hrService.updateStaff(editingId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-staff'] })
      setShowForm(false)
      setEditingId(null)
      resetForm()
      toast.success('Staff updated successfully')
    },
    onError: () => toast.error('Failed to update staff'),
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => hrService.deleteStaff(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-staff'] })
      toast.success('Staff deleted successfully')
    },
    onError: () => toast.error('Failed to delete staff'),
  })

  const resetForm = () => {
    setFormData({
      employee_fname: '',
      employee_lname: '',
      employee_position: '',
      employee_phone: '',
      employee_post: '',
      employee_status: 'Active',
    })
  }

  const handleSubmit = () => {
    if (!formData.employee_fname || !formData.employee_lname) {
      toast.error('Please fill all required fields')
      return
    }

    if (editingId) {
      updateMutation.mutate(formData)
    } else {
      createMutation.mutate(formData)
    }
  }

  const handleEdit = (staffMember: Staff) => {
    setFormData({
      employee_fname: staffMember.employee_fname,
      employee_lname: staffMember.employee_lname,
      employee_position: staffMember.employee_position,
      employee_phone: staffMember.employee_phone,
      employee_post: staffMember.employee_post,
      employee_status: staffMember.employee_status,
    })
    setEditingId(staffMember.employee_id)
    setShowForm(true)
  }

  const exportToCSV = () => {
    const headers = ['First Name', 'Last Name', 'Position', 'Phone', 'Post', 'Status']
    const rows = filteredStaff.map((s) => [
      s.employee_fname,
      s.employee_lname,
      s.employee_position,
      s.employee_phone,
      s.employee_post,
      s.employee_status,
    ])

    const csv = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `staff_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
    toast.success('CSV exported successfully')
  }

  const exportToPDF = () => {
    toast.info('PDF export feature coming soon')
  }

  if (isLoading) return <Spinner />

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-ink-950 p-6">
      <PageHeader title="All Staff" description="Manage all staff members" />

      {/* Action Bar */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <button
          onClick={() => {
            setShowForm(true)
            setEditingId(null)
            resetForm()
          }}
          className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add New Staff
        </button>
        <button
          onClick={exportToCSV}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
        <button
          onClick={exportToPDF}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          <FileText className="w-4 h-4" />
          Export PDF
        </button>
      </div>

      {/* Search Bar */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, position, or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="bg-white dark:bg-ink-800 rounded-lg p-6 mb-6 border border-gray-200 dark:border-ink-700">
          <h3 className="text-lg font-semibold mb-4">
            {editingId ? 'Edit Staff' : 'Add New Staff'}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="First Name *"
              value={formData.employee_fname}
              onChange={(e) =>
                setFormData({ ...formData, employee_fname: e.target.value })
              }
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
            />
            <input
              type="text"
              placeholder="Last Name *"
              value={formData.employee_lname}
              onChange={(e) =>
                setFormData({ ...formData, employee_lname: e.target.value })
              }
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
            />
            <input
              type="text"
              placeholder="Position"
              value={formData.employee_position}
              onChange={(e) =>
                setFormData({ ...formData, employee_position: e.target.value })
              }
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
            />
            <input
              type="tel"
              placeholder="Phone"
              value={formData.employee_phone}
              onChange={(e) =>
                setFormData({ ...formData, employee_phone: e.target.value })
              }
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
            />
            <input
              type="text"
              placeholder="Post"
              value={formData.employee_post}
              onChange={(e) =>
                setFormData({ ...formData, employee_post: e.target.value })
              }
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
            />
            <select
              value={formData.employee_status}
              onChange={(e) =>
                setFormData({ ...formData, employee_status: e.target.value })
              }
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="Terminated">Terminated</option>
            </select>
          </div>
          <div className="flex gap-3 mt-4">
            <button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand/90 disabled:opacity-50"
            >
              {createMutation.isPending || updateMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Save'
              )}
            </button>
            <button
              onClick={() => {
                setShowForm(false)
                setEditingId(null)
                resetForm()
              }}
              className="px-4 py-2 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Staff Table */}
      <div className="bg-white dark:bg-ink-800 rounded-lg overflow-hidden border border-gray-200 dark:border-ink-700">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-100 dark:bg-ink-700">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
                  Position
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
                  Phone
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
                  Post
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-ink-700">
              {filteredStaff.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                    No staff found
                  </td>
                </tr>
              ) : (
                filteredStaff.map((staffMember) => (
                  <tr
                    key={staffMember.employee_id}
                    className="hover:bg-gray-50 dark:hover:bg-ink-700/50 transition-colors"
                  >
                    <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                      {staffMember.employee_fname} {staffMember.employee_lname}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                      {staffMember.employee_position}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                      {staffMember.employee_phone}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                      {staffMember.employee_post}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          staffMember.employee_status === 'Active'
                            ? 'bg-green-100 text-green-700'
                            : staffMember.employee_status === 'Inactive'
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {staffMember.employee_status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleEdit(staffMember)}
                          className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (
                              window.confirm(
                                'Are you sure you want to delete this staff?'
                              )
                            ) {
                              deleteMutation.mutate(staffMember.employee_id)
                            }
                          }}
                          className="p-1 text-red-600 hover:bg-red-50 rounded"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary */}
      <div className="mt-6 text-sm text-gray-600 dark:text-gray-400">
        Showing {filteredStaff.length} of {staff.length} staff members
      </div>
    </div>
  )
}

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Download, FileText, Search, Users, UserCheck, UserX } from 'lucide-react'
import toast from 'react-hot-toast'
import PageHeader from '@/components/ui/PageHeader'
import Spinner from '@/components/ui/Spinner'

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

  // Calculate statistics
  const stats = useMemo(() => {
    return {
      total: staff.length,
      active: staff.filter(s => s.employee_status === 'Active').length,
      inactive: staff.filter(s => s.employee_status === 'Inactive').length,
    }
  }, [staff])

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
    toast.success('PDF export coming soon')
  }

  if (isLoading) return <Spinner />

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-ink-950 p-6">
      <PageHeader title="All Staff" description="Manage all staff members" />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white dark:bg-ink-800 rounded-lg p-6 border border-gray-200 dark:border-ink-700 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 dark:text-gray-400 text-sm font-medium">Total Staff</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{stats.total}</p>
            </div>
            <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-lg">
              <Users className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-ink-800 rounded-lg p-6 border border-gray-200 dark:border-ink-700 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 dark:text-gray-400 text-sm font-medium">Active</p>
              <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-2">{stats.active}</p>
            </div>
            <div className="bg-green-100 dark:bg-green-900/30 p-3 rounded-lg">
              <UserCheck className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-ink-800 rounded-lg p-6 border border-gray-200 dark:border-ink-700 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 dark:text-gray-400 text-sm font-medium">Inactive</p>
              <p className="text-3xl font-bold text-red-600 dark:text-red-400 mt-2">{stats.inactive}</p>
            </div>
            <div className="bg-red-100 dark:bg-red-900/30 p-3 rounded-lg">
              <UserX className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <button
          onClick={() => window.location.href = '/admin/hr/staff'}
          className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand/90 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Add New Staff
        </button>
        <button
          onClick={exportToCSV}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors shadow-sm"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
        <button
          onClick={exportToPDF}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors shadow-sm"
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
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-ink-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand dark:bg-ink-800 dark:text-white"
          />
        </div>
      </div>


      {/* Staff Table */}
      <div className="bg-white dark:bg-ink-800 rounded-lg overflow-hidden border border-gray-200 dark:border-ink-700 shadow-sm">
        {filteredStaff.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Search className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400 text-lg font-medium">No staff found</p>
            <p className="text-gray-400 text-sm mt-1">Try adjusting your search criteria</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-ink-700 dark:to-ink-600 border-b border-gray-200 dark:border-ink-700">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Position
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Department
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Phone
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-ink-700">
                {filteredStaff.map((staffMember, idx) => (
                  <tr
                    key={staffMember.employee_id}
                    className={`hover:bg-gray-50 dark:hover:bg-ink-700/50 transition-colors ${
                      idx % 2 === 0 ? 'bg-white dark:bg-ink-800' : 'bg-gray-50 dark:bg-ink-750'
                    }`}
                  >
                    <td className="px-6 py-4 text-sm font-semibold text-gray-900 dark:text-white">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                          {staffMember.employee_fname.charAt(0)}{staffMember.employee_lname.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium">{staffMember.employee_fname} {staffMember.employee_lname}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">
                      {staffMember.employee_position || '—'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">
                      {staffMember.employee_post || '—'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">
                      {staffMember.employee_phone || '—'}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                          staffMember.employee_status === 'Active'
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                            : staffMember.employee_status === 'Inactive'
                              ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                              : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                        }`}
                      >
                        {staffMember.employee_status || 'Unknown'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => window.location.href = `/admin/hr/staff/${staffMember.employee_id}`}
                        className="inline-flex items-center px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Summary Footer */}
      <div className="mt-4 flex items-center justify-between text-sm">
        <p className="text-gray-600 dark:text-gray-400">
          Showing <span className="font-semibold">{filteredStaff.length}</span> of <span className="font-semibold">{staff.length}</span> staff members
        </p>
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="text-blue-600 dark:text-blue-400 hover:underline text-sm font-medium"
          >
            Clear search
          </button>
        )}
      </div>
    </div>
  )
}

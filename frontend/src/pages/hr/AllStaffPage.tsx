import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Download, FileText, Search } from 'lucide-react'
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

      {/* Action Bar */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <button
          onClick={() => window.location.href = '/admin/hr/staff'}
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
                      <button
                        onClick={() => window.location.href = `/admin/hr/staff/${staffMember.employee_id}`}
                        className="text-blue-600 hover:text-blue-800 font-medium text-sm"
                      >
                        View
                      </button>
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

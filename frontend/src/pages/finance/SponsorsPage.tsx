import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { 
  ShieldCheck, Search, Plus, Edit2, 
  Mail, Phone, MoreVertical, ExternalLink
} from 'lucide-react'
import { sponsorService } from '@/services/financeService'
import toast from 'react-hot-toast'
import type { Sponsor } from '@/types/finance'

export default function SponsorsPage() {
  const queryClient = useQueryClient()
  const [searchTerm, setSearchTerm] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  
  // Form State
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', is_active: 1 })

  const { data: sponsorsQ, isLoading } = useQuery({
    queryKey: ['finance', 'sponsors'],
    queryFn: () => sponsorService.list()
  })

  const saveMutation = useMutation<any, Error, any>({
    mutationFn: (data: any) => 
      editingId ? sponsorService.update(editingId, data) : sponsorService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'sponsors'] })
      toast.success(editingId ? 'Sponsor updated' : 'Sponsor created')
      resetForm()
    }
  })

  const resetForm = () => {
    setFormData({ name: '', email: '', phone: '', is_active: 1 })
    setEditingId(null)
    setIsAdding(false)
  }

  const handleEdit = (s: Sponsor) => {
    setFormData({ name: s.name, email: s.email || '', phone: s.phone || '', is_active: s.is_active })
    setEditingId(s.id)
    setIsAdding(true)
  }

  const sponsors = sponsorsQ?.data ?? []
  const filtered = sponsors.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.email?.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-ink-900 p-6 rounded-xl border border-ink-200 dark:border-ink-800 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-brand/10 text-brand rounded-lg">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-ink-900 dark:text-ink-50">Sponsor Directory</h1>
            <p className="text-sm text-ink-500">Manage corporate and individual sponsors linked to bursaries</p>
          </div>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add New Sponsor
        </button>
      </header>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
            <input 
              type="text" 
              placeholder="Search sponsors by name or email..." 
              className="w-full pl-9 pr-4 py-2 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-lg text-sm shadow-sm"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {isLoading ? (
              [...Array(4)].map((_, i) => (
                <div key={i} className="h-32 bg-ink-100 dark:bg-ink-800 animate-pulse rounded-xl" />
              ))
            ) : filtered.length === 0 ? (
              <div className="col-span-full py-12 text-center text-ink-500 bg-white dark:bg-ink-900 rounded-xl border border-dashed border-ink-300">
                No sponsors found.
              </div>
            ) : (
              filtered.map(s => (
                <div key={s.id} className="group bg-white dark:bg-ink-900 p-5 rounded-xl border border-ink-200 dark:border-ink-800 shadow-sm hover:border-brand transition-all relative overflow-hidden">
                  <div className={`absolute top-0 right-0 w-1 h-full ${s.is_active ? 'bg-emerald-500' : 'bg-ink-300'}`} />
                  
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="font-bold text-ink-900 dark:text-ink-50 line-clamp-1">{s.name}</h3>
                    <div className="flex items-center gap-1">
                      <button 
                        onClick={() => handleEdit(s)}
                        className="p-1.5 text-ink-400 hover:text-brand hover:bg-brand/5 rounded-md transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button className="p-1.5 text-ink-400 hover:bg-ink-50 rounded-md transition-colors">
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-ink-600 dark:text-ink-400">
                      <Mail className="w-3 h-3" />
                      {s.email || 'No email provided'}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-ink-600 dark:text-ink-400">
                      <Phone className="w-3 h-3" />
                      {s.phone || 'No phone provided'}
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-ink-50 dark:border-ink-800 flex items-center justify-between">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                      s.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-ink-100 text-ink-500'
                    }`}>
                      {s.is_active ? 'Active' : 'Inactive'}
                    </span>
                    <button className="text-xs text-brand font-medium flex items-center gap-1 hover:underline">
                      View Bursaries
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: Form */}
        <div className="lg:col-span-1">
          {isAdding ? (
            <form 
              onSubmit={e => { e.preventDefault(); saveMutation.mutate(formData); }}
              className="bg-white dark:bg-ink-900 p-6 rounded-xl border-2 border-brand/20 shadow-xl sticky top-4 space-y-4"
            >
              <h2 className="text-lg font-bold text-ink-900 dark:text-ink-50 flex items-center gap-2">
                {editingId ? <Edit2 className="w-5 h-5 text-brand" /> : <Plus className="w-5 h-5 text-brand" />}
                {editingId ? 'Edit Sponsor' : 'Add New Sponsor'}
              </h2>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-ink-600">Sponsor Name *</label>
                <input 
                  required
                  type="text" 
                  className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-800 border-none rounded-md text-sm focus:ring-2 ring-brand"
                  placeholder="Organization or Individual Name"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-ink-600">Email Address</label>
                <input 
                  type="email" 
                  className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-800 border-none rounded-md text-sm"
                  placeholder="contact@sponsor.com"
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-ink-600">Phone Number</label>
                <input 
                  type="text" 
                  className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-800 border-none rounded-md text-sm"
                  placeholder="+250..."
                  value={formData.phone}
                  onChange={e => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>

              <div className="flex items-center gap-2 py-2">
                <input 
                  type="checkbox" 
                  id="is_active"
                  checked={formData.is_active === 1}
                  onChange={e => setFormData({ ...formData, is_active: e.target.checked ? 1 : 0 })}
                  className="rounded text-brand focus:ring-brand"
                />
                <label htmlFor="is_active" className="text-sm text-ink-700 dark:text-ink-300 select-none">
                  Sponsor is currently active
                </label>
              </div>

              <div className="flex gap-2 pt-2">
                <button 
                  type="submit" 
                  className="flex-1 btn btn-primary py-2.5"
                  disabled={saveMutation.isPending}
                >
                  {saveMutation.isPending ? 'Saving...' : editingId ? 'Update Sponsor' : 'Save Sponsor'}
                </button>
                <button 
                  type="button" 
                  onClick={resetForm}
                  className="btn btn-secondary px-4"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="bg-brand/5 dark:bg-brand/10 p-6 rounded-xl border border-brand/20 border-dashed text-center space-y-3">
              <div className="p-3 bg-brand/20 text-brand rounded-full w-fit mx-auto">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <h3 className="font-bold text-ink-900 dark:text-brand">New Sponsor?</h3>
              <p className="text-sm text-ink-600 dark:text-ink-400 px-4">
                Sponsors are required before you can record certain types of bursaries.
              </p>
              <button 
                onClick={() => setIsAdding(true)}
                className="btn btn-primary w-full py-2.5 mt-2"
              >
                Get Started
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

import type { InvoiceStatus } from '@/types/finance'
import { INVOICE_STATUS_COLORS } from '@/types/finance'

const LABELS: Record<InvoiceStatus, string> = {
  unpaid:  'Unpaid',
  partial: 'Partial',
  paid:    'Paid',
  overdue: 'Overdue',
  waived:  'Waived',
}

export default function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${INVOICE_STATUS_COLORS[status]}`}>
      {LABELS[status]}
    </span>
  )
}

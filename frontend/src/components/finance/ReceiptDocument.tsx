import type { ReceiptData } from '@/types/finance'
import { FEE_TYPE_LABELS, PAYMENT_METHOD_LABELS } from '@/types/finance'

interface Props {
  data: ReceiptData
}

export default function ReceiptDocument({ data }: Props) {
  const fullName = `${data.fname ?? ''} ${data.lname ?? ''}`.trim()
  const paidAt   = data.paid_at ? new Date(data.paid_at) : null

  return (
    <div className="bg-white text-gray-900 font-sans p-8 max-w-[700px] mx-auto border border-gray-200 rounded-lg print:border-0">
      {/* Header */}
      <div className="text-center border-b-2 border-brand pb-4 mb-6">
        <h1 className="text-xl font-bold text-brand uppercase tracking-wide">Catholic University of Rwanda</h1>
        <p className="text-sm text-gray-500 mt-1">Finance Department — Official Receipt</p>
      </div>

      {/* Receipt number + date */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Receipt No.</p>
          <p className="text-lg font-bold">{data.receipt_number}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Date &amp; Time</p>
          <p className="text-sm font-semibold">
            {paidAt
              ? paidAt.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
              : '—'}
          </p>
          <p className="text-xs text-gray-500">
            {paidAt ? paidAt.toLocaleTimeString('en-GB') : ''}
          </p>
        </div>
      </div>

      {/* Student info */}
      <table className="w-full text-sm mb-6 border-collapse">
        <tbody>
          <Row label="Student Name"        value={fullName || '—'} />
          <Row label="Registration No."    value={data.regnumber ?? '—'} />
          <Row label="Faculty"             value={data.faculty_name ?? '—'} />
          <Row label="Department"          value={data.department_name ?? '—'} />
          <Row label="Option"              value={data.option_name ?? '—'} />
          <Row label="Year / Level"        value={data.level_name ?? '—'} />
          <Row label="Academic Year"       value={data.academic_year_label ?? '—'} />
        </tbody>
      </table>

      {/* Payment info */}
      <div className="bg-gray-50 rounded-lg p-4 mb-6 border border-gray-200">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-gray-500 text-xs uppercase">Reason for Payment</p>
            <p className="font-semibold">{data.invoice_description ?? FEE_TYPE_LABELS[data.fee_type]}</p>
          </div>
          <div>
            <p className="text-gray-500 text-xs uppercase">Payment Method</p>
            <p className="font-semibold">{PAYMENT_METHOD_LABELS[data.payment_method]}</p>
          </div>
          {data.reference_number && (
            <div>
              <p className="text-gray-500 text-xs uppercase">Reference No.</p>
              <p className="font-semibold">{data.reference_number}</p>
            </div>
          )}
          <div>
            <p className="text-gray-500 text-xs uppercase">Recorded By</p>
            <p className="font-semibold">{data.recorded_by_name ?? '—'}</p>
          </div>
        </div>
      </div>

      {/* Amount */}
      <div className="text-right border-t-2 border-brand pt-4">
        <p className="text-xs text-gray-500 uppercase tracking-wide">Amount Paid</p>
        <p className="text-3xl font-bold text-brand">
          {Number(data.amount).toLocaleString('en-RW', { minimumFractionDigits: 0 })} <span className="text-lg">RWF</span>
        </p>
      </div>

      {/* Footer */}
      <div className="mt-8 pt-4 border-t border-gray-200 text-center text-xs text-gray-400">
        This receipt is computer-generated and valid without a signature. <br />
        CUR-MIS · Catholic University of Rwanda
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-gray-100">
      <td className="py-1.5 pr-4 text-gray-500 w-36 text-xs uppercase tracking-wide">{label}</td>
      <td className="py-1.5 font-medium">{value}</td>
    </tr>
  )
}

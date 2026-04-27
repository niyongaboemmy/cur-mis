import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Printer } from 'lucide-react'
import { paymentService } from '@/services/financeService'
import ReceiptDocument from '@/components/finance/ReceiptDocument'

export default function ReceiptPdfPage() {
  const { paymentId } = useParams<{ paymentId: string }>()

  const q = useQuery({
    queryKey: ['finance', 'receipt', paymentId],
    queryFn: () => paymentService.getReceipt(Number(paymentId)),
    enabled: !!paymentId,
  })

  if (q.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-6 h-6 animate-spin text-brand" />
      </div>
    )
  }

  if (!q.data?.data) {
    return (
      <div className="flex items-center justify-center min-h-screen text-red-500">
        Receipt not found.
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="max-w-[720px] mx-auto">
        <div className="flex justify-end mb-4 print:hidden">
          <button className="btn-primary btn-sm" onClick={() => window.print()}>
            <Printer className="w-3.5 h-3.5" /> Print Receipt
          </button>
        </div>
        <ReceiptDocument data={q.data.data} />
      </div>
    </div>
  )
}

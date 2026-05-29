import { useState } from 'react'
import { Smartphone, Globe, ExternalLink, Loader2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { myLedgerService } from '@/services/financeService'

interface Props {
  open: boolean
  onClose: () => void
}

const USSD_STEPS = [
  { n: 1, text: 'Dial *775# from your MTN or AIRTEL SIM card.' },
  { n: 2, text: 'Select Pay Bill from the main menu.' },
  { n: 3, text: <>Enter merchant code: <strong className="font-mono">TH17342831</strong></> },
  { n: 4, text: 'Enter your student registration number as the payer code.' },
  { n: 5, text: 'Enter the amount you want to pay in RWF.' },
  { n: 6, text: 'Confirm your mobile money PIN to complete the payment.' },
]

type Tab = 'ussd' | 'online'

export default function UrubutoPayInstructionsModal({ open, onClose }: Props) {
  const [tab, setTab]           = useState<Tab>('ussd')
  const [paying, setPaying]     = useState(false)
  const [payError, setPayError] = useState<string | null>(null)

  const handlePayOnline = async () => {
    setPaying(true)
    setPayError(null)
    try {
      const res = await myLedgerService.getPaymentLink()
      if (res.data?.checkout_url) {
        window.open(res.data.checkout_url, '_blank', 'noopener,noreferrer')
      }
    } catch {
      setPayError('Could not generate payment link. Please try again.')
    } finally {
      setPaying(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="How to Pay" size="md">
      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-ink-100 dark:bg-ink-800 rounded-lg mb-5">
        <button
          onClick={() => setTab('ussd')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 text-[13px] font-medium rounded-md transition-colors ${
            tab === 'ussd'
              ? 'bg-white dark:bg-ink-700 text-ink-900 dark:text-white shadow-sm'
              : 'text-ink-500 dark:text-ink-400 hover:text-ink-700 dark:hover:text-ink-200'
          }`}
        >
          <Smartphone size={14} />
          USSD *775#
        </button>
        <button
          onClick={() => setTab('online')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 text-[13px] font-medium rounded-md transition-colors ${
            tab === 'online'
              ? 'bg-white dark:bg-ink-700 text-ink-900 dark:text-white shadow-sm'
              : 'text-ink-500 dark:text-ink-400 hover:text-ink-700 dark:hover:text-ink-200'
          }`}
        >
          <Globe size={14} />
          Online Payment
        </button>
      </div>

      {tab === 'ussd' && (
        <div className="space-y-4">
          <p className="text-[13px] text-ink-500 dark:text-ink-400">
            Pay directly from your phone using MTN Mobile Money or Airtel Money — no internet required.
          </p>
          <ol className="space-y-3">
            {USSD_STEPS.map(({ n, text }) => (
              <li key={n} className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-400 text-[11px] font-bold flex items-center justify-center mt-0.5">
                  {n}
                </span>
                <span className="text-[13px] text-ink-700 dark:text-ink-300">{text}</span>
              </li>
            ))}
          </ol>
          <div className="mt-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3">
            <p className="text-[12px] text-green-700 dark:text-green-400 font-medium">
              Your payment will reflect in your student ledger within a few minutes after confirmation.
            </p>
          </div>
        </div>
      )}

      {tab === 'online' && (
        <div className="space-y-5">
          <p className="text-[13px] text-ink-500 dark:text-ink-400">
            Pay securely via the UrubutoPay online portal using your MTN or Airtel mobile wallet.
          </p>
          <div className="rounded-lg border border-ink-200 dark:border-ink-700 p-4 space-y-3">
            <div className="flex items-center gap-2 text-[13px] font-medium text-ink-800 dark:text-ink-200">
              <Globe size={15} className="text-primary-600" />
              UrubutoPay Hosted Checkout
            </div>
            <p className="text-[12px] text-ink-500 dark:text-ink-400">
              You will be redirected to the UrubutoPay secure payment page where you can pay using your mobile money account.
            </p>
            {payError && (
              <p className="text-[12px] text-red-600 dark:text-red-400">{payError}</p>
            )}
            <button
              onClick={handlePayOnline}
              disabled={paying}
              className="btn btn-primary w-full flex items-center justify-center gap-2"
            >
              {paying ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <ExternalLink size={14} />
              )}
              {paying ? 'Generating link…' : 'Pay Now via UrubutoPay'}
            </button>
          </div>
          <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3">
            <p className="text-[12px] text-blue-700 dark:text-blue-400">
              After payment, your ledger updates automatically within a few minutes.
            </p>
          </div>
        </div>
      )}
    </Modal>
  )
}

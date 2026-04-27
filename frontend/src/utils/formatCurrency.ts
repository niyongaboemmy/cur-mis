/**
 * Currency formatting helpers for the CUR Finance module.
 * Always formats amounts in Rwandan Franc (RWF) with comma thousand-separators.
 *
 * Example: formatRWF(1500000) → "1,500,000 RWF"
 */
export function formatRWF(amount: number | string | null | undefined): string {
  const n = Number(amount ?? 0)
  if (isNaN(n)) return '0 RWF'
  // Use 'en-US' as a safe fallback — produces identical comma separators to 'en-RW'
  // which may not be available in all browser/Node environments.
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' RWF'
}

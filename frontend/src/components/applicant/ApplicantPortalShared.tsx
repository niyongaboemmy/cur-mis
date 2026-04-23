import { Loader2 } from 'lucide-react'

export function Card({ children }: { children: React.ReactNode }) { 
  return <section className="card p-5">{children}</section> 
}

export function Loading() { 
  return <p className="text-[13px] text-ink-500 flex items-center gap-2 py-4"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</p> 
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) { 
  return <div><label className="label">{label}</label>{children}</div> 
}

export function SectionHeader({ title, sub }: { title: string; sub: string }) { 
  return <div><h2 className="section-title">{title}</h2><p className="section-sub">{sub}</p></div> 
}

export function fmt(v: string | null | undefined) { 
  if (!v) return '—'; 
  try { 
    const d = new Date(v.replace(' ', 'T')); 
    return isNaN(d.getTime()) ? v : d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) 
  } catch { 
    return v 
  } 
}

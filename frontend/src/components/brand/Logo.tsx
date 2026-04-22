import { Link } from 'react-router-dom'
import { APP_SHORT } from '@/constants'

interface LogoProps {
  to?:        string
  size?:      'sm' | 'md' | 'lg'
  variant?:   'dark' | 'light'
  showText?:  boolean
  className?: string
}

const sizeMap = {
  sm: { box: 'w-8 h-8',  text: 'text-[13px]', wordmark: 'text-[14px]' },
  md: { box: 'w-9 h-9',  text: 'text-[14px]', wordmark: 'text-[15px]' },
  lg: { box: 'w-12 h-12', text: 'text-[16px]', wordmark: 'text-[19px]' },
}

/**
 * CUR brand mark — a small chapel / cross motif inside a rounded-gradient tile.
 * Purposely abstract so it reads clean at any size.
 */
export default function Logo({ to = '/', size = 'md', variant = 'dark', showText = true, className = '' }: LogoProps) {
  const s = sizeMap[size]
  const wordmarkColor = variant === 'light'
    ? 'text-white'
    : 'text-ink-900 dark:text-white'

  const content = (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className={`${s.box} relative rounded-md bg-brand dark:bg-brand-active flex items-center justify-center`}>
        <svg viewBox="0 0 24 24" className="w-1/2 h-1/2 text-white" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v18" />
          <path d="M7 8h10" />
          <path d="M5 21h14" opacity="0.6" />
        </svg>
      </span>
      {showText && (
        <span className="flex flex-col leading-tight">
          <span className={`font-display font-semibold tracking-tight ${s.wordmark} ${wordmarkColor}`}>
            {APP_SHORT}<span className="text-gold-500">•</span>MIS
          </span>
          <span className={`text-[9px] uppercase tracking-[0.16em] font-semibold ${variant === 'light' ? 'text-primary-100/80' : 'text-ink-400 dark:text-ink-500'}`}>
            Cath. Univ. of Rwanda
          </span>
        </span>
      )}
    </span>
  )

  return to ? <Link to={to} className="inline-flex">{content}</Link> : content
}

import { Link } from 'react-router-dom'
import { APP_SHORT } from '@/constants'

interface LogoProps {
  to?:        string
  size?:      'sm' | 'md' | 'lg' | 'xl'
  variant?:   'dark' | 'light'
  showText?:  boolean
  className?: string
}

const sizeMap = {
  sm: { box: 'w-8 h-8',   text: 'text-[13px]', wordmark: 'text-[14px]' },
  md: { box: 'w-10 h-10', text: 'text-[14px]', wordmark: 'text-[15px]' },
  lg: { box: 'w-14 h-14', text: 'text-[16px]', wordmark: 'text-[19px]' },
  xl: { box: 'w-20 h-20', text: 'text-[18px]', wordmark: 'text-[22px]' },
}

/**
 * Catholic University of Rwanda brand mark.
 * Renders /public/logo.png — the official university crest.
 */
export default function Logo({ to = '/', size = 'md', variant = 'dark', showText = true, className = '' }: LogoProps) {
  const s = sizeMap[size]
  const wordmarkColor = variant === 'light'
    ? 'text-white'
    : 'text-ink-900 dark:text-white'

  const content = (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span className={`${s.box} relative shrink-0 flex items-center justify-center`}>
        <img
          src="/logo.png"
          alt="Catholic University of Rwanda"
          className="w-full h-full object-contain select-none"
          draggable={false}
        />
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

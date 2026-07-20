import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { MoreHorizontal, ChevronDown } from 'lucide-react'

export interface ResponsiveTab {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  end?: boolean
  badge?: ReactNode
}

function isTabActive(to: string, end: boolean | undefined, pathname: string): boolean {
  if (end) return pathname === to
  return pathname === to || pathname.startsWith(`${to}/`)
}

const linkClass = (active: boolean) =>
  `inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-[13px] rounded-md whitespace-nowrap transition-all duration-150 select-none flex-shrink-0 ${
    active
      ? 'bg-brand/10 text-brand dark:bg-brand/25 dark:text-gold-400 font-semibold shadow-sm'
      : 'text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-700/60 hover:text-ink-900 dark:hover:text-ink-100'
  }`

/**
 * A single-row menu bar that measures its own width and moves whatever
 * doesn't fit into a "More" dropdown, instead of wrapping onto extra rows or
 * relying on horizontal scroll (which most end users never discover). If the
 * currently active route is one of the overflowed tabs, the "More" button
 * itself is highlighted so it's obvious the active page is hidden in there.
 */
export default function ResponsiveTabBar({ tabs }: { tabs: ResponsiveTab[] }) {
  const location = useLocation()
  const containerRef = useRef<HTMLDivElement>(null)
  const measureRefs = useRef<Array<HTMLAnchorElement | null>>([])
  const moreRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const [visibleCount, setVisibleCount] = useState(tabs.length)
  const [menuOpen, setMenuOpen] = useState(false)

  const recalc = useCallback(() => {
    const container = containerRef.current
    if (!container || tabs.length === 0) return
    const containerWidth = container.clientWidth
    const moreWidth = 110 // reserved estimate for the "More" button + gap
    const gap = 4

    let total = 0
    let count = tabs.length
    for (let i = 0; i < tabs.length; i++) {
      const el = measureRefs.current[i]
      const w = el ? el.getBoundingClientRect().width : 0
      total += w + (i > 0 ? gap : 0)
      const hasRemaining = i < tabs.length - 1
      const reserve = hasRemaining ? moreWidth + gap : 0
      if (total + reserve > containerWidth) {
        count = i
        break
      }
    }
    setVisibleCount(Math.max(1, count))
  }, [tabs])

  useLayoutEffect(() => {
    recalc()
  }, [recalc])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const ro = new ResizeObserver(() => recalc())
    ro.observe(container)
    return () => ro.disconnect()
  }, [recalc])

  useEffect(() => {
    if (!menuOpen) return
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node
      if (menuRef.current?.contains(target) || moreRef.current?.contains(target)) return
      setMenuOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  const shown = tabs.slice(0, visibleCount)
  const overflow = tabs.slice(visibleCount)
  const moreActive = overflow.some((t) => isTabActive(t.to, t.end, location.pathname))

  return (
    // Deliberately NOT overflow-x-hidden here: overflow-x anything but
    // "visible" forces the browser to compute overflow-y as "auto" too (a
    // hard CSS coupling — you cannot have overflow-x:hidden with a truly
    // "visible" overflow-y on the same element), which turned this wrapper
    // into a scroll box that trapped the "More" dropdown inside it instead
    // of letting it float over the page. The hidden measurement row below
    // already clips itself, which is the only overflow source that matters.
    <div className="relative">
      {/* Hidden measurement row: every tab is laid out (but invisible) so we
          can read natural widths and decide how many fit before overflowing.
          overflow-hidden here is load-bearing — without it this row's
          content (all tabs, unclipped) can be wider than the page itself and
          silently expands the document's horizontal scroll range, even
          though nothing is visibly wrong until something scrolls it. */}
      <div
        aria-hidden
        className="absolute top-0 left-0 right-0 flex gap-1 overflow-hidden pointer-events-none"
        style={{ visibility: 'hidden' }}
      >
        {tabs.map((t, i) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            ref={(el) => { measureRefs.current[i] = el }}
            className={linkClass(false)}
            tabIndex={-1}
          >
            <t.icon className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
            <span>{t.label}</span>
            {t.badge}
          </NavLink>
        ))}
      </div>

      {/* No overflow-hidden here: visibleCount is computed so the shown tabs
          + "More" button never actually overflow, and clipping would also
          cut off the "More" dropdown panel, which needs to render below it. */}
      <div ref={containerRef} className="flex items-center gap-1 flex-nowrap">
        {shown.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={linkClass(isTabActive(t.to, t.end, location.pathname))}
          >
            <t.icon className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
            <span>{t.label}</span>
            {t.badge}
          </NavLink>
        ))}

        {overflow.length > 0 && (
          <div className="relative flex-shrink-0">
            <button
              ref={moreRef}
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              className={linkClass(moreActive)}
            >
              <MoreHorizontal className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
              <span>More</span>
              <span className="text-[10px] opacity-60">({overflow.length})</span>
              <ChevronDown
                className={`w-3 h-3 flex-shrink-0 transition-transform duration-150 ${menuOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {menuOpen && (
              <div
                ref={menuRef}
                role="menu"
                className="absolute right-0 top-full mt-1.5 w-56 max-h-[70vh] overflow-y-auto bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded-lg shadow-lg z-50 py-1.5 animate-fade-up"
              >
                {overflow.map((t) => {
                  const active = isTabActive(t.to, t.end, location.pathname)
                  return (
                    <NavLink
                      key={t.to}
                      to={t.to}
                      end={t.end}
                      role="menuitem"
                      className={`flex items-center gap-2 px-3 py-2 text-[13px] transition-colors ${
                        active
                          ? 'bg-brand/10 text-brand dark:bg-brand/25 dark:text-gold-400 font-semibold'
                          : 'text-ink-600 dark:text-ink-300 hover:bg-ink-50 dark:hover:bg-ink-700/60'
                      }`}
                    >
                      <t.icon className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="flex-1">{t.label}</span>
                      {t.badge}
                    </NavLink>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * ModalPortal — renders children into document.body via a React portal.
 *
 * Purpose: Any element with `position: fixed` that is a descendant of an
 * ancestor with `overflow: auto/hidden` (like the scrollable <main> in
 * MainLayout) loses its "fixed to viewport" behaviour and instead becomes
 * fixed relative to that ancestor's bounding box — causing the infamous
 * "modal backdrop with a gap at the top" bug.
 *
 * Wrapping the backdrop + dialog in this component guarantees the content
 * is mounted directly on <body>, completely outside the stacking-context
 * chain, so `inset-0` truly means 0 from every viewport edge.
 */
import { type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface ModalPortalProps {
  children: ReactNode
}

export default function ModalPortal({ children }: ModalPortalProps) {
  return createPortal(children, document.body)
}

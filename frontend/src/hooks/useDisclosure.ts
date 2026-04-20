import { useState, useCallback } from 'react'

/**
 * Manages open/close boolean state for modals, drawers, dropdowns.
 *
 * const { isOpen, open, close, toggle } = useDisclosure()
 * <Modal open={isOpen} onClose={close} />
 */
export function useDisclosure(initialState = false) {
  const [isOpen, setIsOpen] = useState(initialState)

  const open   = useCallback(() => setIsOpen(true),        [])
  const close  = useCallback(() => setIsOpen(false),       [])
  const toggle = useCallback(() => setIsOpen((s) => !s),   [])

  return { isOpen, open, close, toggle }
}

import { useState, useCallback } from 'react'

/**
 * useState backed by sessionStorage.
 * Same shape as useLocalStorage, but the value lives only for the
 * current browser tab — the right home for things like "the program
 * I was last scheduling" that should survive tab-navigation within
 * Academic Settings but not across browser restarts.
 */
export function useSessionStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.sessionStorage.getItem(key)
      return item !== null ? (JSON.parse(item) as T) : initialValue
    } catch {
      return initialValue
    }
  })

  const setValue = useCallback((value: T | ((prev: T) => T)) => {
    try {
      const toStore = value instanceof Function ? value(storedValue) : value
      setStoredValue(toStore)
      window.sessionStorage.setItem(key, JSON.stringify(toStore))
    } catch (e) {
      console.warn(`useSessionStorage: could not write key "${key}"`, e)
    }
  }, [key, storedValue])

  const removeValue = useCallback(() => {
    try {
      window.sessionStorage.removeItem(key)
      setStoredValue(initialValue)
    } catch {/* ignore */}
  }, [key, initialValue])

  return [storedValue, setValue, removeValue] as const
}

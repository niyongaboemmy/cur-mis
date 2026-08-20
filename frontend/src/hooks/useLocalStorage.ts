import { useState, useCallback } from 'react'

/**
 * useState backed by localStorage.
 * Automatically serialises/deserialises JSON.
 *
 * const [theme, setTheme] = useLocalStorage('theme', 'light')
 */
export function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key)
      return item !== null ? (JSON.parse(item) as T) : initialValue
    } catch {
      return initialValue
    }
  })

  const setValue = useCallback((value: T | ((prev: T) => T)) => {
    try {
      const toStore = value instanceof Function ? value(storedValue) : value
      setStoredValue(toStore)
      window.localStorage.setItem(key, JSON.stringify(toStore))
    } catch (e) {
      console.warn(`useLocalStorage: could not write key "${key}"`, e)
    }
  }, [key, storedValue])

  const removeValue = useCallback(() => {
    try {
      window.localStorage.removeItem(key)
      setStoredValue(initialValue)
    } catch {/* ignore */}
  }, [key, initialValue])

  return [storedValue, setValue, removeValue] as const
}

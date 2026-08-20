import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ThemeState {
  theme: 'light' | 'dark'
  toggleTheme: () => void
  setTheme: (theme: 'light' | 'dark') => void
  initTheme: () => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'light',
      
      setTheme: (theme) => {
        set({ theme })
        document.documentElement.classList.toggle('dark', theme === 'dark')
      },

      toggleTheme: () => {
        const newTheme = get().theme === 'light' ? 'dark' : 'light'
        get().setTheme(newTheme)
      },

      initTheme: () => {
        const savedTheme = get().theme
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        
        // If there's a saved theme, use it. Otherwise, use system preference.
        const effectiveTheme = savedTheme || (prefersDark ? 'dark' : 'light')
        get().setTheme(effectiveTheme as 'light' | 'dark')
      },
    }),
    {
      name: 'cur-mis-theme',
    }
  )
)

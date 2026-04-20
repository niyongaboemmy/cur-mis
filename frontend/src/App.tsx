import { Routes, Route } from 'react-router-dom'
import MainLayout           from '@/layouts/MainLayout'
import HomePage             from '@/pages/HomePage'
import LoginPage            from '@/pages/LoginPage'
import VerifyOtpPage        from '@/pages/VerifyOtpPage'
import ForgotPasswordPage   from '@/pages/ForgotPasswordPage'
import NotFoundPage         from '@/pages/NotFoundPage'
import ProtectedRoute       from '@/components/layout/ProtectedRoute'
import ErrorBoundary        from '@/components/layout/ErrorBoundary'
import { useEffect }        from 'react'
import { useThemeStore }    from '@/store/themeStore'

function App() {
  const initTheme = useThemeStore((state) => state.initTheme)

  useEffect(() => {
    initTheme()
  }, [initTheme])

  return (
    <ErrorBoundary>
      <Routes>
        {/* Public */}
        <Route path="/login"           element={<LoginPage />} />
        <Route path="/verify-otp"      element={<VerifyOtpPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />

        {/* Protected — requires valid JWT in Zustand store */}
        <Route element={<ProtectedRoute />}>
          <Route element={<MainLayout />}>
            <Route path="/"  element={<HomePage />} />
            {/* Add more protected routes here */}
          </Route>
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </ErrorBoundary>
  )
}

export default App

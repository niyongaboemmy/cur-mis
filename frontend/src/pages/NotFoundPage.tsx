import { Link } from 'react-router-dom'
import { Home, Compass } from 'lucide-react'
import { motion } from 'framer-motion'
import Logo from '@/components/brand/Logo'

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center p-6 bg-[rgb(var(--bg-app))] dark:bg-ink-900">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md"
      >
        <div className="mx-auto mb-8"><Logo to="/" /></div>

        <p className="text-[96px] leading-none font-semibold text-primary-600 tracking-tight">
          404
        </p>
        <h1 className="text-[22px] font-semibold text-ink-900 dark:text-white mt-3 tracking-tight">
          This page took a sabbatical.
        </h1>
        <p className="text-ink-500 dark:text-ink-400 mt-2 text-[13.5px]">
          The URL you followed does not exist on CUR-MIS — or has been moved.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-2">
          <Link to="/" className="btn-primary">
            <Home className="h-4 w-4" />
            Back to dashboard
          </Link>
          <Link to="/students" className="btn-secondary">
            <Compass className="h-4 w-4" />
            Explore modules
          </Link>
        </div>
      </motion.div>
    </div>
  )
}

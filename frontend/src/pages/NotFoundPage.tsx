import { Link } from 'react-router-dom'
import { Home } from 'lucide-react'

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center p-6">
      <p className="text-8xl font-extrabold text-primary-200">404</p>
      <h1 className="text-2xl font-bold text-gray-800 mt-4">Page not found</h1>
      <p className="text-gray-500 mt-2 max-w-sm">
        The page you are looking for does not exist or has been moved.
      </p>
      <Link to="/" className="btn-primary mt-6">
        <Home className="h-4 w-4" />
        Back to home
      </Link>
    </div>
  )
}

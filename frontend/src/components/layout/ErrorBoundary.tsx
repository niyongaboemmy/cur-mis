import { Component, type ReactNode, type ErrorInfo } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  error: Error | null
}

// sessionStorage key used to prevent infinite reload loops on persistent chunk errors
const CHUNK_RELOAD_KEY = 'cur-mis-chunk-reload-attempted'

function isChunkError(error: Error): boolean {
  const msg = error.message ?? ''
  return (
    error.name === 'ChunkLoadError' ||
    msg.includes('Loading chunk') ||
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('Unable to preload CSS for') ||
    msg.includes('Loading CSS chunk')
  )
}

/**
 * React error boundary — catches render errors in child tree and shows a
 * recovery UI instead of crashing the whole app.
 *
 * For chunk-load errors (lazy import failures caused by network hiccups or
 * a stale browser cache after a new deployment) it automatically reloads
 * the page once, which almost always resolves the issue.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)

    // Chunk-load errors are usually transient (network blip or stale cache after
    // a new deployment). Reload once automatically; guard against infinite loops
    // with sessionStorage so we only retry once per browser session.
    if (isChunkError(error)) {
      const alreadyRetried = sessionStorage.getItem(CHUNK_RELOAD_KEY)
      if (!alreadyRetried) {
        sessionStorage.setItem(CHUNK_RELOAD_KEY, '1')
        window.location.reload()
        return
      }
    }
  }

  reset = () => {
    sessionStorage.removeItem(CHUNK_RELOAD_KEY)
    this.setState({ error: null })
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="min-h-[300px] flex flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
            <AlertTriangle className="h-7 w-7 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Something went wrong</h2>
            <p className="text-sm text-gray-500 dark:text-ink-400 mt-1 max-w-sm">
              An unexpected error occurred. Try refreshing the page.
            </p>
            {/* Always show the error message so it's visible in browser DevTools
                and helps diagnose production issues */}
            <pre className="mt-3 text-left text-xs bg-gray-100 dark:bg-ink-900 text-gray-700 dark:text-ink-300 p-3 rounded overflow-auto max-w-md max-h-32">
              {this.state.error.message}
            </pre>
          </div>
          <button onClick={this.reset} className="btn-secondary text-sm">
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

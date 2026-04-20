import { Component, type ReactNode, type ErrorInfo } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children:  ReactNode
  fallback?: ReactNode
}

interface State {
  error: Error | null
}

/**
 * React error boundary — catches render errors in child tree and shows a
 * recovery UI instead of crashing the whole app.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <SomeFeature />
 *   </ErrorBoundary>
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Replace with a real logging service in production
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  reset = () => this.setState({ error: null })

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="min-h-[300px] flex flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center">
            <AlertTriangle className="h-7 w-7 text-red-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Something went wrong</h2>
            <p className="text-sm text-gray-500 mt-1 max-w-sm">
              An unexpected error occurred. Try refreshing the page.
            </p>
            {import.meta.env.DEV && (
              <pre className="mt-3 text-left text-xs bg-gray-100 text-gray-700 p-3 rounded overflow-auto max-w-md max-h-32">
                {this.state.error.message}
              </pre>
            )}
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

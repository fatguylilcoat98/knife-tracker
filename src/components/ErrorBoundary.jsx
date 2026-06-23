import { Component } from 'react'

// Catches render-time errors so a single broken screen doesn't white-out the
// whole app. Offers a reload as the simplest recovery for field users.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="ae-card p-6 max-w-md text-center">
            <h1 className="ae-h1 mb-2">Something went wrong</h1>
            <p className="ae-muted text-sm mb-4">
              The app hit an unexpected error. Reloading usually clears it.
            </p>
            <button
              type="button"
              className="ae-btn"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

import { Component } from 'react'

/**
 * The last line of defence: a readable message instead of a blank page when something
 * in the page crashes. Inside the app (`inApp`) only the page is replaced and the menu
 * keeps working; the layout gives it a new key on every page change, so moving on clears it.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Only the error and where it happened, never what was on the page.
    console.error('UI error:', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    const message = (
      <div className="card-soft" role="alert" style={{ maxWidth: 420 }}>
        <h1 className="h3">Something broke on this page</h1>
        <p className="text-2 small-text mt-2">Your tasks and points are saved. Reloading usually fixes it.</p>
        <button type="button" className="btn primary mt-3" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    )
    return this.props.inApp ? message : <div className="full-center">{message}</div>
  }
}

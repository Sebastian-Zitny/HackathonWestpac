import { Component, type ReactNode } from 'react'
import { Button } from '@westpac/ui/button'

/** Stops a rendering error from blanking the whole app; shows a recoverable message instead. */
export class ErrorBoundary extends Component<{ children: ReactNode; onReset?: () => void }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div role="alert" className="m-2 rounded-3xl border border-border-danger-mild bg-surface-mono p-3">
        <p className="typography-body-9 font-bold text-text-heading">This screen couldn't load</p>
        <p className="mt-0.5 typography-body-10 text-text-body">The app and the backend may be from different versions. Restart the backend from the same folder as the app, then try again.</p>
        <p className="mt-1 break-words text-[0.75rem] text-text-muted">{this.state.error.message}</p>
        <Button look="primary" size="medium" className="mt-2" onClick={() => { this.setState({ error: null }); this.props.onReset?.() }}>Back to home</Button>
      </div>
    )
  }
}

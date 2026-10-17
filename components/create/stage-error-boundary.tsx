'use client'

import { Component, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { failed: boolean }

/**
 * Catches WebGL / R3F / chunk-load crashes when remounting the character preview
 * (common when going back Look ↔ Personality on mobile).
 */
export class StageErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error) {
    console.error('[CreateStage]', error)
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-3 px-4 text-center">
          <p className="text-sm text-neutral-600">Preview needed a refresh.</p>
          <button
            type="button"
            className="min-h-11 rounded-full bg-white px-4 text-sm font-medium text-neutral-800 shadow-sm ring-1 ring-black/5"
            onClick={() => this.setState({ failed: false })}
          >
            Reload preview
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

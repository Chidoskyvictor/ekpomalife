'use client'

import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }

/**
 * Catches R3F / drei failures so one bad mesh does not hard-reload the whole app in dev.
 */
export class WorldCanvasBoundary extends Component<
  Props,
  { error: Error | null }
> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[world-canvas]', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="absolute inset-0 grid place-items-center app-wash p-6 text-center">
          <p className="text-sm text-[#122846]">Map could not load. Refresh once — if it keeps failing, check the console.</p>
        </div>
      )
    }
    return this.props.children
  }
}

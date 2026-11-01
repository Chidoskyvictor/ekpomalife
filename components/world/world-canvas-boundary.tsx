'use client'

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { CampusPoster } from './campus-poster'
import styles from './campus-poster.module.css'

type Props = { children: ReactNode }

/**
 * Catches R3F / drei failures (a GLB that failed to download, a bad mesh) so one
 * bad asset does not take down the whole app. Shows the campus poster with a retry.
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
      const offline = typeof navigator !== 'undefined' && !navigator.onLine
      return (
        <CampusPoster>
          <div className={styles.card} role="alert">
            <p className={styles.title}>{offline ? 'You’re offline' : 'Map didn’t load'}</p>
            <p className={styles.body}>
              {offline
                ? 'The map needs data to download. Turn on data or Wi-Fi, then retry.'
                : 'Part of the map failed to download, often from a weak signal. Retry to try again.'}
            </p>
            {/* A full reload clears the failed downloads from the loader cache */}
            <button type="button" className={styles.button} onClick={() => window.location.reload()}>
              Retry
            </button>
          </div>
        </CampusPoster>
      )
    }
    return this.props.children
  }
}

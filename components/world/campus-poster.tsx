import type { ReactNode } from 'react'
import styles from './campus-poster.module.css'

/** Plain full-screen backdrop for the WebGL and map-error cards (no picture). */
export function CampusPoster({ children }: { children?: ReactNode }) {
  return <div className={`${styles.poster} app-wash`}>{children}</div>
}

'use client'

import { ExternalLink } from 'lucide-react'
import { safeLink } from '@/lib/game/club-songs'
import type { PromotedSong } from '@/lib/game/venues-api'
import styles from './club-song-banner.module.css'

/** "Club radio · Artist / Title" with a Listen button to the promoted song on the LED screen. */
export function ClubSongBanner({ song }: { song: PromotedSong | null }) {
  const link = safeLink(song?.linkUrl)
  if (!song || !link) return null
  const cover = safeLink(song.coverUrl)
  return (
    <div className={styles.banner} role="status">
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element -- admin-supplied remote cover, tiny
        <img className={styles.cover} src={cover} alt="" referrerPolicy="no-referrer" />
      ) : (
        <span className={styles.note} aria-hidden="true">
          🎵
        </span>
      )}
      <span className={styles.text}>
        <small>Club radio · {song.artist}</small>
        <strong>{song.title}</strong>
      </span>
      <a className={styles.go} href={link} target="_blank" rel="noopener noreferrer">
        Listen
        <ExternalLink size={14} aria-hidden="true" />
      </a>
    </div>
  )
}

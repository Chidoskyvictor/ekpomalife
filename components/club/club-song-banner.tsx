'use client'

import { ExternalLink, Music2 } from 'lucide-react'
import { useSyncExternalStore, type CSSProperties } from 'react'
import { clubTrackIndex, SOUND_EVENT } from '@/lib/audio/music'
import { safeLink } from '@/lib/game/club-songs'
import type { PromotedSong } from '@/lib/game/venues-api'
import { requestOpenMusic } from '@/lib/music/open-music'
import { playTrack } from '@/lib/music/player'
import { TRACKS } from '@/lib/music/tracks'
import styles from './club-song-banner.module.css'

function useClubTrack() {
  const index = useSyncExternalStore(
    (f) => {
      window.addEventListener(SOUND_EVENT, f)
      return () => window.removeEventListener(SOUND_EVENT, f)
    },
    clubTrackIndex,
    () => -1,
  )
  return index >= 0 ? (TRACKS[index] ?? null) : null
}

function Bars() {
  return (
    <span className={styles.eq} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  )
}

/**
 * The club's Now Playing card. A song an admin promoted on the LED screen shows first (with its Listen
 * link); otherwise it shows the house set track that is really playing (lib/music/tracks.ts) with a spinning
 * disc. Tap: a track with a stream link opens it in a new tab, any other opens the phone's Music app on it.
 */
export function ClubSongBanner({ song }: { song: PromotedSong | null }) {
  const track = useClubTrack()
  const link = safeLink(song?.linkUrl)

  if (song && link) {
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
          <small>
            <Bars />
            Club radio · {song.artist}
          </small>
          <strong>{song.title}</strong>
        </span>
        <a className={styles.go} href={link} target="_blank" rel="noopener noreferrer" aria-label={`Listen to ${song.title}`}>
          <ExternalLink size={18} aria-hidden="true" />
        </a>
      </div>
    )
  }

  if (!track) return null
  const ext = safeLink(track.link?.href)
  const style = { '--from': track.art.from, '--to': track.art.to, '--glow': track.art.glow } as CSSProperties
  const label = ext ? (track.link?.label ?? 'Listen') : 'Open in Music'
  const body = (
    <>
      <span className={styles.disc} style={style} aria-hidden="true">
        <span className={styles.discGlyph}>{track.art.glyph}</span>
        <span className={styles.hole} />
      </span>
      <span className={styles.text}>
        <small>
          <Bars />
          {track.artist}
        </small>
        <strong>{track.title}</strong>
        <span className={styles.hint}>
          {label}
        </span>
      </span>
      <span className={styles.go} aria-hidden="true">
        {ext ? <ExternalLink size={18} /> : <Music2 size={18} />}
      </span>
    </>
  )
  return ext ? (
    <a className={`${styles.banner} ${styles.house}`} href={ext} target="_blank" rel="noopener noreferrer" aria-label={`${track.title} by ${track.artist}. ${label}`}>
      {body}
    </a>
  ) : (
    <button
      type="button"
      className={`${styles.banner} ${styles.house}`}
      aria-label={`${track.title} by ${track.artist}. ${label}`}
      onClick={() => {
        playTrack(track.id)
        requestOpenMusic()
      }}
    >
      {body}
    </button>
  )
}

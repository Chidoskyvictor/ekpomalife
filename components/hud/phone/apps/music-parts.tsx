'use client'

import { Heart, Pause, Play, SkipForward } from 'lucide-react'
import type { CSSProperties } from 'react'
import { hapticTap } from '@/components/hud/haptic'
import { next, toggle, toggleLike, useMusicPlayer, useTrackStats } from '@/lib/music/player'
import { formatCount, trackById, type Track } from '@/lib/music/tracks'
import styles from './music.module.css'

/** Generated album art: our gradient, a soft glow, a big sticker glyph and the title in bold. */
export function TrackArt({ track, size }: { track: Track; size: 'sm' | 'md' | 'xl' }) {
  const style = { '--from': track.art.from, '--to': track.art.to, '--glow': track.art.glow } as CSSProperties
  return (
    <div className={`${styles.art} ${styles[`art_${size}`]}`} style={style} aria-hidden="true">
      <span className={styles.artRing} />
      <span className={styles.artGlyph}>{track.art.glyph}</span>
      {size !== 'sm' ? <span className={styles.artTitle}>{track.title}</span> : null}
    </div>
  )
}

/** Heart + count. One heart per player; tap again to take it back. */
export function LikeButton({ id, big = false }: { id: string; big?: boolean }) {
  const { byId } = useTrackStats()
  const t = byId[id]
  const liked = t?.liked ?? false
  return (
    <button
      type="button"
      className={`${styles.like} ${big ? styles.likeBig : ''} ${liked ? styles.likeOn : ''}`}
      aria-pressed={liked}
      aria-label={liked ? 'Unlike' : 'Like'}
      onClick={(e) => {
        e.stopPropagation()
        hapticTap()
        void toggleLike(id)
      }}
    >
      <Heart size={big ? 22 : 18} fill={liked ? 'currentColor' : 'none'} aria-hidden="true" />
      <span>{t ? formatCount(t.likes) : '–'}</span>
    </button>
  )
}

/** The animated bars next to the song that is playing. */
export function Equalizer({ playing }: { playing: boolean }) {
  return (
    <span className={`${styles.eq} ${playing ? styles.eqOn : ''}`} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  )
}

/** Now Playing bar: stays on screen in every phone app while a song is loaded. Tap it to open the player. */
export function MiniBar({ onOpen }: { onOpen: () => void }) {
  const p = useMusicPlayer()
  const track = trackById(p.id)
  if (!track) return null
  const pct = p.duration > 0 ? Math.min(100, (p.time / p.duration) * 100) : 0
  return (
    <div className={styles.mini} role="region" aria-label="Now playing">
      <span className={styles.miniProgress} style={{ width: `${pct}%` }} aria-hidden="true" />
      <button type="button" className={styles.miniMain} onClick={onOpen} aria-label={`Open player: ${track.title}`}>
        <TrackArt track={track} size="sm" />
        <span className={styles.miniText}>
          <strong>{track.title}</strong>
          <small>{track.artist}</small>
        </span>
      </button>
      <button
        type="button"
        className={styles.miniBtn}
        aria-label={p.playing ? 'Pause' : 'Play'}
        onClick={() => {
          hapticTap()
          toggle()
        }}
      >
        {p.playing ? <Pause size={22} fill="currentColor" aria-hidden="true" /> : <Play size={22} fill="currentColor" aria-hidden="true" />}
      </button>
      <button type="button" className={styles.miniBtn} aria-label="Next song" onClick={() => next(true)}>
        <SkipForward size={20} fill="currentColor" aria-hidden="true" />
      </button>
    </div>
  )
}

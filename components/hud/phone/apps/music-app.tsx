'use client'

import { ExternalLink, Music2, Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { hapticTap } from '@/components/hud/haptic'
import { loadStats, next, previous, seek, toggle, useClubPlaying, useMusicPlayer, useTrackStats } from '@/lib/music/player'
import { formatCount, formatTime, TRACKS, trackById, type Track } from '@/lib/music/tracks'
import { AppHeader } from '../app-header'
import { Equalizer, LikeButton, MiniBar, TrackArt } from './music-parts'
import styles from './music.module.css'

type Sort = 'top' | 'new'

function ClubBanner() {
  return (
    <div className={styles.club} role="status">
      <span className={styles.clubDot} aria-hidden="true" />
      <span>
        <strong>Playing now at Sazza</strong>
        <small>The club is playing this set. Press play to listen here instead.</small>
      </span>
    </div>
  )
}

export function MusicApp({ onHome }: { onHome: () => void }) {
  const p = useMusicPlayer()
  const { byId, loaded, failed } = useTrackStats()
  const club = useClubPlaying()
  const [sort, setSort] = useState<Sort>('top')
  // Opening the app while a song is on goes straight to the player
  const [view, setView] = useState<'list' | 'player'>(p.id ? 'player' : 'list')

  useEffect(() => {
    void loadStats()
  }, [])

  const streams = (t: Track) => byId[t.id]?.streams ?? 0
  const sorted = useMemo(() => {
    const order = new Map(TRACKS.map((t, i) => [t.id, i]))
    const list = [...TRACKS]
    if (sort === 'top') list.sort((a, b) => streams(b) - streams(a) || order.get(a.id)! - order.get(b.id)!)
    else list.sort((a, b) => b.addedAt.localeCompare(a.addedAt) || order.get(b.id)! - order.get(a.id)!)
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, byId])
  const hero = useMemo(() => [...TRACKS].sort((a, b) => streams(b) - streams(a))[0]!, [byId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (view === 'player' && p.id) return <PlayerView onBack={() => setView('list')} onHome={onHome} />

  const streamLabel = (t: Track) => (loaded ? `${formatCount(streams(t))} ${streams(t) === 1 ? 'stream' : 'streams'}` : failed ? 'Streams unavailable' : '… streams')

  return (
    <div className={styles.app}>
      <AppHeader title="Music" subtitle="The club's songs" onBack={onHome} backLabel="Back home" bar />
      <div className={styles.scroll}>
        {club ? <ClubBanner /> : null}

        <section className={styles.hero} aria-label="Most streamed">
          <TrackArt track={hero} size="xl" />
          <div className={styles.heroInfo}>
            <span className={styles.heroBadge}>
              <Music2 size={14} aria-hidden="true" /> Most streamed
            </span>
            <h3 className={styles.heroTitle}>{hero.title}</h3>
            <p className={styles.heroArtist}>{hero.artist}</p>
            <p className={styles.heroStats}>{streamLabel(hero)}</p>
            <div className={styles.heroActions}>
              <button
                type="button"
                className={styles.playBig}
                onClick={() => {
                  hapticTap()
                  toggle(hero.id)
                  setView('player')
                }}
              >
                {p.id === hero.id && p.playing ? <Pause size={18} fill="currentColor" aria-hidden="true" /> : <Play size={18} fill="currentColor" aria-hidden="true" />}
                {p.id === hero.id && p.playing ? 'Pause' : 'Play'}
              </button>
              <LikeButton id={hero.id} />
            </div>
          </div>
        </section>

        {failed ? (
          <p className={styles.note} role="alert">
            Couldn&apos;t load streams and hearts.{' '}
            <button type="button" onClick={() => void loadStats()}>
              Retry
            </button>
          </p>
        ) : null}

        <div className={styles.tabs} role="tablist" aria-label="Sort songs">
          {(
            [
              ['top', 'Top'],
              ['new', 'New'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={sort === id} className={`${styles.tab} ${sort === id ? styles.tabOn : ''}`} onClick={() => setSort(id)}>
              {label}
            </button>
          ))}
        </div>

        <ul className={styles.list}>
          {sorted.map((t, i) => {
            const active = p.id === t.id
            return (
              <li key={t.id} className={`${styles.row} ${active ? styles.rowOn : ''}`}>
                <button
                  type="button"
                  className={styles.rowMain}
                  aria-label={`${active && p.playing ? 'Pause' : 'Play'} ${t.title} by ${t.artist}`}
                  onClick={() => {
                    hapticTap()
                    toggle(t.id)
                  }}
                >
                  {sort === 'top' ? <span className={styles.rank}>{i + 1}</span> : null}
                  <span className={styles.thumb}>
                    <TrackArt track={t} size="md" />
                    {active ? (
                      <span className={styles.thumbPlay} aria-hidden="true">
                        {p.playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                      </span>
                    ) : null}
                  </span>
                  <span className={styles.rowText}>
                    <strong>{t.title}</strong>
                    <small>{t.artist}</small>
                    <small className={styles.streams}>
                      {active ? <Equalizer playing={p.playing} /> : null}
                      {streamLabel(t)}
                    </small>
                  </span>
                </button>
                <LikeButton id={t.id} />
              </li>
            )
          })}
        </ul>
      </div>
      <MiniBar onOpen={() => setView('player')} />
    </div>
  )
}

function PlayerView({ onBack, onHome }: { onBack: () => void; onHome: () => void }) {
  const p = useMusicPlayer()
  const { byId } = useTrackStats()
  const club = useClubPlaying()
  const track = trackById(p.id)
  if (!track) return null
  const pct = p.duration > 0 ? (p.time / p.duration) * 100 : 0
  const s = byId[track.id]
  return (
    <div className={styles.app}>
      <AppHeader title="Now playing" subtitle={club ? 'Playing now at Sazza' : undefined} onBack={onBack} backLabel="Back to songs" bar right={<button type="button" className={styles.homeLink} onClick={onHome}>Home</button>} />
      <div className={`${styles.scroll} ${styles.playerScroll}`}>
        <div className={styles.playerArt}>
          <TrackArt track={track} size="xl" />
        </div>
        <div className={styles.playerHead}>
          <div className={styles.playerTitles}>
            <h3>{track.title}</h3>
            <p>{track.artist}</p>
          </div>
          <LikeButton id={track.id} big />
        </div>
        <p className={styles.playerStats}>{s ? `${formatCount(s.streams)} ${s.streams === 1 ? 'stream' : 'streams'}` : ''}</p>

        <div className={styles.seek}>
          <input
            type="range"
            min={0}
            max={Math.max(1, Math.floor(p.duration))}
            step={1}
            value={Math.min(Math.floor(p.time), Math.max(1, Math.floor(p.duration)))}
            onChange={(e) => seek(Number(e.target.value))}
            aria-label="Seek"
            aria-valuetext={`${formatTime(p.time)} of ${formatTime(p.duration)}`}
            disabled={!p.duration}
            style={{ ['--pct' as string]: `${pct}%` }}
          />
          <div className={styles.times}>
            <span>{formatTime(p.time)}</span>
            <span>{formatTime(p.duration)}</span>
          </div>
        </div>

        <div className={styles.controls}>
          <button type="button" className={styles.ctl} aria-label="Previous song" onClick={() => previous()}>
            <SkipBack size={26} fill="currentColor" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`${styles.ctl} ${styles.ctlMain}`}
            aria-label={p.playing ? 'Pause' : 'Play'}
            onClick={() => {
              hapticTap()
              toggle()
            }}
          >
            {p.playing ? <Pause size={30} fill="currentColor" aria-hidden="true" /> : <Play size={30} fill="currentColor" aria-hidden="true" />}
          </button>
          <button type="button" className={styles.ctl} aria-label="Next song" onClick={() => next(true)}>
            <SkipForward size={26} fill="currentColor" aria-hidden="true" />
          </button>
        </div>

        <p className={styles.tag}>{track.tag}</p>
        {track.link ? (
          <a className={styles.external} href={track.link.href} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={18} aria-hidden="true" /> {track.link.label}
          </a>
        ) : null}
      </div>
    </div>
  )
}

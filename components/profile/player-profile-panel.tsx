'use client'

import { PlayerFace } from '@/components/look/player-face'
import { useCallback, useEffect, useState } from 'react'
import { fetchMyProfile, fetchPlayerProfile } from '@/lib/game/profile-api'
import type { PlayerProfile } from '@/lib/game/profile-types'
import { formatNaira } from '@/lib/game/live'
import { fetchHeadToHead } from '@/lib/game/games-hub-api'
import { requestOpenGames } from '@/lib/game/open-games'
import { ProfileEditSheet } from './profile-edit-sheet'
import { RacerCard } from './racer-card'
import styles from './profile.module.css'

function formatJoinDate(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' }).format(new Date(iso))
  } catch {
    return 'Recently'
  }
}

export function PlayerProfilePanel({
  playerId,
  compact,
}: {
  /** Omit or `me` for the signed-in player. */
  playerId?: string | null
  compact?: boolean
}) {
  const [profile, setProfile] = useState<PlayerProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [h2h, setH2h] = useState<{ wins: number; losses: number; draws: number } | null>(null)
  const viewedUsername = profile && !profile.isOwner ? profile.username : null
  useEffect(() => {
    if (!viewedUsername) return
    let alive = true
    void fetchHeadToHead(viewedUsername).then((res) => alive && res.ok && setH2h(res))
    return () => {
      alive = false
    }
  }, [viewedUsername])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data =
        !playerId || playerId === 'me' ? await fetchMyProfile() : await fetchPlayerProfile(playerId)
      setProfile(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load profile.')
      setProfile(null)
    } finally {
      setLoading(false)
    }
  }, [playerId])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return <p className={styles.muted}>Loading profile…</p>
  }
  if (error || !profile) {
    return <p className={styles.error}>{error ?? 'Profile unavailable.'}</p>
  }

  const initial =
    (profile.displayName.trim()[0] || profile.username[0] || 'E').toUpperCase()

  return (
    <div className={styles.wrap}>
      <div className={styles.hero}>
        <PlayerFace
          className={styles.avatar}
          look={profile.avatar.look}
          color={profile.avatar.color}
          emoji={profile.avatar.emoji}
          label={initial}
          size={72}
        />
        <div className={styles.meta}>
          {/* Your real name is only shown to you; everyone else sees the @username */}
          <h3 className={styles.name}>{profile.isOwner ? profile.displayName : `@${profile.username}`}</h3>
          <p className={styles.sub}>
            {[profile.isOwner ? `@${profile.username}` : null, profile.studyLevel, profile.department]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {profile.isOwner ? <p className={styles.sub}>🔒 Your name is only visible to you</p> : null}
          <p className={styles.sub}>Joined {formatJoinDate(profile.joinDate)}</p>
        </div>
      </div>

      {profile.bio ? <p className={styles.bio}>{profile.bio}</p> : (
        <p className={styles.muted}>
          {profile.isOwner ? 'Add a short bio so friends know your vibe.' : 'No bio yet.'}
        </p>
      )}

      <div className={styles.stats}>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Days in Ekpoma</p>
          <p className={styles.statValue}>{profile.stats.daysPlayed}</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Campus rep</p>
          <p className={styles.statValue}>{profile.stats.reputation}</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Whot wins</p>
          <p className={styles.statValue}>{profile.stats.whotWins}</p>
        </div>
      </div>

      <RacerCard userId={profile.userId} />

      {profile.isOwner && profile.private && !compact ? (
        <div className={styles.ownerBlock}>
          <p className={styles.ownerTitle}>Just for you</p>
          <div className={styles.ownerRow}>
            <span>Pocket</span>
            <span>{formatNaira(profile.private.cash)}</span>
          </div>
          <p className={styles.hint} style={{ marginTop: 8 }}>
            Only you see balance here. Friends see your days and rep, not your money.
          </p>
        </div>
      ) : null}

      {profile.isOwner ? (
        <div className={styles.actions}>
          <button type="button" className={styles.editBtn} onClick={() => setEditOpen(true)}>
            Edit profile
          </button>
        </div>
      ) : (
        <div className={styles.actions}>
          {h2h && h2h.wins + h2h.losses + h2h.draws > 0 ? (
            <p className={styles.hint} style={{ width: '100%', textAlign: 'center' }}>
              Head to head: you {h2h.wins}W · {h2h.losses}L{h2h.draws ? ` · ${h2h.draws}D` : ''} vs @{profile.username}
            </p>
          ) : null}
          <button type="button" className={styles.editBtn} onClick={() => requestOpenGames({ username: profile.username })}>
            🎮 Challenge
          </button>
        </div>
      )}

      {profile.isOwner ? (
        <ProfileEditSheet
          open={editOpen}
          onOpenChange={setEditOpen}
          profile={profile}
          onSaved={setProfile}
        />
      ) : null}
    </div>
  )
}

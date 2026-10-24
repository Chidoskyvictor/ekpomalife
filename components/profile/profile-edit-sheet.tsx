'use client'

import { useEffect, useState } from 'react'
import { Drawer } from 'vaul'
import { Button } from '@/components/arc/button/button'
import { validateDisplayName } from '@/lib/game/display-name'
import { patchMyProfile } from '@/lib/game/profile-api'
import {
  AVATAR_COLORS,
  AVATAR_EMOJIS,
  PROFILE_DEPARTMENTS,
  STUDY_LEVELS,
  type StudyLevel,
} from '@/lib/game/profile-constants'
import type { PlayerProfile, PlayerProfilePatch } from '@/lib/game/profile-types'
import { hapticTap } from '@/components/hud/haptic'
import drawerStyles from '@/components/hud/hud-drawer.module.css'
import styles from './profile.module.css'

export function ProfileEditSheet({
  open,
  onOpenChange,
  profile,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  profile: PlayerProfile
  onSaved: (next: PlayerProfile) => void
}) {
  const [displayName, setDisplayName] = useState(profile.displayName)
  const [avatarColor, setAvatarColor] = useState(profile.avatar.color)
  const [avatarEmoji, setAvatarEmoji] = useState<string | null>(profile.avatar.emoji)
  const [department, setDepartment] = useState(profile.department)
  const [studyLevel, setStudyLevel] = useState<StudyLevel>(profile.studyLevel)
  const [bio, setBio] = useState(profile.bio)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setDisplayName(profile.displayName)
    setAvatarColor(profile.avatar.color)
    setAvatarEmoji(profile.avatar.emoji)
    setDepartment(profile.department)
    setStudyLevel(profile.studyLevel)
    setBio(profile.bio)
    setError(null)
  }, [open, profile])

  async function save() {
    const nameCheck = validateDisplayName(displayName)
    if (!nameCheck.ok) {
      setError(nameCheck.error)
      return
    }
    if (bio.trim().length > 120) {
      setError('Bio can be 120 characters at most.')
      return
    }
    setSaving(true)
    setError(null)
    const patch: PlayerProfilePatch = {
      displayName: nameCheck.name,
      avatarColor,
      avatarEmoji,
      department,
      studyLevel,
      bio: bio.trim(),
    }
    try {
      const next = await patchMyProfile(patch)
      onSaved(next)
      hapticTap()
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save profile.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer.Root
      open={open}
      onOpenChange={(next) => {
        if (next) hapticTap()
        onOpenChange(next)
      }}
      shouldScaleBackground={false}
      snapPoints={[0.55, 0.92]}
      fadeFromIndex={0}
    >
      <Drawer.Portal>
        <Drawer.Overlay className={drawerStyles.overlay} />
        <Drawer.Content className={drawerStyles.content}>
          <div className={drawerStyles.handle} aria-hidden="true" />
          <div className={drawerStyles.header}>
            <Drawer.Title className={drawerStyles.title}>Edit profile</Drawer.Title>
            <Drawer.Description className={drawerStyles.description}>
              Your campus card is what friends see in Ekpoma.
            </Drawer.Description>
          </div>
          <div className={drawerStyles.body}>
            <div className={styles.form}>
              <div className={styles.field}>
                <label htmlFor="profile-display-name">Display name</label>
                <input
                  id="profile-display-name"
                  value={displayName}
                  maxLength={20}
                  onChange={(e) => setDisplayName(e.target.value)}
                  autoComplete="nickname"
                />
                <p className={styles.hint}>3–20 characters. Must be unique.</p>
              </div>

              <div className={styles.field}>
                <span>Avatar colour</span>
                <div className={styles.swatchRow} role="list">
                  {AVATAR_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={styles.swatch}
                      data-active={avatarColor === color}
                      style={{ background: color }}
                      aria-label={`Colour ${color}`}
                      onClick={() => setAvatarColor(color)}
                    />
                  ))}
                </div>
              </div>

              <div className={styles.field}>
                <span>Avatar emoji</span>
                <div className={styles.emojiRow}>
                  <button
                    type="button"
                    className={styles.emojiBtn}
                    data-active={avatarEmoji === null}
                    aria-label="No emoji"
                    onClick={() => setAvatarEmoji(null)}
                  >
                    —
                  </button>
                  {AVATAR_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className={styles.emojiBtn}
                      data-active={avatarEmoji === emoji}
                      aria-label={`Emoji ${emoji}`}
                      onClick={() => setAvatarEmoji(emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.field}>
                <label htmlFor="profile-department">Department</label>
                <select
                  id="profile-department"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                >
                  {PROFILE_DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              <div className={styles.field}>
                <label htmlFor="profile-level">Level</label>
                <select
                  id="profile-level"
                  value={studyLevel}
                  onChange={(e) => setStudyLevel(e.target.value as StudyLevel)}
                >
                  {STUDY_LEVELS.map((level) => (
                    <option key={level} value={level}>{level}</option>
                  ))}
                </select>
              </div>

              <div className={styles.field}>
                <label htmlFor="profile-bio">Bio</label>
                <textarea
                  id="profile-bio"
                  value={bio}
                  maxLength={120}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Say something kind about your campus journey."
                />
                <p className={styles.hint}>{bio.length}/120</p>
              </div>

              {error ? <p className={styles.error} role="alert">{error}</p> : null}

              <Button type="button" onClick={() => void save()} disabled={saving}>
                {saving ? 'Saving…' : 'Save profile'}
              </Button>
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

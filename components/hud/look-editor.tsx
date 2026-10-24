'use client'

import { useState } from 'react'
import { saveCharacterLook } from '@/lib/game/character-api'
import {
  BODIES,
  CLOTH_COLORS,
  HAIR_BY_BODY,
  HAIR_COLORS,
  OUTFIT_BY_BODY,
  SKIN_TONES,
  normalizeAppearance,
  type Appearance,
} from '@/lib/game/look'
import { outfitColorsFor } from '@/lib/game/outfit-config'
import styles from './profile-sheet.module.css'

function Pills<T extends string>({
  label,
  items,
  value,
  onPick,
}: {
  label: string
  items: { id: T; label: string }[]
  value: T
  onPick: (id: T) => void
}) {
  return (
    <div className={styles.editGroup}>
      <p className={styles.section}>{label}</p>
      <div className={styles.chips} role="group" aria-label={label}>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={item.id === value}
            className={`${styles.pick} ${item.id === value ? styles.pickOn : ''}`}
            onClick={() => onPick(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function Swatches({
  label,
  colors,
  value,
  onPick,
}: {
  label: string
  colors: readonly string[]
  value: string
  onPick: (color: string) => void
}) {
  const current = value.toUpperCase()
  return (
    <div className={styles.editGroup}>
      <p className={styles.section}>{label}</p>
      <div className={styles.swatches} role="group" aria-label={label}>
        {colors.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`${label} ${color}`}
            aria-pressed={color.toUpperCase() === current}
            className={styles.swatch}
            style={{ backgroundColor: color }}
            onClick={() => onPick(color.toUpperCase())}
          />
        ))}
      </div>
    </div>
  )
}

/** Change body, hair, outfit and colours from the profile sheet. The 3D stage above previews `draft`. */
export function LookEditor({
  draft,
  onDraft,
  onSaved,
  onCancel,
}: {
  draft: Appearance
  onDraft: (next: Appearance) => void
  onSaved: (saved: Appearance) => void
  onCancel: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<Appearance>) => onDraft(normalizeAppearance({ ...draft, ...patch }))

  const save = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    const result = await saveCharacterLook(draft)
    setBusy(false)
    if (!result.ok) {
      setError('Could not save your look. Try again.')
      return
    }
    onSaved(normalizeAppearance(result.appearance ?? draft))
  }

  return (
    <div className={styles.card}>
      <Pills label="Body" items={BODIES} value={draft.body} onPick={(body) => set({ body })} />
      <Pills label="Hair style" items={HAIR_BY_BODY[draft.body]} value={draft.hair} onPick={(hair) => set({ hair })} />
      <Pills
        label="Outfit"
        items={OUTFIT_BY_BODY[draft.body]}
        value={draft.outfit}
        onPick={(outfit) => {
          const preset = outfitColorsFor(draft.body, outfit)
          set({ outfit, ...(preset ? { topColor: preset.top, bottomColor: preset.bottom } : {}) })
        }}
      />
      <Swatches label="Skin tone" colors={SKIN_TONES} value={draft.skin} onPick={(skin) => set({ skin })} />
      <Swatches label="Hair colour" colors={HAIR_COLORS} value={draft.hairColor} onPick={(hairColor) => set({ hairColor })} />
      <Swatches label="Top" colors={CLOTH_COLORS} value={draft.topColor} onPick={(topColor) => set({ topColor })} />
      <Swatches label="Bottoms" colors={CLOTH_COLORS} value={draft.bottomColor} onPick={(bottomColor) => set({ bottomColor })} />

      {error ? (
        <p className={styles.editError} role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.editActions}>
        <button type="button" className={styles.editCancel} onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="button" className={styles.editSave} onClick={() => void save()} disabled={busy}>
          {busy ? 'Saving…' : 'Save look'}
        </button>
      </div>
    </div>
  )
}

import styles from './auth.module.css'

const LABELS = [
  'Weak like Indomie water',
  'Soft like puff-puff',
  'Solid',
  'Strong like Oshiomhole',
] as const

export function passwordScore(password: string, name: string, username: string) {
  if (!password) return 0
  let score = 0
  if (password.length >= 8) score += 1
  if (/[a-zA-Z]/.test(password) && /\d/.test(password)) score += 1
  if (/[^a-zA-Z0-9]/.test(password) || password.length >= 12) score += 1
  const lowered = password.toLowerCase()
  const namePart = name.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
  const simpleNumber = /^\d+$/.test(password)
  if (password.length >= 8 && !simpleNumber && (!namePart || !lowered.includes(namePart)) && (!username || !lowered.includes(username.toLowerCase()))) {
    score += 1
  }
  return Math.min(4, score)
}

export function PasswordMeter({ score }: { score: number }) {
  if (score <= 0) return null
  const label = LABELS[Math.min(score, 4) - 1]
  return (
    <div className={styles.meter} aria-live="polite">
      <div className={styles.meterRow}>
        {LABELS.map((_, index) => (
          <span
            key={index}
            className={styles.meterSeg}
            data-on={index < score ? '' : undefined}
          />
        ))}
      </div>
      <p className={styles.meterLabel}>{label}</p>
    </div>
  )
}

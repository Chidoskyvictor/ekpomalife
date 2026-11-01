'use client'

import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import { useReducedMotion } from 'motion/react'
import { createAccount, MIN_PASSWORD_LENGTH, USERNAME_PATTERN } from '@/lib/game/accounts'
import { redirectAfterAuth } from './auth-gate'
import { LobbyButton } from './lobby-button'
import { LobbyCheckbox } from './lobby-checkbox'
import { LobbyField } from './lobby-field'
import { PasswordMeter, passwordScore } from './password-meter'
import styles from './auth.module.css'

type Field = 'name' | 'username' | 'email' | 'password' | 'adult' | 'form'
type Values = { name: string; handle: string; email: string; password: string; isAdult: boolean }

/** Order matters: on submit, focus goes to the first field that fails. */
/** Each entry is also the input's DOM id. */
const FIELD_ORDER = ['name', 'username', 'email', 'password', 'adult'] as const
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function checkField(field: (typeof FIELD_ORDER)[number], v: Values): string | null {
  switch (field) {
    case 'name':
      return v.name.trim().length >= 2 ? null : 'Enter your name (at least 2 letters).'
    case 'username':
      return USERNAME_PATTERN.test(v.handle) ? null : 'Use 3–20 lowercase letters, numbers or _.'
    case 'email':
      return EMAIL_PATTERN.test(v.email.trim()) ? null : 'Enter a valid email, like you@email.com.'
    case 'password':
      return v.password.length >= MIN_PASSWORD_LENGTH ? null : `Use at least ${MIN_PASSWORD_LENGTH} characters.`
    case 'adult':
      return v.isAdult ? null : 'Tick this to confirm you’re 18+ and agree to the Terms.'
  }
}

function mapError(message: string): Field {
  const text = message.toLowerCase()
  if (text.includes('username')) return 'username'
  if (text.includes('email')) return 'email'
  if (text.includes('password')) return 'password'
  if (text.includes('18') || text.includes('terms')) return 'adult'
  if (text.includes('name')) return 'name'
  return 'form'
}

function focusField(field: Field) {
  if (field === 'form') return
  document.getElementById(field)?.focus()
}

async function celebrate(reduce: boolean) {
  if (reduce) return
  const confetti = (await import('canvas-confetti')).default
  await confetti({ particleCount: 110, spread: 72, origin: { y: 0.62 }, colors: ['#3d9ad6', '#2b7fff', '#ffd45a', '#ffffff'] })
}

export function SignupForm({ onShake }: { onShake: () => void }) {
  const reduce = useReducedMotion() ?? false
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isAdult, setIsAdult] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({})
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const handle = username.replace(/^@/, '').toLowerCase()
  const score = passwordScore(password, name, handle)
  const values: Values = { name, handle, email, password, isAdult }

  /** Validate one field when it loses focus (only once the user has typed, so tabbing past is quiet). */
  const blurCheck = (field: (typeof FIELD_ORDER)[number], touched: boolean) => {
    if (!touched) return
    const message = checkField(field, values)
    setErrors((prev) => ({ ...prev, [field]: message ?? undefined, form: undefined }))
  }

  /** Re-check a field that already shows an error as soon as it's fixed. */
  const clearIfFixed = (field: (typeof FIELD_ORDER)[number], next: Values) => {
    if (errors[field] && !checkField(field, next)) {
      setErrors((prev) => ({ ...prev, [field]: undefined }))
    }
  }

  const fail = (field: Field, message: string) => {
    setErrors({ [field]: message })
    onShake()
    setBusy(false)
    focusField(field)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    const next: Partial<Record<Field, string>> = {}
    for (const field of FIELD_ORDER) {
      const message = checkField(field, values)
      if (message) next[field] = message
    }
    const firstBad = FIELD_ORDER.find((field) => next[field])
    if (firstBad) {
      setErrors(next)
      onShake()
      focusField(firstBad)
      return
    }
    setBusy(true)
    setErrors({})
    const result = await createAccount({ name, username: handle, password, email, dateOfBirth: '', isAdult })
    if (!result.ok) {
      fail(mapError(result.error), result.error)
      return
    }
    await celebrate(reduce)
    await redirectAfterAuth(result.account)
  }

  return (
    <form onSubmit={submit} noValidate className={styles.form}>
      <LobbyField
        id="name"
        label="Name"
        icon="👤"
        value={name}
        onChange={(event) => {
          setName(event.target.value)
          clearIfFixed('name', { ...values, name: event.target.value })
        }}
        onBlur={() => blurCheck('name', name.length > 0)}
        placeholder="Ese Ehimen"
        autoComplete="name"
        maxLength={40}
        required
        error={errors.name}
      />
      <LobbyField
        id="username"
        label="Username"
        icon="🎮"
        value={username}
        onChange={(event) => {
          const raw = event.target.value.replace(/^@/, '')
          setUsername(raw)
          clearIfFixed('username', { ...values, handle: raw.toLowerCase() })
        }}
        onBlur={() => blurCheck('username', username.length > 0)}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={20}
        required
        placeholder="ese_star"
        error={errors.username}
        hint={
          handle ? (
            <p className={styles.handleChip}>
              @{handle}
            </p>
          ) : null
        }
      />
      <LobbyField
        id="email"
        label="Email"
        icon="✉️"
        type="email"
        value={email}
        onChange={(event) => {
          setEmail(event.target.value)
          clearIfFixed('email', { ...values, email: event.target.value })
        }}
        onBlur={() => blurCheck('email', email.length > 0)}
        placeholder="you@email.com"
        autoComplete="email"
        required
        error={errors.email}
      />
      <LobbyField
        id="password"
        label="Password"
        icon="🔒"
        type={showPassword ? 'text' : 'password'}
        value={password}
        onChange={(event) => {
          setPassword(event.target.value)
          clearIfFixed('password', { ...values, password: event.target.value })
        }}
        onBlur={() => blurCheck('password', password.length > 0)}
        placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
        autoComplete="new-password"
        required
        aria-describedby="password-rules"
        error={errors.password}
        hint={
          <p id="password-rules" className={styles.fieldHint}>
            At least {MIN_PASSWORD_LENGTH} characters. Mixing letters, numbers and a symbol makes it stronger.
          </p>
        }
        trailing={
          <button
            type="button"
            className={styles.eye}
            onClick={() => setShowPassword((on) => !on)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? '🙈' : '👁️'}
          </button>
        }
      />
      <PasswordMeter score={score} />
      <LobbyCheckbox
        id="adult"
        checked={isAdult}
        onChange={(next) => {
          setIsAdult(next)
          if (next) setErrors((prev) => ({ ...prev, adult: undefined }))
        }}
        invalid={Boolean(errors.adult)}
        describedBy={errors.adult ? 'adult-error' : undefined}
      >
        I&apos;m 18+ and I agree to the{' '}
        <Link href="/terms" className={styles.inlineLink}>
          Terms
        </Link>
      </LobbyCheckbox>
      {errors.adult ? <p id="adult-error" className={styles.fieldError} role="alert">{errors.adult}</p> : null}
      {errors.form ? <p className={styles.fieldError} role="alert">{errors.form}</p> : null}
      <LobbyButton type="submit" loading={busy}>
        Start my Ekpoma Life 🚀
      </LobbyButton>
    </form>
  )
}

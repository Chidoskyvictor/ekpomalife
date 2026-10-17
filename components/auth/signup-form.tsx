'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { useReducedMotion } from 'motion/react'
import { createAccount, MIN_PASSWORD_LENGTH, setSession } from '@/lib/game/accounts'
import { LobbyButton } from './lobby-button'
import { LobbyCheckbox } from './lobby-checkbox'
import { LobbyField } from './lobby-field'
import { PasswordMeter, passwordScore } from './password-meter'
import styles from './auth.module.css'

type Field = 'name' | 'username' | 'email' | 'password' | 'adult' | 'form'

function mapError(message: string): Field {
  const text = message.toLowerCase()
  if (text.includes('username')) return 'username'
  if (text.includes('email')) return 'email'
  if (text.includes('password')) return 'password'
  if (text.includes('18') || text.includes('terms')) return 'adult'
  if (text.includes('name')) return 'name'
  return 'form'
}

async function celebrate(reduce: boolean) {
  if (reduce) return
  const confetti = (await import('canvas-confetti')).default
  await confetti({ particleCount: 110, spread: 72, origin: { y: 0.62 }, colors: ['#3d9ad6', '#2b7fff', '#ffd45a', '#ffffff'] })
}

export function SignupForm({ onShake }: { onShake: () => void }) {
  const router = useRouter()
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
  const ready = name.trim().length >= 2 && handle.length >= 3 && email.includes('@') && password.length >= MIN_PASSWORD_LENGTH && isAdult

  const fail = (field: Field, message: string) => {
    setErrors({ [field]: message })
    onShake()
    setBusy(false)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setErrors({})
    const result = await createAccount({ name, username: handle, password, email, dateOfBirth: '', isAdult })
    if (!result.ok) {
      fail(mapError(result.error), result.error)
      return
    }
    setSession(result.account.username)
    await celebrate(reduce)
    router.replace('/look')
  }

  return (
    <form onSubmit={submit} noValidate className={styles.form}>
      <LobbyField
        id="name"
        label="Name"
        icon="👤"
        value={name}
        onChange={(event) => setName(event.target.value)}
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
        onChange={(event) => setUsername(event.target.value.replace(/^@/, ''))}
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
        onChange={(event) => setEmail(event.target.value)}
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
        onChange={(event) => setPassword(event.target.value)}
        autoComplete="new-password"
        required
        error={errors.password}
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
      <LobbyCheckbox checked={isAdult} onChange={setIsAdult}>
        I&apos;m 18+ and I agree to the{' '}
        <Link href="/terms" className={styles.inlineLink}>
          Terms
        </Link>
      </LobbyCheckbox>
      {errors.adult ? <p className={styles.fieldError} role="alert">{errors.adult}</p> : null}
      {errors.form ? <p className={styles.fieldError} role="alert">{errors.form}</p> : null}
      <LobbyButton type="submit" loading={busy} disabled={!ready}>
        Start my Ekpoma Life 🚀
      </LobbyButton>
    </form>
  )
}

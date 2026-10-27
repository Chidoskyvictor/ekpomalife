'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { verifyLogin } from '@/lib/game/accounts'
import { redirectAfterAuth } from './auth-gate'
import { LobbyButton } from './lobby-button'
import { LobbyField } from './lobby-field'
import styles from './auth.module.css'

export function LoginForm({ onShake }: { onShake: () => void }) {
  const search = useSearchParams()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  // A handle (with or without @) or the email used at signup
  const handle = username.trim().replace(/^@/, '')
  const isEmail = handle.includes('@')
  const ready = handle.length > 0 && password.length > 0
  const resetOk = search.get('reset') === '1'

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const result = await verifyLogin(handle, password)
    if (!result.ok) {
      setError(result.error)
      onShake()
      setBusy(false)
      return
    }
    await redirectAfterAuth(result.account)
  }

  return (
    <form onSubmit={submit} noValidate className={styles.form}>
      {resetOk ? (
        <p className={styles.stepCopy} role="status">
          Password updated. Log in to continue — we will send you to character setup if you have not finished it.
        </p>
      ) : null}
      <LobbyField
        id="login-username"
        label="Username or email"
        icon="🎮"
        value={username}
        onChange={(event) => setUsername(event.target.value.replace(/^@/, ''))}
        autoComplete="username"
        inputMode="email"
        autoCapitalize="none"
        spellCheck={false}
        required
        placeholder="ese_star or you@email.com"
        hint={
          handle && !isEmail ? (
            <p className={styles.handleChip}>@{handle.toLowerCase()}</p>
          ) : null
        }
      />
      <LobbyField
        id="login-password"
        label="Password"
        icon="🔒"
        type={showPassword ? 'text' : 'password'}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        autoComplete="current-password"
        required
        error={error}
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
      <Link href="/forgot" className={styles.forgot}>
        Forgot password?
      </Link>
      <LobbyButton type="submit" loading={busy} disabled={!ready}>
        Enter Ekpoma ▶
      </LobbyButton>
    </form>
  )
}

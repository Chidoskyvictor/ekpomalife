'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { setSession, verifyLogin } from '@/lib/game/accounts'
import { LobbyButton } from './lobby-button'
import { LobbyField } from './lobby-field'
import styles from './auth.module.css'

export function LoginForm({ onShake }: { onShake: () => void }) {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const handle = username.replace(/^@/, '')
  const ready = handle.length > 0 && password.length > 0

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
    setSession(result.account.username)
    router.replace('/')
  }

  return (
    <form onSubmit={submit} noValidate className={styles.form}>
      <LobbyField
        id="login-username"
        label="Username"
        icon="🎮"
        value={username}
        onChange={(event) => setUsername(event.target.value.replace(/^@/, ''))}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        required
        placeholder="ese_star"
        hint={
          handle ? (
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

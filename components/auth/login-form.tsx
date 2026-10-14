'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/arc/button/button'
import { Input } from '@/components/arc/input/input'
import { PasswordField } from '@/components/arc/password-field/password-field'
import { setSession, verifyLogin } from '@/lib/game/accounts'
import { ActiveFill, FormError } from './form-parts'
import styles from './auth.module.css'

export function LoginForm() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    const result = await verifyLogin(username, password)
    if (!result.ok) {
      setError(result.error)
      setBusy(false)
      return
    }
    setSession(result.account.username)
    router.replace('/')
  }

  return (
    <form onSubmit={submit} noValidate className={styles.form}>
      <p className={styles.lede}>Welcome back. Your campus is waiting.</p>
      <ActiveFill>
        <Input
          id="login-username"
          label="Username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
        />
      </ActiveFill>
      <ActiveFill>
        <PasswordField
          id="login-password"
          label="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
        />
      </ActiveFill>
      <FormError message={error} />
      <Button type="submit" loading={busy} className={styles.submit}>
        {busy ? 'Logging in…' : 'Log in'}
      </Button>
    </form>
  )
}

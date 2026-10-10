'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { setSession, verifyLogin } from '@/lib/game/accounts'
import { FormError, inputClass, submitClass } from './form-parts'
import { PasswordInput } from './password-input'

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
    <form onSubmit={submit} noValidate>
      <FieldGroup className="gap-4">
        <p className="text-center text-sm text-muted-foreground">Welcome back. Your campus is waiting.</p>
        <Field>
          <FieldLabel htmlFor="login-username">Username</FieldLabel>
          <Input
            id="login-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            className={inputClass}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="login-password">Password</FieldLabel>
          <PasswordInput
            id="login-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            className={inputClass}
          />
        </Field>
        <FormError message={error} />
        <Button type="submit" disabled={busy} className={submitClass}>
          {busy ? 'Logging in…' : 'Log in'}
        </Button>
      </FieldGroup>
    </form>
  )
}

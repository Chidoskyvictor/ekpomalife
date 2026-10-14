'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/arc/button/button'
import { Checkbox } from '@/components/arc/checkbox/checkbox'
import { Input } from '@/components/arc/input/input'
import { PasswordField } from '@/components/arc/password-field/password-field'
import { createAccount, MIN_AGE, MIN_PASSWORD_LENGTH, setSession } from '@/lib/game/accounts'
import { ActiveFill, FormError } from './form-parts'
import styles from './auth.module.css'

export function SignupForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isAdult, setIsAdult] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    const result = await createAccount({ name, username, password, email, dateOfBirth: '', isAdult })
    if (!result.ok) {
      setError(result.error)
      setBusy(false)
      return
    }
    setSession(result.account.username)
    router.replace('/look')
  }

  return (
    <form onSubmit={submit} noValidate className={styles.form}>
      <p className={styles.lede}>Start your AAU life. Free.</p>
      <ActiveFill>
        <Input
          id="name"
          label="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Ese Ehimen"
          autoComplete="name"
          maxLength={40}
          required
        />
      </ActiveFill>
      <ActiveFill>
        <Input
          id="username"
          label="Username"
          value={username}
          onChange={(event) => setUsername(event.target.value.replace(/^@/, ''))}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={20}
          required
          placeholder="ese_star"
          description="Letters, numbers and _ only. This is how people see you."
        />
      </ActiveFill>
      <ActiveFill>
        <Input
          id="email"
          label="Email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@email.com"
          autoComplete="email"
          required
        />
      </ActiveFill>
      <ActiveFill>
        <PasswordField
          id="password"
          label="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          required
          description={`At least ${MIN_PASSWORD_LENGTH} characters. Mix letters — not your name or a simple number.`}
        />
      </ActiveFill>
      <Checkbox
        label={`I am ${MIN_AGE} or older and I agree to the terms.`}
        checked={isAdult}
        onCheckedChange={(checked) => setIsAdult(checked === true)}
        required
      />
      <FormError message={error} />
      <Button type="submit" loading={busy} className={styles.submit}>
        {busy ? 'Creating account…' : 'Continue'}
      </Button>
    </form>
  )
}

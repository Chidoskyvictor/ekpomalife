'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { createAccount, MIN_AGE, MIN_PASSWORD_LENGTH, setSession } from '@/lib/game/accounts'
import { FormError, inputClass, submitClass } from './form-parts'
import { PasswordInput } from './password-input'

export function SignupForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isAdult, setIsAdult] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    const result = await createAccount({ name, username, password, email: '', dateOfBirth: '', isAdult })
    if (!result.ok) {
      setError(result.error)
      setBusy(false)
      return
    }
    setSession(result.account.username)
    router.replace('/look')
  }

  return (
    <form onSubmit={submit} noValidate>
      <FieldGroup className="gap-4">
        <p className="text-center text-sm text-muted-foreground">Start your AAU life. Free.</p>
        <Field>
          <FieldLabel htmlFor="name">Name</FieldLabel>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={40} required className={inputClass} />
        </Field>
        <Field>
          <FieldLabel htmlFor="username">Username</FieldLabel>
          <Input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={20}
            required
            aria-describedby="username-hint"
            className={inputClass}
          />
          <FieldDescription id="username-hint" className="text-xs">
            Letters, numbers and _ only. This is how people see you.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <PasswordInput
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            aria-describedby="password-hint"
            className={inputClass}
          />
          <FieldDescription id="password-hint" className="text-xs">
            At least {MIN_PASSWORD_LENGTH} characters.
          </FieldDescription>
        </Field>
        <Field orientation="horizontal" className="items-start rounded-xl border bg-neutral-50 p-3">
          <Checkbox id="adult" checked={isAdult} onCheckedChange={(checked) => setIsAdult(checked)} className="mt-0.5" />
          <FieldLabel htmlFor="adult" className="font-normal leading-snug">
            I am {MIN_AGE} or older and I agree to the terms.
          </FieldLabel>
        </Field>
        <FormError message={error} />
        <Button type="submit" disabled={busy} className={submitClass}>
          {busy ? 'Creating account…' : 'Continue'}
        </Button>
      </FieldGroup>
    </form>
  )
}

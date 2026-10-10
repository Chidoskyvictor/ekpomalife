'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { startNewLife } from '@/hooks/use-game'
import { createAccount, MIN_AGE, MIN_PASSWORD_LENGTH, setSession } from '@/lib/game/accounts'
import { FormError, inputClass, submitClass } from './form-parts'
import { DateOfBirthPicker } from './date-of-birth-picker'
import { PasswordInput } from './password-input'

export function SignupForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [isAdult, setIsAdult] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    const result = await createAccount({ name, username, password, email, dateOfBirth, isAdult })
    if (!result.ok) {
      setError(result.error)
      setBusy(false)
      return
    }
    setSession(result.account.username)
    startNewLife(result.account.name, result.account.username)
    router.replace('/')
  }

  return (
      <form onSubmit={submit} noValidate>
        <FieldGroup className="gap-4">
          <p className="text-center text-sm text-muted-foreground">Join Ekpoma Life. It&apos;s free.</p>
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
              This is your name in the game. Letters, numbers and _ only.
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
          <Field>
            <FieldLabel htmlFor="email">
              Email <span className="font-normal text-muted-foreground">(optional)</span>
            </FieldLabel>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className={inputClass} />
          </Field>
          <Field>
            <FieldLabel htmlFor="dob">Date of birth</FieldLabel>
            <DateOfBirthPicker id="dob" value={dateOfBirth} onChange={setDateOfBirth} />
          </Field>
          <Field orientation="horizontal" className="items-start rounded-xl border bg-slate-50 p-3">
            <Checkbox id="adult" checked={isAdult} onCheckedChange={(checked) => setIsAdult(checked)} className="mt-0.5" />
            <FieldLabel htmlFor="adult" className="font-normal leading-snug">
              I am {MIN_AGE} or older and agree to the Terms and Conditions.
            </FieldLabel>
          </Field>
          <FormError message={error} />
          <Button type="submit" disabled={busy} className={submitClass}>
            {busy ? 'Creating account…' : 'Sign up'}
          </Button>
        </FieldGroup>
      </form>
  )
}

'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, type FormEvent } from 'react'
import { OtpInput } from '@/components/arc/otp-input/otp-input'
import {
  MIN_PASSWORD_LENGTH,
  requestPasswordReset,
  resetPasswordWithCode,
} from '@/lib/game/accounts'
import { LobbyButton } from './lobby-button'
import { LobbyField } from './lobby-field'
import { PasswordMeter, passwordScore } from './password-meter'
import styles from './auth.module.css'

type Step = 'email' | 'code' | 'password' | 'done'

const RESEND_SECONDS = 45

function maskEmail(email: string) {
  const [user, domain] = email.split('@')
  if (!user || !domain) return email
  const visible = user.slice(0, Math.min(2, user.length))
  return `${visible}${'•'.repeat(Math.max(1, user.length - visible.length))}@${domain}`
}

export function ForgotForm({ onShake }: { onShake: () => void }) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [resendIn, setResendIn] = useState(0)

  useEffect(() => {
    if (resendIn <= 0) return
    const id = window.setTimeout(() => setResendIn((value) => value - 1), 1000)
    return () => window.clearTimeout(id)
  }, [resendIn])

  const score = passwordScore(password, '', '')

  const sendCode = async () => {
    setBusy(true)
    setError(null)
    const result = await requestPasswordReset(email)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      onShake()
      return false
    }
    setResendIn(RESEND_SECONDS)
    return true
  }

  const onEmail = async (event: FormEvent) => {
    event.preventDefault()
    const ok = await sendCode()
    if (ok) setStep('code')
  }

  const onCode = async (event: FormEvent) => {
    event.preventDefault()
    if (code.replace(/\D/g, '').length !== 6) {
      setError('Enter the 6-digit code from your email.')
      onShake()
      return
    }
    setError(null)
    setStep('password')
  }

  const onPassword = async (event: FormEvent) => {
    event.preventDefault()
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
      onShake()
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      onShake()
      return
    }
    setBusy(true)
    setError(null)
    const result = await resetPasswordWithCode({ email, code, password })
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      onShake()
      if (/code|expired|invalid/i.test(result.error)) setStep('code')
      return
    }
    setStep('done')
  }

  const resend = async () => {
    if (resendIn > 0 || busy) return
    const ok = await sendCode()
    if (!ok) return
    setCode('')
  }

  if (step === 'done') {
    return (
      <div className={styles.form}>
        <p className={styles.stepLead}>Password updated</p>
        <p className={styles.stepCopy}>You can log in with your new password now.</p>
        <LobbyButton type="button" onClick={() => router.replace('/login?reset=1')}>
          Back to log in ▶
        </LobbyButton>
      </div>
    )
  }

  if (step === 'password') {
    return (
      <form onSubmit={onPassword} noValidate className={styles.form}>
        <p className={styles.stepLead}>Choose a new password</p>
        <p className={styles.stepCopy}>Pick something strong. At least {MIN_PASSWORD_LENGTH} characters.</p>
        <LobbyField
          id="reset-password"
          label="New password"
          icon="🔒"
          type={showPassword ? 'text' : 'password'}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          required
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
        <LobbyField
          id="reset-confirm"
          label="Confirm password"
          icon="🔒"
          type={showPassword ? 'text' : 'password'}
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          autoComplete="new-password"
          required
          error={error}
        />
        <LobbyButton
          type="submit"
          loading={busy}
          disabled={password.length < MIN_PASSWORD_LENGTH || confirm.length < MIN_PASSWORD_LENGTH}
        >
          Save new password ▶
        </LobbyButton>
        <button type="button" className={styles.textLink} onClick={() => setStep('code')}>
          Use a different code
        </button>
      </form>
    )
  }

  if (step === 'code') {
    return (
      <form onSubmit={onCode} noValidate className={styles.form}>
        <p className={styles.stepLead}>Enter the code</p>
        <p className={styles.stepCopy}>
          We sent a 6-digit code to <strong>{maskEmail(email.trim().toLowerCase())}</strong>.
        </p>
        <OtpInput
          label="Verification code"
          description="Check your inbox and spam folder."
          value={code}
          onChange={(next) => {
            setCode(next)
            setError(null)
          }}
          error={error ?? undefined}
          autoFocus
          disabled={busy}
        />
        <LobbyButton type="submit" loading={busy} disabled={code.replace(/\D/g, '').length !== 6}>
          Continue ▶
        </LobbyButton>
        <p className={styles.resendRow}>
          {resendIn > 0 ? (
            <span className={styles.stepCopy}>Resend in {resendIn}s</span>
          ) : (
            <button type="button" className={styles.textLink} onClick={() => void resend()} disabled={busy}>
              Resend code
            </button>
          )}
          <button
            type="button"
            className={styles.textLink}
            onClick={() => {
              setStep('email')
              setCode('')
              setError(null)
            }}
          >
            Change email
          </button>
        </p>
      </form>
    )
  }

  return (
    <form onSubmit={onEmail} noValidate className={styles.form}>
      <p className={styles.stepLead}>Forgot password?</p>
      <p className={styles.stepCopy}>Enter the email on your account. We will send a recovery code.</p>
      <LobbyField
        id="forgot-email"
        label="Email"
        icon="✉️"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        autoComplete="email"
        inputMode="email"
        required
        placeholder="you@example.com"
        error={error}
      />
      <LobbyButton type="submit" loading={busy} disabled={!email.includes('@')}>
        Send code ▶
      </LobbyButton>
      <Link href="/login" className={styles.textLink}>
        Back to log in
      </Link>
    </form>
  )
}

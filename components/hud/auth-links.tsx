import { Play } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import styles from './auth-links.module.css'

export function AuthLinks({
  className,
  size = 'default',
  signupFirst = false,
  variant = 'flat',
}: {
  className?: string
  size?: 'default' | 'lg'
  signupFirst?: boolean
  variant?: 'flat' | 'lobby'
}) {
  if (variant === 'lobby') {
    return (
      <div className={cn(styles.lobbyRow, size === 'default' && styles.compact, className)}>
        <Link href="/signup" className={cn(styles.play, styles.lobbySignup)}>
          Sign up
          <Play className={styles.playSticker} fill="currentColor" aria-hidden="true" />
        </Link>
        <Link href="/login" className={styles.lobbyLogin}>
          Log in
        </Link>
      </div>
    )
  }

  const sizing = size === 'lg' ? styles.lg : ''
  const login = (
    <Link
      key="login"
      href="/login"
      className={cn(styles.link, sizing, signupFirst ? styles.secondary : styles.ghost)}
    >
      Log in
    </Link>
  )
  const signup = (
    <Link key="signup" href="/signup" className={cn(styles.link, sizing, styles.primary)}>
      Sign up
    </Link>
  )
  return <div className={cn(styles.row, className)}>{signupFirst ? [signup, login] : [login, signup]}</div>
}

import Link from 'next/link'
import { cn } from '@/lib/utils'
import styles from './auth-links.module.css'

export function AuthLinks({ className, size = 'default', signupFirst = false }: { className?: string; size?: 'default' | 'lg'; signupFirst?: boolean }) {
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

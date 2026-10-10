import type { Metadata } from 'next'
import { AuthPage } from '@/components/auth/auth-shell'

export const metadata: Metadata = {
  title: 'Sign up — Ekpoma Life',
}

export default function SignupPage() {
  return <AuthPage initial="signup" />
}

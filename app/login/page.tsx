import type { Metadata } from 'next'
import { AuthPage } from '@/components/auth/auth-shell'

export const metadata: Metadata = {
  title: 'Log in — Ekpoma Life',
}

export default function LoginPage() {
  return <AuthPage initial="login" />
}

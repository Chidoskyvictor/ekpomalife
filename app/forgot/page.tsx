import type { Metadata } from 'next'
import { ForgotShell } from '@/components/auth/forgot-shell'

export const metadata: Metadata = {
  title: 'Forgot password — Ekpoma Life',
}

export default function ForgotPage() {
  return <ForgotShell />
}

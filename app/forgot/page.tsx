import { ForgotShell } from '@/components/auth/forgot-shell'
import { pageMetadata } from '@/lib/seo/metadata'

export const metadata = pageMetadata({
  title: 'Forgot password — Ekpoma Life',
  description: 'Reset your Ekpoma Life password when email recovery is enabled.',
  path: '/forgot',
  index: false,
})

export default function ForgotPage() {
  return <ForgotShell />
}

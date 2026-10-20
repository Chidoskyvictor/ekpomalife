import { AuthPage } from '@/components/auth/auth-shell'
import { pageMetadata } from '@/lib/seo/metadata'

export const metadata = pageMetadata({
  title: 'Log in — Ekpoma Life',
  description: 'Log in to continue your Ekpoma Life campus story — needs, hustles, rent, and dreams on AAU.',
  path: '/login',
})

export default function LoginPage() {
  return <AuthPage initial="login" />
}

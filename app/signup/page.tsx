import { AuthPage } from '@/components/auth/auth-shell'
import { pageMetadata } from '@/lib/seo/metadata'

export const metadata = pageMetadata({
  title: 'Sign up — Ekpoma Life',
  description:
    'Create a free Ekpoma Life account (18+). Build your look, pick traits and a dream, then play campus life in your browser.',
  path: '/signup',
})

export default function SignupPage() {
  return <AuthPage initial="signup" />
}

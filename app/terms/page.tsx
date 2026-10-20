import Link from 'next/link'
import { pageMetadata } from '@/lib/seo/metadata'

export const metadata = pageMetadata({
  title: 'Terms — Ekpoma Life',
  description: 'Terms of use for Ekpoma Life — a browser campus life-simulation game (18+).',
  path: '/terms',
})

export default function TermsPage() {
  return (
    <main className="app-wash mx-auto min-h-dvh w-full max-w-lg overflow-x-hidden px-4 py-10 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <Link href="/signup" className="inline-flex min-h-11 items-center text-sm text-neutral-600">
        Back
      </Link>
      <h1 className="mt-6 text-[clamp(1.35rem,5vw,1.5rem)] font-medium break-words">Terms</h1>
      <p className="mt-4 break-words text-neutral-700">
        Ekpoma Life is a game. You must be 18 or older to create an account. Be kind on campus, do not
        share passwords, and treat other players how you want to be treated at AAU.
      </p>
    </main>
  )
}

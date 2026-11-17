import Link from 'next/link'
import { pageMetadata } from '@/lib/seo/metadata'

export const metadata = pageMetadata({
  title: 'Page not found — Ekpoma Life',
  description: 'That page does not exist. Head back to Ekpoma Life or sign up to play.',
  path: '/404',
  index: false,
})

export default function NotFound() {
  return (
    <main className="app-wash mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-4 py-10">
      <h1 className="text-2xl font-semibold text-[var(--ink)]">Page not found</h1>
      <p className="mt-3 text-[var(--ink-2)]">
        We could not find that URL. Try the homepage or create an account to start your AAU story.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-full bg-[#1a6fb0] px-5 text-sm font-semibold text-white"
        >
          Home
        </Link>
        <Link
          href="/signup"
          className="inline-flex min-h-11 items-center rounded-full border border-[var(--line)] px-5 text-sm font-semibold text-[var(--primary)]"
        >
          Sign up
        </Link>
      </div>
    </main>
  )
}

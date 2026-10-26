import Link from 'next/link'
import { pageMetadata } from '@/lib/seo/metadata'

export const metadata = pageMetadata({
  title: 'Privacy — Ekpoma Life',
  description:
    'How Ekpoma Life handles account data, cookies, and gameplay information. Draft for owner review before launch.',
  path: '/privacy',
})

export default function PrivacyPage() {
  return (
    <main className="app-wash mx-auto min-h-dvh w-full max-w-lg overflow-x-hidden px-4 py-10 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <Link href="/signup" className="inline-flex min-h-11 items-center text-sm text-neutral-600">
        Back
      </Link>
      <h1 className="mt-6 text-[clamp(1.35rem,5vw,1.5rem)] font-medium break-words">Privacy</h1>
      <p className="mt-2 text-sm text-amber-800">
        Draft for review — not legal advice. Have a lawyer approve before marketing this page.
      </p>
      <div className="mt-4 space-y-4 break-words text-neutral-700">
        <p>
          Ekpoma Life stores the account details you provide at signup (such as display name and username) and
          gameplay progress on our servers so you can continue your campus story across sessions.
        </p>
        <p>
          We use a session cookie to keep you logged in. Analytics or error reporting may collect technical
          data (browser type, performance) to keep the game running on mobile networks.
        </p>
        <p>
          We do not sell your personal information. Contact the game team through official support channels
          listed in the app when those are published.
        </p>
        <p>Live voice in Spaces is never recorded.</p>
        <p>
          For terms of use, see <Link href="/terms" className="text-[#1a6fb0] underline">Terms</Link>.
        </p>
      </div>
    </main>
  )
}

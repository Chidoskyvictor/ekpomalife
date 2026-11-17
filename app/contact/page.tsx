import Link from 'next/link'
import { LegalFooter, SUPPORT_EMAIL } from '@/components/seo/legal-footer'
import { pageMetadata } from '@/lib/seo/metadata'

export const metadata = pageMetadata({
  title: 'Contact — Ekpoma Life',
  description: `Contact the Ekpoma Life team: support, payments, account help and advertising. Email ${SUPPORT_EMAIL}.`,
  path: '/contact',
})

export default function ContactPage() {
  return (
    <main className="app-wash mx-auto min-h-dvh w-full max-w-lg overflow-x-hidden px-4 py-10 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <Link href="/" className="inline-flex min-h-11 items-center text-sm text-[var(--ink-2)]">
        Back
      </Link>
      <h1 className="mt-6 text-[clamp(1.35rem,5vw,1.5rem)] font-medium break-words">Contact</h1>
      <div className="mt-4 space-y-4 break-words text-[var(--ink-2)]">
        <p>
          For help with your account, a payment, a bug, or advertising on the in-game billboards, email us:
        </p>
        <p>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-lg font-medium text-[var(--primary)] underline">
            {SUPPORT_EMAIL}
          </a>
        </p>
        <p>
          Please include your Ekpoma Life username. For payment issues, also include the amount, the date and
          the Paystack reference from your receipt.
        </p>
        <p>
          You can also follow{' '}
          <a href="https://x.com/EkpomaLifeApp" target="_blank" rel="noopener noreferrer" className="text-[var(--primary)] underline">
            @EkpomaLifeApp
          </a>{' '}
          on X for updates.
        </p>
      </div>
      <LegalFooter />
    </main>
  )
}

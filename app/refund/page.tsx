import Link from 'next/link'
import { LegalFooter, SUPPORT_EMAIL } from '@/components/seo/legal-footer'
import { pageMetadata } from '@/lib/seo/metadata'

export const metadata = pageMetadata({
  title: 'Refund policy — Ekpoma Life',
  description: 'How refunds work for top-ups in Ekpoma Life, and what to do if a payment failed or you were charged twice.',
  path: '/refund',
})

export default function RefundPage() {
  return (
    <main className="app-wash mx-auto min-h-dvh w-full max-w-lg overflow-x-hidden px-4 py-10 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <Link href="/" className="inline-flex min-h-11 items-center text-sm text-neutral-600">
        Back
      </Link>
      <h1 className="mt-6 text-[clamp(1.35rem,5vw,1.5rem)] font-medium break-words">Refund policy</h1>
      <p className="mt-2 text-sm text-amber-800">
        Draft for review — not legal advice. Have a lawyer approve before marketing this page.
      </p>
      <div className="mt-4 space-y-4 break-words text-neutral-700">
        <p>
          Ekpoma Life is free to play. Top-ups buy in-game money, which is used only inside the game and
          has no cash value outside it.
        </p>
        <p>
          Top-ups are paid through Paystack. Once in-game money has been added to your account, the purchase
          is final and isn&apos;t refunded, including money you have already spent in the game.
        </p>
        <p>
          If you were charged but the money didn&apos;t arrive in your account, or you were charged twice for
          one top-up, email{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-[#1a6fb0] underline">
            {SUPPORT_EMAIL}
          </a>{' '}
          with your username, the amount, the date and the Paystack reference from your receipt. We&apos;ll
          check it and either add the missing money or refund the charge to your original payment method.
        </p>
        <p>
          Accounts suspended for breaking the{' '}
          <Link href="/terms" className="text-[#1a6fb0] underline">
            Terms
          </Link>{' '}
          aren&apos;t refunded.
        </p>
      </div>
      <LegalFooter />
    </main>
  )
}

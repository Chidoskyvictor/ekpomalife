import Link from 'next/link'

export const SUPPORT_EMAIL = 'support@ekpomalife.app'

const LINKS = [
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/refund', label: 'Refunds' },
  { href: '/contact', label: 'Contact' },
] as const

/** Footer links for the legal / info pages (Terms, Privacy, Refunds, Contact). */
export function LegalFooter() {
  return (
    <footer className="mt-10 border-t border-neutral-200 pt-4">
      <nav aria-label="Legal" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="inline-flex min-h-11 items-center text-[#1a6fb0] underline">
            {l.label}
          </Link>
        ))}
      </nav>
    </footer>
  )
}

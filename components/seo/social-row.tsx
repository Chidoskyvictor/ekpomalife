/** Golden verified tick (scalloped seal), like an official account badge. */
function GoldBadge() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
      <path
        fill="#E8A317"
        d="M12 1.5l2.4 1.7 2.9-.3 1.2 2.7 2.6 1.3-.3 2.9L22.5 12l-1.7 2.4.3 2.9-2.7 1.2-1.3 2.6-2.9-.3L12 22.5l-2.4-1.7-2.9.3-1.2-2.7-2.6-1.3.3-2.9L1.5 12l1.7-2.4-.3-2.9 2.7-1.2 1.3-2.6 2.9.3z"
      />
      <path fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" d="M7.5 12.3l3 3 6-6.3" />
    </svg>
  )
}

const ACCOUNTS = [
  {
    name: 'X',
    handle: '@EkpomaLifeApp',
    href: 'https://x.com/EkpomaLifeApp',
    icon: (
      <path
        fill="currentColor"
        d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
      />
    ),
  },
  {
    name: 'TikTok',
    handle: '@ekpomalife.app',
    href: 'https://www.tiktok.com/@ekpomalife.app',
    icon: (
      <path
        fill="currentColor"
        d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5c-1.42 0-2.59-1.16-2.59-2.59 0-1.42 1.16-2.59 2.59-2.59.27 0 .54.04.79.12V9.6a5.7 5.7 0 0 0-.79-.05A5.64 5.64 0 0 0 3.8 15.19a5.64 5.64 0 0 0 5.64 5.64 5.64 5.64 0 0 0 5.64-5.64V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3s-1.88.09-3.78-1.48z"
      />
    ),
  },
  {
    name: 'Instagram',
    handle: '@ekpomalife.app',
    href: 'https://www.instagram.com/ekpomalife.app/',
    icon: (
      <g fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" />
      </g>
    ),
  },
]

/** Our official accounts, each with its handle and a golden verified badge. */
export function SocialRow() {
  return (
    <nav aria-label="Ekpoma Life official accounts" className="mt-3 flex flex-col items-center gap-1.5 font-sans">
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">
        Official <GoldBadge />
      </span>
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {ACCOUNTS.map((a) => (
          <a
            key={a.name}
            href={a.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Ekpoma Life on ${a.name} (official): ${a.handle}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 text-[12px] font-semibold text-neutral-900"
          >
            <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
              {a.icon}
            </svg>
            {a.handle}
            <GoldBadge />
          </a>
        ))}
      </div>
    </nav>
  )
}

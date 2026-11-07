export function SocialRow() {
  const icon = 'inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/80 text-neutral-900'
  return (
    <nav aria-label="Ekpoma Life on social media" className="mt-2 flex items-center justify-center gap-1.5">
      <a
        href="https://x.com/EkpomaLifeApp"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Ekpoma Life on X"
        className={icon}
      >
        <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      </a>
      <a
        href="https://www.tiktok.com/@ekpomalife.app"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Ekpoma Life on TikTok"
        className={icon}
      >
        <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" fill="currentColor">
          <path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5c-1.42 0-2.59-1.16-2.59-2.59 0-1.42 1.16-2.59 2.59-2.59.27 0 .54.04.79.12V9.6a5.7 5.7 0 0 0-.79-.05A5.64 5.64 0 0 0 3.8 15.19a5.64 5.64 0 0 0 5.64 5.64 5.64 5.64 0 0 0 5.64-5.64V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3s-1.88.09-3.78-1.48z" />
        </svg>
      </a>
      <a
        href="https://www.instagram.com/ekpomalife.app/"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Ekpoma Life on Instagram"
        className={icon}
      >
        <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" />
        </svg>
      </a>
    </nav>
  )
}

import type { CSSProperties } from 'react'

/*
 * Anonymous → masks. Every post and comment shows a random-looking alias + mask, worked out from the POST or
 * COMMENT id only (never from the author), so the same person looks different on every post and nothing
 * here can be used to link two posts to one author.
 */

const ADJECTIVES = ['Midnight', 'Quiet', 'Sneaky', 'Velvet', 'Neon', 'Dusty', 'Cosmic', 'Sleepy', 'Wild', 'Shy', 'Golden', 'Lowkey', 'Spicy', 'Moonlit', 'Foggy', 'Slick']
const ANIMALS = ['Owl', 'Fox', 'Cat', 'Panda', 'Lion', 'Frog', 'Wolf', 'Bat', 'Goat', 'Hawk', 'Bee', 'Duck', 'Crab', 'Moth', 'Hare', 'Ram']
/** Hues that sit well on both light and dark shells. */
const HUES = [258, 330, 28, 160, 215, 350, 80, 190]

const hash = (s: string) => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function aliasFor(id: string) {
  const h = hash(id)
  return {
    name: `${ADJECTIVES[h % ADJECTIVES.length]} ${ANIMALS[(h >>> 8) % ANIMALS.length]}`,
    hue: HUES[(h >>> 16) % HUES.length],
    style: (h >>> 20) % 3,
  }
}

/** The domino-mask glyph. Used by the app icon, the header and empty states. */
export function MaskGlyph({ size = 24, className, style }: { size?: number; className?: string; style?: CSSProperties }) {
  return (
    <svg className={className} style={style} width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path
        d="M4 19c0-3 2-5 5-5 7 0 10 2 15 2s8-2 15-2c3 0 5 2 5 5 0 9-5 17-13 17-4 0-6-3-7-3s-3 3-7 3C9 36 4 28 4 19Z"
        fill="currentColor"
      />
      <ellipse cx="15.5" cy="23" rx="5.2" ry="3.6" fill="var(--mask-eye, #fff)" transform="rotate(12 15.5 23)" />
      <ellipse cx="32.5" cy="23" rx="5.2" ry="3.6" fill="var(--mask-eye, #fff)" transform="rotate(-12 32.5 23)" />
    </svg>
  )
}

/** Round avatar: a tinted disc with the alias's mask. */
export function MaskAvatar({ id, size = 36 }: { id: string; size?: number }) {
  const { hue } = aliasFor(id)
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-flex',
        flex: 'none',
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '50%',
        background: `linear-gradient(150deg, oklch(0.74 0.14 ${hue}), oklch(0.5 0.18 ${hue}))`,
        color: '#fff',
        boxShadow: 'inset 0 0 0 2px rgb(255 255 255 / 35%)',
        ['--mask-eye' as string]: `oklch(0.5 0.18 ${hue})`,
      }}
    >
      <MaskGlyph size={Math.round(size * 0.64)} />
    </span>
  )
}

/** Our own app icon: a domino mask on an indigo-to-blue tile with a spark. */
export function AnonymousTileArt({ size = 46 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false" style={{ filter: 'drop-shadow(0 1px 1px rgb(0 0 0 / 18%))' }}>
      <defs>
        <linearGradient id="anon-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6d5cf6" />
          <stop offset="1" stopColor="#1f2a6b" />
        </linearGradient>
        <linearGradient id="anon-mask" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#d8dcff" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#anon-tile)" />
      <path d="M10 28c0-4 2-6 6-6 9 0 13 3 16 3s7-3 16-3c4 0 6 2 6 6 0 12-6 21-16 21-5 0-8-4-6-4s-1 4-6 4c-10 0-16-9-16-21Z" fill="url(#anon-mask)" />
      <ellipse cx="22" cy="33" rx="6.5" ry="4.4" fill="#1f2a6b" transform="rotate(12 22 33)" />
      <ellipse cx="42" cy="33" rx="6.5" ry="4.4" fill="#1f2a6b" transform="rotate(-12 42 33)" />
      <circle cx="23.5" cy="32" r="1.6" fill="#8ea2ff" />
      <circle cx="43.5" cy="32" r="1.6" fill="#8ea2ff" />
      <path d="M50 8l1.6 4.2L56 14l-4.4 1.8L50 20l-1.6-4.2L44 14l4.4-1.8Z" fill="#ffd54a" />
    </svg>
  )
}

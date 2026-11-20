import type { ReactNode } from 'react'

/* The games the hub knows about: how they look on a card and where "Play" goes. */

export type HubGameId = 'snooker' | 'whot' | 'chess' | 'tictactoe' | 'ludo'

export type HubGame = {
  id: HubGameId
  name: string
  emoji: string
  tagline: string
  /** Card art background */
  from: string
  to: string
  /** Can be hosted as an async table (played on the match engine) */
  hostable: boolean
  /** Variants shown as house rules when hosting */
  variants?: { id: string; label: string }[]
  art: () => ReactNode
}

const SnookerArt = () => (
  <svg viewBox="0 0 200 120" aria-hidden="true">
    <rect x="12" y="14" width="176" height="96" rx="16" fill="#132443" />
    <rect x="24" y="26" width="152" height="72" rx="6" fill="url(#poolFelt)" />
    <defs>
      <radialGradient id="poolFelt" cx="0.5" cy="0.45" r="0.75">
        <stop offset="0" stopColor="#4c88f7" />
        <stop offset="1" stopColor="#1a46aa" />
      </radialGradient>
    </defs>
    {[[24, 26], [176, 26], [24, 98], [176, 98], [100, 22], [100, 102]].map(([x, y]) => (
      <circle key={`${x}${y}`} cx={x} cy={y} r="6" fill="#05080f" />
    ))}
    <line x1="62" y1="30" x2="62" y2="94" stroke="#fff" strokeOpacity="0.25" strokeWidth="1.2" strokeDasharray="3 3" />
    {[
      [118, 62, '#f5c400', 0], [127, 56, '#1d4fc4', 1], [127, 68, '#141414', 0], [136, 50, '#e0262f', 1],
      [136, 62, '#6b2fb0', 0], [136, 74, '#f47a1f', 1], [145, 56, '#13924a', 0], [145, 68, '#8c1d24', 1],
    ].map(([x, y, c, stripe]) => (
      <g key={`${x}-${y}`}>
        <circle cx={x as number} cy={y as number} r="5.4" fill={stripe ? '#f6f6f2' : (c as string)} />
        {stripe ? <rect x={(x as number) - 5.4} y={(y as number) - 2.6} width="10.8" height="5.2" fill={c as string} /> : null}
        <circle cx={x as number} cy={y as number} r="2.2" fill="#fff" />
        <circle cx={(x as number) - 1.8} cy={(y as number) - 2} r="1.3" fill="#fff" opacity="0.6" />
      </g>
    ))}
    <circle cx="48" cy="62" r="5.4" fill="#f6f6f2" />
    <line x1="2" y1="80" x2="41" y2="64" stroke="#d9b97c" strokeWidth="3.6" strokeLinecap="round" />
    <line x1="2" y1="80" x2="8" y2="77.5" stroke="#0f1c33" strokeWidth="3.6" strokeLinecap="round" />
  </svg>
)

const WhotArt = () => (
  <svg viewBox="0 0 200 120" aria-hidden="true">
    {[
      { r: -22, x: 58, c: '#e23d4a', s: '●' },
      { r: -6, x: 86, c: '#1d6fe0', s: '▲' },
      { r: 12, x: 114, c: '#16a34a', s: '✚' },
    ].map((k) => (
      <g key={k.s} transform={`translate(${k.x} 64) rotate(${k.r})`}>
        <rect x="-26" y="-42" width="52" height="82" rx="8" fill="#fffdf6" stroke="#d9d2c0" strokeWidth="1.2" />
        <text x="-18" y="-24" fontSize="14" fontWeight="900" fill={k.c} fontFamily="Arial Black, sans-serif">
          {k.s === '●' ? '5' : k.s === '▲' ? '12' : '7'}
        </text>
        <text x="0" y="8" textAnchor="middle" fontSize="30" fill={k.c} fontFamily="Arial, sans-serif">
          {k.s}
        </text>
      </g>
    ))}
    <g transform="translate(150 66) rotate(26)">
      <rect x="-26" y="-42" width="52" height="82" rx="8" fill="#b4232c" stroke="#fff" strokeWidth="2" />
      <text x="0" y="-4" textAnchor="middle" fontSize="12" fontWeight="900" fill="#fff" fontFamily="Arial Black, sans-serif">
        WHOT
      </text>
      <text x="0" y="22" textAnchor="middle" fontSize="20" fontWeight="900" fill="#ffd54a" fontFamily="Arial Black, sans-serif">
        20
      </text>
    </g>
  </svg>
)

const ChessArt = () => (
  <svg viewBox="0 0 200 120" aria-hidden="true">
    {Array.from({ length: 8 }, (_, r) =>
      Array.from({ length: 4 }, (_, c) => (
        <rect key={`${r}${c}`} x={40 + (c * 2 + (r % 2)) * 15} y={4 + r * 14} width="15" height="14" fill="#fff" opacity="0.14" />
      )),
    )}
    <g transform="translate(100 64)">
      <path d="M-22 44 h44 l-4 -10 h-36z" fill="#fff" />
      <path d="M-14 34 c-2 -14 2 -22 8 -32 c-8 2 -14 -4 -16 -12 c4 -14 16 -26 28 -28 c14 0 24 12 22 26 c-2 12 -8 18 -10 26 l8 20 z" fill="#fff" />
      <path d="M-10 -26 l-6 -10 l10 4 z" fill="#fff" />
      <circle cx="2" cy="-18" r="3" fill="#2a2fb8" />
      <path d="M-4 -40 c8 -6 18 -4 22 6" stroke="#2a2fb8" strokeWidth="2" fill="none" />
    </g>
  </svg>
)

const TttArt = () => (
  <svg viewBox="0 0 200 120" aria-hidden="true">
    <g stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity="0.9">
      <line x1="84" y1="18" x2="84" y2="104" />
      <line x1="116" y1="18" x2="116" y2="104" />
      <line x1="56" y1="46" x2="144" y2="46" />
      <line x1="56" y1="76" x2="144" y2="76" />
    </g>
    <g stroke="#ffd54a" strokeWidth="6" strokeLinecap="round">
      <line x1="62" y1="22" x2="78" y2="40" />
      <line x1="78" y1="22" x2="62" y2="40" />
      <line x1="122" y1="52" x2="138" y2="70" />
      <line x1="138" y1="52" x2="122" y2="70" />
      <line x1="92" y1="82" x2="108" y2="100" />
      <line x1="108" y1="82" x2="92" y2="100" />
    </g>
    <circle cx="100" cy="32" r="9" fill="none" stroke="#7ee0ff" strokeWidth="6" />
    <circle cx="70" cy="62" r="9" fill="none" stroke="#7ee0ff" strokeWidth="6" />
    <circle cx="130" cy="92" r="9" fill="none" stroke="#7ee0ff" strokeWidth="6" />
  </svg>
)

const LudoArt = () => (
  <svg viewBox="0 0 200 120" aria-hidden="true">
    <g transform="translate(100 60) rotate(-8)">
      <rect x="-50" y="-50" width="100" height="100" rx="10" fill="#fffdf6" />
      <rect x="-50" y="-50" width="40" height="40" rx="8" fill="#e23d4a" />
      <rect x="10" y="-50" width="40" height="40" rx="8" fill="#16a34a" />
      <rect x="-50" y="10" width="40" height="40" rx="8" fill="#1d6fe0" />
      <rect x="10" y="10" width="40" height="40" rx="8" fill="#f5b50a" />
      {[[-30, -30], [30, -30], [-30, 30], [30, 30]].map(([x, y]) => (
        <circle key={`${x}${y}`} cx={x} cy={y} r="11" fill="#fff" opacity="0.9" />
      ))}
      <path d="M-10 -10 h20 v20 h-20z" fill="#fff" stroke="#d9d2c0" />
      <path d="M-10 -10 l10 10 l10 -10z" fill="#e23d4a" />
      <path d="M10 -10 l-10 10 l10 10z" fill="#16a34a" />
      <path d="M-10 10 l10 -10 l10 10z" fill="#f5b50a" />
      <path d="M-10 -10 l10 10 l-10 10z" fill="#1d6fe0" />
    </g>
    <g transform="translate(168 30) rotate(16)">
      <rect x="-14" y="-14" width="28" height="28" rx="6" fill="#fff" />
      {[[-6, -6], [6, 6], [0, 0], [-6, 6], [6, -6]].map(([x, y]) => (
        <circle key={`${x}${y}`} cx={x} cy={y} r="2.4" fill="#2a2fb8" />
      ))}
    </g>
  </svg>
)

export const HUB_GAMES: HubGame[] = [
  { id: 'snooker', name: '8 Ball Pool', emoji: '🎱', tagline: 'Solids or stripes. Call the 8 to win', from: '#2f6fed', to: '#13306f', hostable: true, variants: [{ id: 'eight', label: '8 ball' }], art: SnookerArt },
  { id: 'whot', name: 'Naija Whot!', emoji: '🃏', tagline: 'Check up, pick two, last card', from: '#d6313b', to: '#7d1230', hostable: false, art: WhotArt },
  { id: 'ludo', name: 'Ludo', emoji: '🎲', tagline: 'Roll a six and race home', from: '#f59e0b', to: '#c2410c', hostable: true, art: LudoArt },
  { id: 'chess', name: 'Chess', emoji: '♟️', tagline: 'Clocks on, no take-backs', from: '#4f46e5', to: '#1e1b6b', hostable: true, art: ChessArt },
  { id: 'tictactoe', name: 'Tic tac toe', emoji: '⭕', tagline: 'Quick rounds, big bragging', from: '#0ea5e9', to: '#1d4ed8', hostable: true, art: TttArt },
]

export const gameById = (id: string) => HUB_GAMES.find((g) => g.id === id) ?? HUB_GAMES[0]!
export const HOSTABLE = HUB_GAMES.filter((g) => g.hostable)

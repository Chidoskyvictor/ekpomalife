'use client'

import type { WallpaperId } from '@/lib/game/phone'
import { WALLPAPERS } from '@/lib/game/phone'

export function WallpaperSkyline({
  wallpaper,
  night,
}: {
  wallpaper: WallpaperId
  night: boolean
}) {
  const bg = WALLPAPERS[wallpaper]?.css ?? WALLPAPERS['aau-dusk'].css
  const windowFill = night ? '#fbbf24' : 'rgba(255,255,255,0.35)'

  return (
    <div style={{ position: 'absolute', inset: 0, background: bg }} aria-hidden="true">
      {(wallpaper === 'aau-dusk' || wallpaper === 'ekpoma-night') && (
        <svg
          viewBox="0 0 390 800"
          preserveAspectRatio="xMidYMax slice"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        >
          {wallpaper === 'ekpoma-night' &&
            [
              [40, 80],
              [90, 120],
              [160, 60],
              [220, 100],
              [300, 70],
              [340, 140],
            ].map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r={1.5} fill="rgba(255,255,255,0.85)" />
            ))}
          {/* Palm */}
          <path d="M48 520 C48 420 70 380 70 380 C60 420 58 470 58 520 Z" fill="#14532d" opacity="0.85" />
          <path d="M70 380 C40 360 20 370 20 370 C45 375 60 390 70 400" fill="#166534" />
          <path d="M70 380 C100 355 120 365 120 365 C95 375 80 395 70 400" fill="#15803d" />
          {/* Gate / admin block silhouette */}
          <rect x="110" y="430" width="170" height="110" rx="4" fill="rgba(15,23,42,0.55)" />
          <rect x="140" y="400" width="110" height="40" rx="3" fill="rgba(15,23,42,0.65)" />
          <rect x="175" y="370" width="40" height="40" fill="rgba(15,23,42,0.7)" />
          {/* Water tank */}
          <ellipse cx="300" cy="410" rx="28" ry="12" fill="rgba(30,41,59,0.75)" />
          <rect x="286" y="410" width="28" height="50" fill="rgba(30,41,59,0.7)" />
          {/* Windows */}
          {[
            [130, 450],
            [160, 450],
            [190, 450],
            [220, 450],
            [250, 450],
            [130, 490],
            [190, 490],
            [250, 490],
          ].map(([x, y], i) => (
            <rect key={i} x={x} y={y} width="14" height="18" rx="1" fill={windowFill} />
          ))}
          {/* Street lamps (night) */}
          {night &&
            [
              [80, 520],
              [320, 520],
            ].map(([x, y], i) => (
              <g key={`lamp-${i}`}>
                <rect x={x} y={y - 40} width="3" height="40" fill="#334155" />
                <circle cx={x + 1.5} cy={y - 42} r="6" fill="#fde68a" opacity="0.9" />
              </g>
            ))}
          <rect x="0" y="540" width="390" height="260" fill="rgba(15,23,42,0.35)" />
        </svg>
      )}
      {wallpaper === 'harmattan' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(ellipse at 50% 20%, rgba(255,255,255,0.35), transparent 60%)',
          }}
        />
      )}
    </div>
  )
}

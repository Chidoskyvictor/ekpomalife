import { ImageResponse } from 'next/og'
import { DEFAULT_DESCRIPTION, SITE_NAME } from '@/lib/seo/site'
import { LOGO_DATA_URL } from '@/lib/seo/logo-data'

export const alt = `${SITE_NAME} — live your AAU story`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '64px 72px',
          background: 'linear-gradient(160deg, #3d9ad6 0%, #1a4f7a 55%, #0c1a24 100%)',
          color: 'white',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO_DATA_URL} width={120} height={120} alt="" style={{ marginBottom: 28 }} />
        <div
          style={{
            fontSize: 72,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            lineHeight: 1.05,
            maxWidth: 900,
          }}
        >
          {SITE_NAME}
        </div>
        <div
          style={{
            marginTop: 24,
            fontSize: 32,
            lineHeight: 1.35,
            maxWidth: 920,
            opacity: 0.92,
          }}
        >
          {DEFAULT_DESCRIPTION}
        </div>
        <div
          style={{
            marginTop: 40,
            fontSize: 26,
            fontWeight: 600,
            opacity: 0.85,
          }}
        >
          ekpomalife.app · Browser life-sim · AAU campus
        </div>
      </div>
    ),
    { ...size },
  )
}

/**
 * The ẹta logo: a single-weight line "E" with round caps and rounded back corners, the middle arm
 * shorter than the top and bottom. Draws in currentColor so it follows the text colour; the same
 * path (scaled) is the app icon in public/apps/eta-logo.svg. Works from 24px up.
 */
export function EtaLogo({ size = 28, className, title }: { size?: number; className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <path d="M18 4.5H8.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2H18M6.5 12h7.5" />
    </svg>
  )
}

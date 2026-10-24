'use client'

import dynamic from 'next/dynamic'

const PhoneShell = dynamic(
  () => import('@/components/hud/phone/phone-shell').then((mod) => mod.PhoneShell),
  { ssr: false },
)

/** Kept export name so HUD / play-nav callers stay stable. */
export function PhoneDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return <PhoneShell open={open} onOpenChange={onOpenChange} />
}

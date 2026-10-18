'use client'

import { PhoneShell } from '@/components/hud/phone/phone-shell'

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

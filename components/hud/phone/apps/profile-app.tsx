'use client'

import { PlayerProfilePanel } from '@/components/profile/player-profile-panel'

export function ProfileApp() {
  return (
    <div style={{ padding: '12px 14px 24px', overflowY: 'auto', flex: 1 }}>
      <PlayerProfilePanel />
    </div>
  )
}

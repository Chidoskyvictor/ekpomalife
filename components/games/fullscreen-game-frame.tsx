'use client'

import { useEffect, useRef } from 'react'
import { BodyPortal } from '@/components/ui/body-portal'
import type { EmbeddedGame } from '@/lib/game/embedded-games'
import phoneStyles from '@/components/hud/phone/apps/games.module.css'

type Props = {
  game: EmbeddedGame
  onExit: () => void
}

/** Same pattern as Snooker PlayView: portal + fixed fullscreen iframe. */
export function FullscreenGameFrame({ game, onExit }: Props) {
  const frame = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return
      const m = event.data as { source?: string; type?: string; game?: string }
      if (!m || m.source !== game.bridgeSource) return
      if (m.type === 'exit' && (!m.game || m.game === game.id)) onExit()
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [game.bridgeSource, game.id, onExit])

  return (
    <BodyPortal>
      <div className={`${phoneStyles.playScreen} ${phoneStyles.fullScreen}`}>
        <iframe ref={frame} className={phoneStyles.frame} src={game.path} title={game.name} />
      </div>
    </BodyPortal>
  )
}
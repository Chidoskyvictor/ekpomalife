'use client'

import { LiveKitRoom, RoomAudioRenderer, useLocalParticipant, useParticipants, useSpeakingParticipants } from '@livekit/components-react'
import { useCallback, useMemo, type ReactNode } from 'react'
import { LiveContext, type LiveInfo } from './spaces-live-context'

/* Loaded only when someone joins a Space, so LiveKit stays out of the main bundle. */

function Bridge({ children }: { children: ReactNode }) {
  const { localParticipant } = useLocalParticipant()
  const participants = useParticipants()
  const speakers = useSpeakingParticipants()

  const setMic = useCallback(
    async (on: boolean) => {
      try {
        await localParticipant.setMicrophoneEnabled(on)
        return null
      } catch (error) {
        const name = error instanceof Error ? error.name : ''
        if (name === 'NotAllowedError') return 'Allow the microphone to talk.'
        if (name === 'NotFoundError') return 'No microphone found.'
        return 'Couldn’t switch your mic.'
      }
    },
    [localParticipant],
  )

  const value = useMemo<LiveInfo>(
    () => ({
      connected: true,
      localId: localParticipant.identity || null,
      speaking: new Set(speakers.map((p) => p.identity)),
      micOn: new Set(participants.filter((p) => p.isMicrophoneEnabled).map((p) => p.identity)),
      setMic,
    }),
    [localParticipant.identity, speakers, participants, setMic],
  )

  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>
}

export default function SpaceLive({
  url,
  token,
  onDisconnected,
  children,
}: {
  url: string
  token: string
  onDisconnected: () => void
  children: ReactNode
}) {
  return (
    <LiveKitRoom
      serverUrl={url}
      token={token}
      connect
      audio={false}
      video={false}
      onDisconnected={onDisconnected}
      style={{ display: 'contents' }}
    >
      <RoomAudioRenderer />
      <Bridge>{children}</Bridge>
    </LiveKitRoom>
  )
}

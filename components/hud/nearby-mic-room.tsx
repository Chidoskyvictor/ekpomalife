'use client'

import { LiveKitRoom, RoomAudioRenderer, useLocalParticipant, useParticipants, useSpeakingParticipants } from '@livekit/components-react'
import { useEffect } from 'react'
import { nearbyVoice, type VoiceFace } from './nearby-voice-store'

/* Loaded only once you join the voice where you are, so LiveKit stays out of the main bundle.
   Joining means you want to talk, so the mic goes on as soon as the room connects. Draws nothing:
   the place sheet's mic button shows the state from the store. */

function Reporter({ onError }: { onError: (text: string) => void }) {
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant()
  const people = useParticipants()
  const speakers = useSpeakingParticipants()
  const others = people.filter((p) => p.identity !== localParticipant.identity).length
  const talker = speakers.find((p) => p.identity !== localParticipant.identity)
  const talking = talker ? talker.name || talker.identity : null

  useEffect(() => {
    const members: VoiceFace[] = people.map((p) => ({ id: p.identity, name: p.name || p.identity }))
    nearbyVoice.report({ micOn: isMicrophoneEnabled, others, talking, members })
  }, [isMicrophoneEnabled, others, talking, people])

  useEffect(() => {
    nearbyVoice.setToggle(async () => {
      try {
        await localParticipant.setMicrophoneEnabled(!localParticipant.isMicrophoneEnabled)
      } catch (error) {
        const name = error instanceof Error ? error.name : ''
        onError(name === 'NotAllowedError' ? 'Allow the microphone to talk.' : name === 'NotFoundError' ? 'No microphone found.' : 'Couldn’t switch your mic.')
      }
    })
    return () => nearbyVoice.setToggle(null)
  }, [localParticipant, onError])

  return null
}

export default function NearbyMicRoom({ url, token, onError, onLeave }: { url: string; token: string; onError: (text: string) => void; onLeave: () => void }) {
  return (
    <LiveKitRoom
      serverUrl={url}
      token={token}
      connect
      audio={false}
      video={false}
      onMediaDeviceFailure={() => onError('Allow the microphone to talk.')}
      onDisconnected={onLeave}
      style={{ display: 'contents' }}
    >
      <RoomAudioRenderer />
      <Reporter onError={onError} />
    </LiveKitRoom>
  )
}

'use client'

import { LiveKitRoom, RoomAudioRenderer, useLocalParticipant, useSpeakingParticipants } from '@livekit/components-react'
import { Mic, MicOff } from 'lucide-react'
import { useState } from 'react'
import styles from './race-voice.module.css'

/* Loaded only while you are in a race, so LiveKit stays out of the main bundle. */

function Controls({ onError }: { onError: (text: string) => void }) {
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant()
  const speakers = useSpeakingParticipants()
  const [busy, setBusy] = useState(false)
  const talking = speakers.filter((p) => p.identity !== localParticipant.identity).map((p) => p.name || p.identity)

  const toggle = async () => {
    setBusy(true)
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)
    } catch (error) {
      const name = error instanceof Error ? error.name : ''
      onError(name === 'NotAllowedError' ? 'Allow the microphone to talk.' : name === 'NotFoundError' ? 'No microphone found.' : 'Couldn’t switch your mic.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={`${styles.mic} ${isMicrophoneEnabled ? styles.on : ''}`}
        aria-pressed={isMicrophoneEnabled}
        aria-label={isMicrophoneEnabled ? 'Mute your mic' : 'Talk to the racers'}
        disabled={busy}
        onClick={() => void toggle()}
      >
        {isMicrophoneEnabled ? <Mic size={18} aria-hidden="true" /> : <MicOff size={18} aria-hidden="true" />}
      </button>
      {talking.length ? (
        <span className={styles.talking} role="status">
          🔊 @{talking[0]}
          {talking.length > 1 ? ` +${talking.length - 1}` : ''}
        </span>
      ) : null}
    </div>
  )
}

export default function RaceVoiceRoom({ url, token, onError, onDisconnected }: { url: string; token: string; onError: (text: string) => void; onDisconnected: () => void }) {
  return (
    <LiveKitRoom serverUrl={url} token={token} connect audio={false} video={false} onDisconnected={onDisconnected} style={{ display: 'contents' }}>
      <RoomAudioRenderer />
      <Controls onError={onError} />
    </LiveKitRoom>
  )
}

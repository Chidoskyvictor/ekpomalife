'use client'

import { LiveKitRoom, RoomAudioRenderer, useLocalParticipant, useSpeakingParticipants } from '@livekit/components-react'
import { Mic, MicOff } from 'lucide-react'
import { useState } from 'react'
import styles from './game-chat.module.css'

/* Loaded only when voice is configured, so LiveKit stays out of the main bundle. The mic starts OFF. */

function Mic_({ onError }: { onError: (text: string) => void }) {
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant()
  const speakers = useSpeakingParticipants()
  const [busy, setBusy] = useState(false)
  const talking = speakers.map((p) => (p.identity === localParticipant.identity ? 'You' : p.name || p.identity))

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
    <>
      <button
        type="button"
        className={`${styles.fab} ${isMicrophoneEnabled ? styles.micOn : ''}`}
        aria-pressed={isMicrophoneEnabled}
        aria-label={isMicrophoneEnabled ? 'Mute your mic' : 'Unmute your mic'}
        disabled={busy}
        onClick={() => void toggle()}
      >
        {isMicrophoneEnabled ? <Mic size={20} aria-hidden="true" /> : <MicOff size={20} aria-hidden="true" />}
      </button>
      {talking.length ? (
        <span className={styles.talking} role="status">
          🔊 {talking[0]}
          {talking.length > 1 ? ` +${talking.length - 1}` : ''}
        </span>
      ) : null}
    </>
  )
}

export default function GameChatVoice({ url, token, onError, onDisconnected }: { url: string; token: string; onError: (text: string) => void; onDisconnected: () => void }) {
  return (
    <LiveKitRoom serverUrl={url} token={token} connect audio={false} video={false} onDisconnected={onDisconnected} style={{ display: 'contents' }}>
      <RoomAudioRenderer />
      <Mic_ onError={onError} />
    </LiveKitRoom>
  )
}

import { createContext, useContext } from 'react'

/** What the room screen reads from LiveKit. Outside a connection everything is empty. */
export type LiveInfo = {
  connected: boolean
  /** My LiveKit identity = my user id */
  localId: string | null
  speaking: ReadonlySet<string>
  micOn: ReadonlySet<string>
  /** Turn my own mic on/off; resolves to an error message when the browser or room refuses */
  setMic: (on: boolean) => Promise<string | null>
}

export const EMPTY_LIVE: LiveInfo = {
  connected: false,
  localId: null,
  speaking: new Set(),
  micOn: new Set(),
  setMic: async () => 'Join the Space first.',
}

export const LiveContext = createContext<LiveInfo>(EMPTY_LIVE)
export const useLive = () => useContext(LiveContext)

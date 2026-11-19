/* Open the phone's Music app on a song from anywhere (the club's Now Playing card). */
export const OPEN_MUSIC_EVENT = 'ekpoma:open-music'

export function requestOpenMusic() {
  window.dispatchEvent(new CustomEvent(OPEN_MUSIC_EVENT))
}

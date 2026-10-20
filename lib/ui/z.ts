/** Shared stacking order — keep in sync with `--z-*` in app/globals.css */
export const zIndex = {
  hud: 30,
  drawer: 60,
  modal: 80,
  phone: 90,
  toast: 1000,
} as const

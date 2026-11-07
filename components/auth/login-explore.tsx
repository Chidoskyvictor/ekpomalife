'use client'

import { useState } from 'react'

type Item = {
  key: string
  label: string
  emoji: string
  title: string
  body: string
  tone: string
}

const ITEMS: Item[] = [
  {
    key: 'sug',
    label: 'SUG election',
    emoji: '🗳️',
    title: 'SUG House',
    body: 'The SUG has no Governor yet. Sign up to vote, or run for office yourself.',
    tone: 'bg-emerald-600 text-white',
  },
  {
    key: 'club',
    label: 'Clubbing',
    emoji: '🎶',
    title: 'Club at Saza',
    body: 'Head to Club at Saza after dark. Sign up to get in and join the party.',
    tone: 'bg-fuchsia-600 text-white',
  },
  {
    key: 'space',
    label: 'Host a space',
    emoji: '🎙️',
    title: 'Students Conference Hall',
    body: 'Host a space in the Students Conference Hall and let a real audience attend. Sign up to start yours.',
    tone: 'bg-sky-600 text-white',
  },
]

export function LoginExplore() {
  const [open, setOpen] = useState<Item | null>(null)

  return (
    <>
      <div
        role="group"
        aria-label="Explore Ekpoma Life"
        className="flex flex-wrap items-center justify-center gap-1.5 font-sans"
      >
        {ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setOpen(item)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold tracking-wide shadow-sm ${item.tone}`}
          >
            <span aria-hidden="true">{item.emoji}</span>
            {item.label}
          </button>
        ))}
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-0"
          onClick={() => setOpen(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={open.title}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-t-3xl bg-white px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] font-sans text-neutral-900 shadow-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold break-words">
                <span aria-hidden="true" className="mr-2">{open.emoji}</span>
                {open.title}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(null)}
                aria-label="Close"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-700"
              >
                ✕
              </button>
            </div>
            <p className="mt-3 text-sm text-neutral-700 break-words">{open.body}</p>
          </div>
        </div>
      ) : null}
    </>
  )
}

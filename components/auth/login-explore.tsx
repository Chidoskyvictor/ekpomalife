'use client'

import Link from 'next/link'
import { useState } from 'react'

type Item = {
  key: string
  label: string
  emoji: string
  title: string
  body: string
  cta: string
}

const ITEMS: Item[] = [
  {
    key: 'sug',
    label: 'SUG election',
    emoji: '🗳️',
    title: 'SUG House',
    body: 'The SUG has no President yet. Sign up to vote, or run for office yourself.',
    cta: 'Sign up to vote',
  },
  {
    key: 'club',
    label: 'Clubbing',
    emoji: '🎶',
    title: 'Clubbing at Sazza',
    body: 'Sazza opens after dark. Sign up to get in and join the party.',
    cta: 'Sign up to party',
  },
  {
    key: 'space',
    label: 'Host a space',
    emoji: '🎙️',
    title: 'Host a space',
    body: 'Go live from the podium at Student Conference and everyone in the hall hears you. Sign up to host yours.',
    cta: 'Sign up to host a space',
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
            className="inline-flex h-7 items-center gap-1 rounded-full bg-white/95 px-2.5 text-[12.5px] font-medium text-neutral-900 shadow-sm ring-1 ring-black/5"
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
            <p className="mt-3 text-[15px] leading-relaxed text-neutral-700 break-words">{open.body}</p>
            <Link
              href="/signup"
              className="mt-4 flex min-h-12 items-center justify-center rounded-full bg-[#2563eb] px-5 text-base font-bold text-white shadow-[0_4px_0_#1e40af]"
            >
              {open.cta}
            </Link>
          </div>
        </div>
      ) : null}
    </>
  )
}

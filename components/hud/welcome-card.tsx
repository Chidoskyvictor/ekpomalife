'use client'

import { GraduationCap, MapPin, Smartphone } from 'lucide-react'

const FEATURES = [
  { icon: GraduationCap, text: 'Study at AAU' },
  { icon: MapPin, text: '15 Ekpoma spots' },
  { icon: Smartphone, text: 'Hustle & events' },
]

export function WelcomeCard({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="pointer-events-auto mx-auto w-full max-w-md rounded-3xl bg-white/95 p-4 shadow-2xl ring-1 ring-black/5 backdrop-blur sm:p-5">
      <p className="text-xs font-semibold tracking-wide text-laterite uppercase">Ekpoma, Edo State</p>
      <h1 className="mt-1 text-pretty text-2xl font-extrabold tracking-tight">Live your AAU story.</h1>
      <p className="mt-1.5 text-pretty text-sm text-muted-foreground">
        Arrive as a fresh student with ₦5,000. Buy a phone, hustle errands, eat at the bukka and build your reputation
        across town.
      </p>
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {FEATURES.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium">
            <Icon className="size-3.5 text-primary" aria-hidden="true" />
            {text}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onCreate}
        className="mt-4 w-full rounded-full bg-primary py-3 text-base font-semibold text-primary-foreground shadow-md transition-colors hover:bg-primary/90 focus-visible:ring-4 focus-visible:ring-primary/30 focus-visible:outline-none"
      >
        Create your character · free
      </button>
      <p className="mt-2 text-center text-xs text-muted-foreground">Tap any pin on the map to explore.</p>
    </section>
  )
}

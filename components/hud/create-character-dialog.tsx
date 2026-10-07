'use client'

import { useState, type FormEvent } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useGame } from '@/hooks/use-game'
import { AVATAR_COLORS, FACULTIES } from '@/lib/game/content'
import type { Faculty } from '@/lib/game/types'
import { cn } from '@/lib/utils'

export function CreateCharacterDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { startCharacter } = useGame()
  const [name, setName] = useState('')
  const [faculty, setFaculty] = useState<Faculty>('Sciences')
  const [color, setColor] = useState(AVATAR_COLORS[0]!)
  const trimmed = name.trim()

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (trimmed.length < 2) return
    startCharacter(trimmed.slice(0, 20), faculty, color)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl p-5 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold">Create your character</DialogTitle>
          <DialogDescription>You arrive at AAU with ₦5,000, full energy and big dreams.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="character-name">Name</Label>
            <Input
              id="character-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Osaze"
              maxLength={20}
              autoComplete="off"
              className="h-11 rounded-xl"
              required
            />
          </div>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-sm font-medium">Faculty</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {FACULTIES.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={faculty === option}
                  onClick={() => setFaculty(option)}
                  className={cn(
                    'rounded-xl border px-2 py-2 text-xs font-semibold transition-colors focus-visible:ring-4 focus-visible:ring-primary/30 focus-visible:outline-none',
                    faculty === option ? 'border-primary bg-accent text-accent-foreground' : 'border-border hover:border-primary/50',
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">Outfit colour</legend>
            <div className="flex gap-2">
              {AVATAR_COLORS.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-label={`Outfit colour ${option}`}
                  aria-pressed={color === option}
                  onClick={() => setColor(option)}
                  className={cn(
                    'size-8 rounded-full ring-offset-2 transition-transform focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30',
                    color === option ? 'scale-110 ring-2 ring-foreground' : 'hover:scale-105',
                  )}
                  style={{ backgroundColor: option }}
                />
              ))}
            </div>
          </fieldset>
          <button
            type="submit"
            disabled={trimmed.length < 2}
            className="w-full rounded-full bg-primary py-3 text-base font-semibold text-primary-foreground shadow-md transition-colors hover:bg-primary/90 disabled:opacity-50 focus-visible:ring-4 focus-visible:ring-primary/30 focus-visible:outline-none"
          >
            Enter Ekpoma
          </button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

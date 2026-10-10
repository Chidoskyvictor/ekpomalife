'use client'

import { useState } from 'react'
import { format, parse } from 'date-fns'
import { CalendarIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

const ISO = 'yyyy-MM-dd'

export function DateOfBirthPicker({
  id,
  value,
  onChange,
}: {
  id: string
  value: string
  onChange: (iso: string) => void
}) {
  const [open, setOpen] = useState(false)
  const today = new Date()
  const selected = value ? parse(value, ISO, today) : undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            variant="outline"
            className={cn(
              'h-11 w-full justify-between rounded-xl bg-white px-3.5 text-base font-normal md:text-sm',
              !selected && 'text-muted-foreground',
            )}
          />
        }
      >
        {selected ? format(selected, 'd MMMM yyyy') : 'Pick your birthday'}
        <CalendarIcon className="text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto rounded-2xl p-1">
        <Calendar
          mode="single"
          captionLayout="dropdown"
          selected={selected}
          defaultMonth={selected ?? new Date(today.getFullYear() - 20, 0)}
          startMonth={new Date(today.getFullYear() - 100, 0)}
          endMonth={today}
          disabled={{ after: today }}
          onSelect={(date) => {
            onChange(date ? format(date, ISO) : '')
            setOpen(false)
          }}
          className="[--cell-size:--spacing(9)]"
        />
      </PopoverContent>
    </Popover>
  )
}

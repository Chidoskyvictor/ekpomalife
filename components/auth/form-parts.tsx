import { AlertCircleIcon } from 'lucide-react'

export const inputClass = 'h-11 rounded-xl bg-white px-3.5 text-base md:text-sm'

export const submitClass = 'h-12 w-full rounded-full text-base font-semibold shadow-sm'

export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="flex items-center gap-2 rounded-xl bg-destructive/10 px-3 py-2.5 text-sm font-medium text-destructive">
      <AlertCircleIcon className="size-4 shrink-0" />
      {message}
    </p>
  )
}

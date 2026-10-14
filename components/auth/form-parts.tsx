import { useState, type ReactNode } from 'react'
import { Alert } from '@/components/arc/alert/alert'

export function ActiveFill({ children }: { children: ReactNode }) {
  const [on, setOn] = useState(false)
  return (
    <div
      data-auth-active={on ? '' : undefined}
      onFocusCapture={() => setOn(true)}
      onBlurCapture={(event) => {
        const next = event.relatedTarget
        if (next instanceof Node && event.currentTarget.contains(next)) return
        setOn(false)
      }}
    >
      {children}
    </div>
  )
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return <Alert tone="danger" title={message} />
}

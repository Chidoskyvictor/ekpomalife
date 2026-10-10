import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function AuthLinks({ className, size = 'default', signupFirst = false }: { className?: string; size?: 'default' | 'lg'; signupFirst?: boolean }) {
  const sizing = size === 'lg' ? 'h-12 px-6 text-base sm:h-14 sm:px-8 sm:text-lg' : 'h-9 px-4 text-sm'
  const login = (
    <Link
      key="login"
      href="/login"
      className={cn(
        buttonVariants({ variant: signupFirst ? 'outline' : 'ghost' }),
        'rounded-full font-semibold',
        sizing,
        signupFirst ? 'border-neutral-200 bg-white hover:bg-neutral-50' : 'px-3 text-foreground/80 hover:text-foreground',
      )}
    >
      Log in
    </Link>
  )
  const signup = (
    <Link key="signup" href="/signup" className={cn(buttonVariants(), 'rounded-full font-semibold shadow-sm', sizing)}>
      Sign up
    </Link>
  )
  return <div className={cn('flex shrink-0 items-center gap-1.5', className)}>{signupFirst ? [signup, login] : [login, signup]}</div>
}

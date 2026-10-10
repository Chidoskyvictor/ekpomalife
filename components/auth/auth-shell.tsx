'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowLeftIcon } from 'lucide-react'
import { Logo } from '@/components/hud/top-bar'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LoginForm } from './login-form'
import { SignupForm } from './signup-form'

export type AuthMode = 'signup' | 'login'

const TITLES: Record<AuthMode, string> = {
  signup: 'Sign up — Ekpoma Life',
  login: 'Log in — Ekpoma Life',
}

export function AuthPage({ initial }: { initial: AuthMode }) {
  const [mode, setMode] = useState<AuthMode>(initial)

  const switchTo = (next: AuthMode) => {
    setMode(next)
    window.history.replaceState(null, '', `/${next}`)
    document.title = TITLES[next]
  }

  return (
    <main className="h-dvh w-full overflow-y-auto bg-white px-4 pt-4 pb-10 sm:pt-8">
      <div className="mx-auto flex w-full max-w-md flex-col gap-5">
        <div className="relative flex h-11 items-center justify-center">
          <Link href="/" className={cn(buttonVariants({ variant: 'outline' }), 'absolute left-0 h-11 rounded-full px-4 text-sm font-semibold')}>
            <ArrowLeftIcon data-icon="inline-start" />
            Back
          </Link>
          <Logo />
        </div>

        <Card className="w-full rounded-3xl shadow-[0_12px_40px_-12px_rgb(15_40_80/0.18)] [--card-spacing:--spacing(5)] sm:[--card-spacing:--spacing(6)]">
          <CardContent>
            <Tabs value={mode} onValueChange={(value) => switchTo(value as AuthMode)} className="gap-5">
              <TabsList className="w-full rounded-full p-1 group-data-horizontal/tabs:h-14">
                {(['signup', 'login'] as const).map((value) => (
                  <TabsTrigger
                    key={value}
                    value={value}
                    className="rounded-full text-base font-semibold data-active:bg-primary data-active:text-primary-foreground data-active:shadow-md"
                  >
                    {value === 'signup' ? 'Sign up' : 'Log in'}
                  </TabsTrigger>
                ))}
              </TabsList>
              <TabsContent value="signup">
                <SignupForm />
              </TabsContent>
              <TabsContent value="login">
                <LoginForm />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
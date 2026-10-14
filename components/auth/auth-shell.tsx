'use client'

import Link from 'next/link'
import { motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'
import { TextReveal } from '@/components/arc/text-reveal/text-reveal'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/arc/tabs/tabs'
import { motionTokens } from '@/components/arc/lib/motion-tokens'
import { Logo } from '@/components/hud/top-bar'
import { LoginForm } from './login-form'
import { SignupForm } from './signup-form'
import styles from './auth.module.css'

export type AuthMode = 'signup' | 'login'

const TITLES: Record<AuthMode, string> = {
  signup: 'Sign up — Ekpoma Life',
  login: 'Log in — Ekpoma Life',
}

export function AuthPage({ initial }: { initial: AuthMode }) {
  const [mode, setMode] = useState<AuthMode>(initial)
  const reduceMotion = useReducedMotion() ?? false

  const switchTo = (next: string) => {
    const value = next as AuthMode
    setMode(value)
    window.history.replaceState(null, '', `/${value}`)
    document.title = TITLES[value]
  }

  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <div className={styles.bar}>
          <Link href="/" className={styles.back}>
            Back
          </Link>
          <div className={styles.brand}>
            <Logo />
          </div>
        </div>

        <motion.section
          className={styles.card}
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduceMotion ? { duration: 0 } : motionTokens.spring.smooth}
        >
          <TextReveal as="h1" text="Ekpoma Life" className={styles.title} />
          <Tabs value={mode} onValueChange={switchTo} className={styles.stack}>
            <div className={styles.switcher}>
              <TabsList aria-label="Account">
                <TabsTrigger value="signup">Sign up</TabsTrigger>
                <TabsTrigger value="login">Log in</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="signup">
              <div className={styles.panel}>
                <SignupForm />
              </div>
            </TabsContent>
            <TabsContent value="login">
              <div className={styles.panel}>
                <LoginForm />
              </div>
            </TabsContent>
          </Tabs>
        </motion.section>
      </div>
    </main>
  )
}

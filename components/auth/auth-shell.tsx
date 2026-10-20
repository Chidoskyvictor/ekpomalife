'use client'

import Link from 'next/link'
import { motion, useAnimation, useReducedMotion } from 'motion/react'
import { Suspense, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/arc/tabs/tabs'
import { AuthGate } from './auth-gate'
import { FloatingStickers } from './floating-stickers'
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
  const shake = useAnimation()

  const bump = () => {
    if (reduceMotion) return
    void shake.start({ x: [0, -8, 8, -5, 5, 0] }).then(() => shake.set({ x: 0 }))
  }

  const switchTo = (next: string) => {
    const value = next as AuthMode
    setMode(value)
    window.history.replaceState(null, '', `/${value}`)
    document.title = TITLES[value]
  }

  return (
    <AuthGate mode="public">
      <main className={styles.page}>
        <Link href="/" className={styles.back}>
          ← Back to the city
        </Link>
        <FloatingStickers />
        <div className={styles.inner}>
          <motion.header
            className={styles.hero}
            initial={reduceMotion ? false : { opacity: 0, y: -24, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={reduceMotion ? { duration: 0 } : { type: 'spring', bounce: 0.55, duration: 0.85 }}
          >
            <img src="/logo.png" alt="Ekpoma Life logo" width={64} height={64} className={styles.heroMark} />
            <h1 className={styles.heroTitle}>Ekpoma Life</h1>
          </motion.header>

          <motion.section
            className={styles.card}
            layout={!reduceMotion}
            initial={reduceMotion ? false : { opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.div animate={shake} transition={{ duration: 0.4 }}>
              <Tabs value={mode} onValueChange={switchTo} className={styles.stack}>
                <div className={styles.switcher}>
                  <TabsList aria-label="Account">
                    <TabsTrigger value="signup">Sign up</TabsTrigger>
                    <TabsTrigger value="login">Log in</TabsTrigger>
                  </TabsList>
                </div>
                <TabsContent value="signup">
                  <div className={styles.panel}>
                    <SignupForm onShake={bump} />
                  </div>
                </TabsContent>
                <TabsContent value="login">
                  <div className={styles.panel}>
                    <Suspense fallback={null}>
                      <LoginForm onShake={bump} />
                    </Suspense>
                  </div>
                </TabsContent>
              </Tabs>
            </motion.div>
          </motion.section>
        </div>
      </main>
    </AuthGate>
  )
}

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
import { playSfx } from '@/lib/audio/sfx'

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
    playSfx('error')
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

          <nav aria-label="Ekpoma Life on social media" className="mt-5 flex items-center justify-center gap-2">
            <span className="inline-flex h-10 items-center rounded-full bg-white/80 px-3 text-xs font-semibold text-[#1a6fb0]">
              ✔ Official
            </span>
            <a
              href="https://x.com/EkpomaLifeApp"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Ekpoma Life on X"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-neutral-900"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
            <a
              href="https://www.tiktok.com/@ekpomalife.app"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Ekpoma Life on TikTok"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-neutral-900"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor">
                <path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5c-1.42 0-2.59-1.16-2.59-2.59 0-1.42 1.16-2.59 2.59-2.59.27 0 .54.04.79.12V9.6a5.7 5.7 0 0 0-.79-.05A5.64 5.64 0 0 0 3.8 15.19a5.64 5.64 0 0 0 5.64 5.64 5.64 5.64 0 0 0 5.64-5.64V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3s-1.88.09-3.78-1.48z" />
              </svg>
            </a>
            <a
              href="https://www.instagram.com/ekpomalife.app/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Ekpoma Life on Instagram"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-neutral-900"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="5" />
                <circle cx="12" cy="12" r="4" />
                <circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" />
              </svg>
            </a>
          </nav>
        </div>
      </main>
    </AuthGate>
  )
}

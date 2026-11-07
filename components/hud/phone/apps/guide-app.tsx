'use client'

import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import type { PhoneAppId } from '@/lib/game/phone'
import styles from './guide.module.css'

/*
 * Guide: the campus handbook. A grid of topics; each opens a sheet of short steps, some with a
 * "Show me" that jumps to the app or place. Topics you've read get a tick (kept on this device).
 */

type Show = { app: PhoneAppId } | { place: string }
type Step = { title: string; text: string; show?: Show; showLabel?: string }
type Topic = { id: string; emoji: string; title: string; blurb: string; tint: string; steps: Step[] }

const TOPICS: Topic[] = [
  {
    id: 'start',
    emoji: '👋',
    title: 'Getting started',
    blurb: 'Your first day in Ekpoma',
    tint: '#dcfce7',
    steps: [
      { title: 'You are a student at AAU', text: 'Live campus life: go to class, work, eat, make friends and grow your money.' },
      { title: 'Tap a place to go there', text: 'Tap any building on the map. Walk if it is close, or take a ride.', show: { app: 'map' }, showLabel: 'Open Map' },
      { title: 'Watch your bars', text: 'Energy, hunger and mood drop as time passes. Eat, rest and have fun to keep them up.' },
      { title: 'Your phone does a lot', text: 'Messages, Bank, Jobs, Rides and more live here. Battery drains, so charge at home.' },
    ],
  },
  {
    id: 'money',
    emoji: '💼',
    title: 'Money & Jobs',
    blurb: 'Earn your first naira',
    tint: '#dbeafe',
    steps: [
      { title: 'Find a shift', text: 'The Jobs app lists open shifts. Some need a skill level first.', show: { app: 'jobs' }, showLabel: 'Open Jobs' },
      { title: 'Keep it in the bank', text: 'Cash in hand can run out fast. The Bank app shows your balance and history.', show: { app: 'bank' }, showLabel: 'Open Bank' },
      { title: 'Grow it', text: 'Invest when you have extra. Prices move, so never put in money you need for rent.', show: { app: 'invest' }, showLabel: 'Open Invest' },
    ],
  },
  {
    id: 'school',
    emoji: '📚',
    title: 'School & Exams',
    blurb: 'Lectures, tutorials, exams',
    tint: '#ede9fe',
    steps: [
      { title: 'Check your timetable', text: 'Your Calendar shows when classes and exams are.', show: { app: 'calendar' }, showLabel: 'Open Calendar' },
      { title: 'Sit in class', text: 'Go to the hall on time and tap a chair to attend. It raises your Academics skill.' },
      { title: 'Pass your exams', text: 'Attending and studying make exams easier. Good grades open better jobs.' },
    ],
  },
  {
    id: 'home',
    emoji: '🏠',
    title: 'Rent & Home',
    blurb: 'Keep a roof over your head',
    tint: '#ffedd5',
    steps: [
      { title: 'Rent day', text: 'When rent is due, the Caretaker comes. Keep enough cash so you are not kicked out.' },
      { title: 'Find a better room', text: 'The Houses app lists rooms and hostels around campus.', show: { app: 'houses' }, showLabel: 'Open Houses' },
      { title: 'Rest and charge', text: 'Sleep at home to get energy back. Your phone charges there too.' },
    ],
  },
  {
    id: 'food',
    emoji: '🍛',
    title: 'Food & Energy',
    blurb: 'Order and eat',
    tint: '#fef9c3',
    steps: [
      { title: 'Order at the counter', text: 'Spot Rite, Wise Gourmet and the bukkas sell plates. Pick what you can afford.', show: { place: 'spot-rite' }, showLabel: 'Go to Spot Rite' },
      { title: 'Eat', text: 'You eat right away: a short bar fills, and the food counts when it finishes.' },
    ],
  },
  {
    id: 'rides',
    emoji: '🛺',
    title: 'Rides',
    blurb: 'Shuttle and okada',
    tint: '#fef3c7',
    steps: [
      { title: 'Book a ride', text: 'Open Ride, pick where you are going and choose shuttle or okada.', show: { app: 'ride' }, showLabel: 'Open Ride' },
      { title: 'Fares follow real roads', text: 'Prices and trip times use real Ekpoma road distances. Okada is faster but costs more.' },
    ],
  },
  {
    id: 'friends',
    emoji: '💬',
    title: 'Friends & Chat',
    blurb: 'Meet people',
    tint: '#fce7f3',
    steps: [
      { title: 'Say hello', text: 'Tap a player near you to send a quick Hello, a Gist, a Joke or a Compliment.' },
      { title: 'Chat', text: 'Messages holds your direct chats and notices.', show: { app: 'messages' }, showLabel: 'Open Messages' },
      { title: 'Keep it kind', text: 'Respect other students. Report anyone who harasses you.' },
    ],
  },
  {
    id: 'spaces',
    emoji: '🎙️',
    title: 'Spaces & Hall',
    blurb: 'Talk live to everyone',
    tint: '#f3e8ff',
    steps: [
      { title: 'Join a Space', text: 'Spaces are live voice rooms. Listen in, raise your hand to speak.', show: { app: 'spaces' }, showLabel: 'Open Spaces' },
      { title: 'Host from the hall', text: 'In Student Conference, stand at the podium and tap the mic. Everyone in the hall hears you.' },
    ],
  },
  {
    id: 'skills',
    emoji: '⭐',
    title: 'Skills',
    blurb: 'Level up as you play',
    tint: '#e0f2fe',
    steps: [
      { title: 'Everyone starts at 0', text: 'Academics, Charisma, Hustle, Fitness, Cooking, Tech and Dance grow as you do things.' },
      { title: 'Skills open doors', text: 'Some jobs and features need a level first. See yours on your Profile.', show: { app: 'profile' }, showLabel: 'Open Profile' },
    ],
  },
  {
    id: 'pitch',
    emoji: '🚀',
    title: 'Pitch Room',
    blurb: 'Pitch your idea at the Hub',
    tint: '#d1fae5',
    steps: [
      { title: 'Go to the Innovation Hub', text: 'Pitch your startup to the judges in the Pitch Room.', show: { place: 'innovation-hub' }, showLabel: 'Go to the Hub' },
      { title: 'Wait for the review', text: 'The judges take about 20 seconds. You can pitch a few times a day.' },
    ],
  },
  {
    id: 'games',
    emoji: '🎮',
    title: 'Games',
    blurb: 'Whot, Snooker and more',
    tint: '#cffafe',
    steps: [
      { title: 'Play with friends', text: 'The Games app has Whot, Snooker and more.', show: { app: 'games' }, showLabel: 'Open Games' },
    ],
  },
  {
    id: 'safety',
    emoji: '🛡️',
    title: 'Safety & Rules',
    blurb: 'Play fair, stay safe',
    tint: '#fee2e2',
    steps: [
      { title: 'Never share passwords', text: 'Ekpoma Life staff will never ask for your password or bank PIN.' },
      { title: 'Be respectful', text: 'No bullying, hate or scams. Accounts that break the rules get banned.' },
      { title: 'Settings', text: 'Change your wallpaper, buy data and see credits in Settings.', show: { app: 'settings' }, showLabel: 'Open Settings' },
    ],
  },
]

const KEY = 'ekpoma-guide-read'

function loadRead(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

export function GuideApp({
  onOpenApp,
  onGo,
}: {
  onOpenApp: (id: PhoneAppId) => void
  onGo: (placeId: string) => void
}) {
  const [read, setRead] = useState<string[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  useEffect(() => setRead(loadRead()), [])

  const open = (id: string) => {
    setOpenId(id)
    if (read.includes(id)) return
    const next = [...read, id]
    setRead(next)
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      /* storage blocked */
    }
  }

  const topic = TOPICS.find((t) => t.id === openId) ?? null
  const done = read.filter((id) => TOPICS.some((t) => t.id === id)).length
  const pct = done / TOPICS.length
  const R = 22
  const C = 2 * Math.PI * R

  const show = (s: Show) => {
    setOpenId(null)
    if ('app' in s) onOpenApp(s.app)
    else onGo(s.place)
  }

  return (
    <div className={styles.wrap}>
      <section className={styles.hero}>
        <div className={styles.heroText}>
          <span className={styles.kicker}>Campus handbook</span>
          <h3>Welcome to Ekpoma Life</h3>
          <p>Everything you need to survive and thrive at AAU.</p>
        </div>
        <div className={styles.ring} aria-label={`${done} of ${TOPICS.length} topics read`}>
          <svg viewBox="0 0 56 56" width="56" height="56" aria-hidden="true">
            <circle cx="28" cy="28" r={R} className={styles.ringBg} />
            <circle
              cx="28"
              cy="28"
              r={R}
              className={styles.ringFg}
              strokeDasharray={C}
              strokeDashoffset={C * (1 - pct)}
            />
          </svg>
          <span>
            {done}/{TOPICS.length}
          </span>
        </div>
      </section>

      <div className={styles.grid}>
        {TOPICS.map((t) => (
          <button key={t.id} type="button" className={styles.card} onClick={() => open(t.id)}>
            <span className={styles.icon} style={{ background: t.tint }} aria-hidden="true">
              {t.emoji}
            </span>
            <strong>{t.title}</strong>
            <small>{t.blurb}</small>
            {read.includes(t.id) ? (
              <span className={styles.tick} aria-label="Read">
                ✓
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <AnimatePresence>
        {topic ? (
          <>
            <motion.div
              key="scrim"
              className={styles.scrim}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpenId(null)}
            />
            <motion.section
              key="sheet"
              className={styles.sheet}
              role="dialog"
              aria-label={topic.title}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'tween', duration: 0.22, ease: 'easeOut' }}
            >
              <div className={styles.grab} aria-hidden="true" />
              <header className={styles.sheetHead}>
                <span className={styles.icon} style={{ background: topic.tint }} aria-hidden="true">
                  {topic.emoji}
                </span>
                <h3>{topic.title}</h3>
                <button type="button" className={styles.close} aria-label="Close" onClick={() => setOpenId(null)}>
                  ✕
                </button>
              </header>
              <ol className={styles.steps}>
                {topic.steps.map((s, i) => (
                  <li key={s.title}>
                    <span className={styles.num}>{i + 1}</span>
                    <div>
                      <strong>{s.title}</strong>
                      <p>{s.text}</p>
                      {s.show ? (
                        <button type="button" className={styles.showMe} onClick={() => show(s.show!)}>
                          {s.showLabel ?? 'Show me'} →
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            </motion.section>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

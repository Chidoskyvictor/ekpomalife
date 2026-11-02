'use client'

import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import styles from './prodigy.module.css'

/*
 * Prodigy Enterprises Omnium Ltd: a partner app (one of our co-founders' companies). The same
 * content as their website, shaped like a phone app. Tapping a service opens WhatsApp with a
 * message already written for it (the services themselves run on WhatsApp, not in the game).
 */

const SITE = 'https://a2d5cc6ec1f8f7067e.v2.appdeploy.ai/'
const WHATSAPP = '2348136652445'

const SERVICES = [
  {
    id: 'education',
    emoji: '🎓',
    title: 'Digital Education',
    text: 'Training, certifications and learning resources.',
    message:
      "Hello Prodigy Enterprises 👋 I found you on Ekpoma Life. I'm interested in your digital education programmes. Please can you tell me the courses and certifications you offer, and how much they cost?",
  },
  {
    id: 'marketplace',
    emoji: '🛍️',
    title: 'Marketplace',
    text: 'Buy and sell products online.',
    message:
      "Hello Prodigy Enterprises 👋 I found you on Ekpoma Life. I'd like to buy or sell on your marketplace. How do I get started?",
  },
  {
    id: 'payments',
    emoji: '💳',
    title: 'Payment Gateway',
    text: 'Secure digital payments and transactions.',
    message:
      "Hello Prodigy Enterprises 👋 I found you on Ekpoma Life. I want to accept payments for my business. Please tell me more about your payment gateway.",
  },
  {
    id: 'airtime',
    emoji: '📶',
    title: 'Airtime & Data',
    text: 'Purchase airtime and data bundles.',
    message:
      "Hello Prodigy Enterprises 👋 I found you on Ekpoma Life. I want to buy airtime / data. Network: ____ Amount: ____ Number: ____",
  },
  {
    id: 'business',
    emoji: '💼',
    title: 'Business Services',
    text: 'Consulting, registration and support services.',
    message:
      "Hello Prodigy Enterprises 👋 I found you on Ekpoma Life. I need help with my business (registration / consulting). Can we talk?",
  },
  {
    id: 'contact',
    emoji: '🤝',
    title: 'Contact',
    text: 'Connect with our team for enquiries and partnerships.',
    message:
      "Hello Prodigy Enterprises 👋 I found you on Ekpoma Life. I'd like to make an enquiry / discuss a partnership with your team.",
  },
] as const

const waLink = (message: string) => `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(message)}`

export function ProdigyApp({ onHome }: { onHome: () => void }) {
  return (
    <div className={styles.app}>
      <header className={styles.top}>
        <button type="button" className={styles.back} aria-label="Back home" onClick={onHome}>
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <span className={styles.topTitle}>Prodigy</span>
      </header>

      <div className={styles.scroll}>
        <section className={styles.hero}>
          {/* eslint-disable-next-line @next/next/no-img-element -- small static logo */}
          <img className={styles.logo} src="/apps/prodigy-logo.png" alt="Prodigy Enterprises Omnium Ltd logo" width={96} height={96} />
          <h1 className={styles.name}>Prodigy Enterprises Omnium Ltd</h1>
          <p className={styles.tagline}>Digital Education · E-Commerce · Payments · Airtime &amp; Data · Professional Services</p>
        </section>

        <h2 className={styles.heading}>What we do</h2>
        <ul className={styles.list}>
          {SERVICES.map((s) => (
            <li key={s.id}>
              <a className={styles.card} href={waLink(s.message)} target="_blank" rel="noopener noreferrer">
                <span className={styles.icon} aria-hidden="true">
                  {s.emoji}
                </span>
                <span className={styles.cardText}>
                  <strong>{s.title}</strong>
                  <span>{s.text}</span>
                </span>
                <ChevronRight className={styles.chev} size={18} aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>

        <a className={styles.site} href={SITE} target="_blank" rel="noopener noreferrer">
          Visit our website
          <ExternalLink size={14} aria-hidden="true" />
        </a>
      </div>
    </div>
  )
}

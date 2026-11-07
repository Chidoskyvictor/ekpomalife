'use client'

import { Check, ChevronDown, Copy, Mail, Send } from 'lucide-react'
import { useState } from 'react'
import { SUPPORT_EMAIL } from '@/components/seo/legal-footer'
import styles from './support.module.css'

/*
 * Support: a small help desk inside the phone. Pick a topic, read the quick answers, or write a
 * message. "Send" opens the player's own mail app with the message filled in, so nothing is
 * stored on our side and the player stays in control of what is sent.
 */

const TOPICS = [
  { id: 'account', label: 'Account', emoji: '👤' },
  { id: 'payments', label: 'Payments & data', emoji: '💳' },
  { id: 'bug', label: 'Something broke', emoji: '🐞' },
  { id: 'report', label: 'Report someone', emoji: '🚩' },
  { id: 'other', label: 'Something else', emoji: '💬' },
] as const

type TopicId = (typeof TOPICS)[number]['id']

const FAQ: { q: string; a: string; href?: { label: string; url: string } }[] = [
  {
    q: 'My data bundle is not loading',
    a: 'Open Settings and check the Data line. If it reads 0MB, buy a bundle there. Pages will not load without data.',
  },
  {
    q: 'My phone battery is empty',
    a: 'Charge it at home. Phones drain while you are out, so plan a charge before you leave.',
  },
  {
    q: 'I paid but nothing changed',
    a: 'Send us the time you paid and what you bought. Keep your receipt or transfer reference handy.',
  },
  {
    q: 'How do I get the refund policy?',
    a: 'The refund and privacy terms are published on our website.',
    href: { label: 'Read refund policy', url: '/refund' },
  },
]

const MAX_LEN = 1000
const MIN_LEN = 10

export function SupportApp() {
  const [topic, setTopic] = useState<TopicId>('account')
  const [message, setMessage] = useState('')
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const topicLabel = TOPICS.find((t) => t.id === topic)?.label ?? 'Support'
  const trimmed = message.trim()
  const tooShort = trimmed.length > 0 && trimmed.length < MIN_LEN

  const send = () => {
    if (trimmed.length < MIN_LEN) {
      setError(`Tell us a bit more (at least ${MIN_LEN} characters).`)
      return
    }
    setError(null)
    const subject = `[Support] ${topicLabel}`
    const body = `${trimmed}\n\n—\nSent from the Ekpoma Life phone app.`
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard blocked: the address is still shown and tappable */
    }
  }

  return (
    <div className={styles.wrap}>
      <section className={styles.hero}>
        <span className={styles.heroIcon} aria-hidden="true">
          🛟
        </span>
        <div className={styles.heroText}>
          <p className={styles.kicker}>Help desk</p>
          <h3>How can we help?</h3>
          <p>Pick a topic, check the quick answers, or write to us.</p>
        </div>
      </section>

      <section aria-labelledby="support-topics">
        <h3 id="support-topics" className={styles.sectionTitle}>
          What is it about?
        </h3>
        <div className={styles.topics} role="radiogroup" aria-label="Topic">
          {TOPICS.map((t) => {
            const active = t.id === topic
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={active}
                className={`${styles.topic} ${active ? styles.topicActive : ''}`}
                onClick={() => setTopic(t.id)}
              >
                <span aria-hidden="true">{t.emoji}</span>
                <span>{t.label}</span>
              </button>
            )
          })}
        </div>
      </section>

      <section aria-labelledby="support-faq">
        <h3 id="support-faq" className={styles.sectionTitle}>
          Quick answers
        </h3>
        <ul className={styles.faq}>
          {FAQ.map((item, i) => {
            const open = openFaq === i
            return (
              <li key={item.q} className={styles.faqItem}>
                <button
                  type="button"
                  className={styles.faqQ}
                  aria-expanded={open}
                  aria-controls={`faq-${i}`}
                  onClick={() => setOpenFaq(open ? null : i)}
                >
                  <span>{item.q}</span>
                  <ChevronDown
                    size={18}
                    aria-hidden="true"
                    className={`${styles.chev} ${open ? styles.chevOpen : ''}`}
                  />
                </button>
                {open ? (
                  <div id={`faq-${i}`} className={styles.faqA}>
                    <p>{item.a}</p>
                    {item.href ? (
                      <a className={styles.link} href={item.href.url} target="_blank" rel="noopener noreferrer">
                        {item.href.label} →
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      </section>

      <section aria-labelledby="support-write" className={styles.card}>
        <h3 id="support-write" className={styles.cardTitle}>
          Write to us · {topicLabel}
        </h3>
        <label className={styles.srOnly} htmlFor="support-message">
          Your message
        </label>
        <textarea
          id="support-message"
          className={`${styles.textarea} ${error || tooShort ? styles.textareaError : ''}`}
          value={message}
          maxLength={MAX_LEN}
          rows={4}
          placeholder="Tell us what happened and what you expected."
          aria-invalid={Boolean(error)}
          aria-describedby="support-count support-error"
          onChange={(e) => {
            setMessage(e.target.value)
            if (error) setError(null)
          }}
        />
        <div className={styles.meta}>
          <span id="support-error" className={styles.error} role="alert">
            {error ?? ''}
          </span>
          <span id="support-count" className={styles.count}>
            {message.length}/{MAX_LEN}
          </span>
        </div>
        <button type="button" className={styles.sendBtn} onClick={send}>
          <Send size={16} aria-hidden="true" />
          Send in mail app
        </button>
        <p className={styles.hint}>Opens your mail app with this message ready. Nothing is sent until you tap send there.</p>
      </section>

      <section aria-labelledby="support-direct" className={styles.card}>
        <h3 id="support-direct" className={styles.cardTitle}>
          Email us directly
        </h3>
        <div className={styles.emailRow}>
          <span className={styles.emailIcon} aria-hidden="true">
            <Mail size={18} />
          </span>
          <a className={styles.email} href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          <button
            type="button"
            className={styles.copyBtn}
            onClick={() => void copyEmail()}
            aria-label={copied ? 'Email copied' : 'Copy email address'}
          >
            {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </section>
    </div>
  )
}

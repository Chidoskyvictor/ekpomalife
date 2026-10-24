import Link from 'next/link'
import { faqJsonLd, JsonLd, siteJsonLd } from '@/components/seo/json-ld'
import crawlStyles from './home-landing-crawl.module.css'
import styles from './home-landing.module.css'

const FAQ = [
  {
    question: 'What is Ekpoma Life?',
    answer:
      'Ekpoma Life is a mobile-first browser game where you live a chaotic campus life in Ekpoma, Edo State — around Ambrose Alli University (AAU). You create a character, spin starting money, explore a 3D campus map, manage needs, hustle for naira, and work toward a dream you pick at signup.',
  },
  {
    question: 'Do I need to install an app?',
    answer:
      'No download. Ekpoma Life runs in your web browser on phone or desktop. Sign up, finish character setup (look, traits, dream, where you live), then play from the home screen.',
  },
  {
    question: 'Is Ekpoma Life free to play?',
    answer:
      'Yes. Create a free account to play. The game is aimed at adults 18 and older (age checkbox at signup).',
  },
  {
    question: 'What can I do in the game?',
    answer:
      'Track six needs (hunger, energy, fun, social, hygiene, study), take jobs and hustles, shop, pay rent, use in-game phone apps (bank, market, rides, campus news, and more), decorate your room, and pursue dreams like graduating with a first class or becoming an Ekpoma landlord.',
  },
  {
    question: 'Who is it for?',
    answer:
      'Anyone who wants a funny, broke-but-hopeful AAU campus story. The world is rooted in Ekpoma and AAU culture — from roadside food stalls to power cuts — without needing to be on campus to sign up.',
  },
] as const

export function HomeLanding({ crawlOnly = false }: { crawlOnly?: boolean }) {
  return (
    <article
      className={crawlOnly ? crawlStyles.crawlOnly : styles.landing}
      id="about-ekpoma-life"
    >
      <JsonLd data={[...siteJsonLd(), faqJsonLd([...FAQ])]} />

      <header className={styles.hero}>
        <img
          src="/logo.png"
          alt="Ekpoma Life logo"
          className={styles.logo}
          width={88}
          height={88}
        />
        <h1 className={styles.title}>Ekpoma Life</h1>
        <p className={styles.lead}>
          Live your AAU story in the browser — study, hustle, eat at the bukka, pay Baba Landlord, and
          chase the dream you picked on signup.
        </p>
        <div className={styles.ctaRow}>
          <Link href="/signup" className={styles.ctaPrimary}>
            Create free account
          </Link>
          <Link href="/login" className={styles.ctaSecondary}>
            Log in
          </Link>
        </div>
      </header>

      <section className={styles.section} aria-labelledby="how-to-play">
        <h2 id="how-to-play">How to play</h2>
        <ol className={styles.steps}>
          <li>
            <Link href="/signup">Sign up</Link> (18+) and choose your look, two personality traits, and a
            campus dream.
          </li>
          <li>Pick where you live, spin your starting naira, and drop onto the isometric AAU campus map.</li>
          <li>
            Each in-game day has four time periods. Balance needs, take jobs, visit shops, and use your phone
            apps before rent and campus chaos catch up.
          </li>
        </ol>
      </section>

      <section className={styles.section} aria-labelledby="features">
        <h2 id="features">What you will find on campus</h2>
        <ul className={styles.featureList}>
          <li>
            <strong>Needs and mood</strong> — hunger, energy, fun, social, hygiene, and study drive what you
            should do next.
          </li>
          <li>
            <strong>Hustle and economy</strong> — jobs, shop, rent ladder, and abstract side hustles; money
            is server-authoritative.
          </li>
          <li>
            <strong>Dreams</strong> — from first-class graduate to Edo afrobeats star, campus celebrity, or
            Ekpoma tech founder.
          </li>
          <li>
            <strong>Your room</strong> — hostel space you can furnish (comfort is display-only today).
          </li>
          <li>
            <strong>Phone</strong> — bank, market, map, rides, campus news, calendar, and more in a campus-style
            home screen.
          </li>
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="faq">
        <h2 id="faq">Frequently asked questions</h2>
        <dl className={styles.faq}>
          {FAQ.map((item) => (
            <div key={item.question} className={styles.faqItem}>
              <dt>{item.question}</dt>
              <dd>{item.answer}</dd>
            </div>
          ))}
        </dl>
      </section>

      <footer className={styles.footer}>
        <nav aria-label="Legal and account">
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/signup">Sign up</Link>
          <Link href="/login">Log in</Link>
        </nav>
        <p className={styles.footnote}>
          Ekpoma Life is a fictional game set in Ekpoma, Edo State, Nigeria. Ambrose Alli University (AAU)
          is used as campus flavour, not as an official affiliation.
        </p>
      </footer>
    </article>
  )
}

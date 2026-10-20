import { SITE_NAME, SITE_URL } from '@/lib/seo/site'

type JsonLdProps = {
  data: Record<string, unknown> | Record<string, unknown>[]
}

export function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}

export function siteJsonLd() {
  const organization = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/logo.png`,
  }

  const website = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
    description:
      'Browser life-simulation game set in Ekpoma around Ambrose Alli University (AAU).',
    publisher: { '@type': 'Organization', name: SITE_NAME },
  }

  const videoGame = {
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    name: SITE_NAME,
    url: SITE_URL,
    description:
      'Mobile-first browser life-sim: manage needs, hustle, shop, rent, phone apps, and chase dreams on an isometric AAU campus.',
    gamePlatform: 'Web browser',
    genre: 'Life simulation',
    inLanguage: 'en',
    applicationCategory: 'Game',
    operatingSystem: 'Any (modern browser)',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'NGN',
      availability: 'https://schema.org/InStock',
    },
    isAccessibleForFree: true,
    contentRating: '18+',
    locationCreated: {
      '@type': 'Place',
      name: 'Ekpoma, Edo State, Nigeria',
    },
  }

  const webApp = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: SITE_NAME,
    url: SITE_URL,
    browserRequirements: 'Requires JavaScript. Modern mobile or desktop browser.',
    applicationCategory: 'GameApplication',
  }

  return [organization, website, videoGame, webApp]
}

export function faqJsonLd(items: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  }
}

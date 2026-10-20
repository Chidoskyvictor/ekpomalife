import type { Metadata } from 'next'
import { GameLoader } from '@/components/game-loader'
import { HomeLanding } from '@/components/seo/home-landing'
import { pageMetadata } from '@/lib/seo/metadata'
import { DEFAULT_DESCRIPTION, DEFAULT_TITLE } from '@/lib/seo/site'

export const metadata: Metadata = {
  ...pageMetadata({
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    path: '/',
  }),
}

export default function Page() {
  return (
    <>
      <GameLoader />
      <HomeLanding crawlOnly />
    </>
  )
}

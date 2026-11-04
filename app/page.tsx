import type { Metadata } from 'next'
import { GameLoader } from '@/components/game-loader'
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
  // The crawlable landing is rendered by the root layout (outside the sign-in gate)
  return <GameLoader />
}

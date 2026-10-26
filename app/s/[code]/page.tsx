import { redirect } from 'next/navigation'

/** Short Space link: /s/ABC123 → the game, which joins the room (after login if needed). */
export default async function SpaceShortLink({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  redirect(`/?join=${encodeURIComponent(code.slice(0, 12))}`)
}

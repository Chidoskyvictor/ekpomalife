import Link from 'next/link'

export const metadata = { title: 'Terms — Ekpoma Life' }

export default function TermsPage() {
  return (
    <main className="app-wash mx-auto min-h-dvh max-w-lg px-4 py-10">
      <Link href="/signup" className="text-sm text-neutral-600">
        Back
      </Link>
      <h1 className="mt-6 text-2xl font-medium">Terms</h1>
      <p className="mt-4 text-neutral-700">
        Ekpoma Life is a game. You must be 18 or older to create an account. Be kind on campus, do not
        share passwords, and treat other players how you want to be treated at AAU.
      </p>
    </main>
  )
}

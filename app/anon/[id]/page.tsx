'use client'

import Link from 'next/link'
import { use, useEffect, useState } from 'react'
import { COLORS, categoryLabel, fetchShare } from '@/lib/game/anonymous-api'

type Share = Extract<Awaited<ReturnType<typeof fetchShare>>, { ok: true }>['post']

/** Shared Anonymous post: the text and counts only. Nothing here says who wrote it. */
export default function SharedAnonymousPost({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [post, setPost] = useState<Share | null>(null)
  const [gone, setGone] = useState(false)

  useEffect(() => {
    void fetchShare(id).then((res) => (res.ok ? setPost(res.post) : setGone(true)))
  }, [id])

  const [bg, fg] = post ? COLORS[post.color] ?? COLORS.violet : COLORS.violet
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 overflow-x-hidden px-4 py-8">
      <div
        className="flex min-h-[55dvh] flex-col justify-center rounded-3xl p-6 shadow-lg"
        style={{ background: bg, color: fg }}
      >
        {post ? (
          <>
            <p className="text-xs font-bold tracking-wide uppercase opacity-80">{categoryLabel(post.category)}</p>
            <p className="mt-3 text-[clamp(1.25rem,5.5vw,1.6rem)] leading-snug font-bold break-words whitespace-pre-wrap">
              {post.body}
            </p>
            <p className="mt-4 text-sm opacity-80">
              Anonymous · {post.likes} likes · {post.comments} comments
            </p>
          </>
        ) : (
          <p className="text-lg font-semibold">{gone ? 'That post is gone.' : 'Loading…'}</p>
        )}
      </div>
      <Link href="/" className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-neutral-900 px-4 font-semibold text-white">
        Open Ekpoma Life
      </Link>
    </main>
  )
}

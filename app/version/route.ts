/** The build this server is running (compared by open apps to offer "Refresh" after a deploy). */
export const dynamic = 'force-dynamic'

export function GET() {
  return Response.json(
    { version: process.env.NEXT_PUBLIC_BUILD_VERSION ?? 'dev' },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

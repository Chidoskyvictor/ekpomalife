# Ekpoma Life

Mobile-first browser life-sim set around Ambrose Alli University, Ekpoma. Next.js frontend (deployed to Cloudflare Workers with OpenNext) and a Fastify backend in `backend/` (deployed on Render).

## Deploying the frontend

```bash
NEXT_PUBLIC_API_URL=https://api.ekpomalife.app NEXT_PUBLIC_USE_MOCKS=false npm run pages:build
npx opennextjs-cloudflare deploy
```

## Cloudflare settings (required)

- **SSL/TLS → Edge Certificates → "Always Use HTTPS" must be ON.** `middleware.ts` also 301s
  plain `http://` and `www.` requests to `https://ekpomalife.app` (same path and query), but the
  middleware skips static files (images, models, fonts, `_next/static`), so only Cloudflare's
  setting upgrades those.
- The canonical host is `ekpomalife.app`; `www.ekpomalife.app` redirects to it.

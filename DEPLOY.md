# Ekpoma Life — Production Deploy

Hand-run checklist to ship **https://ekpomalife.app** (frontend) and **https://api.ekpomalife.app** (API).  
Domain is already on Cloudflare; `.app` is HTTPS-only (HSTS preload). **Never commit secrets.**

---

## Architecture (choices)

| Piece | Choice | Why |
|---|---|---|
| Frontend | **Cloudflare Workers via OpenNext** (`@opennextjs/cloudflare`) + custom domains on `ekpomalife.app` / `www` | Next.js **16.4+** (bumped from 16.3 for OpenNext peer range) needs Node compat; `@cloudflare/next-on-pages` is Edge-only and incomplete for App Router. OpenNext is Cloudflare’s supported path. DNS still lives in Cloudflare (same as “Pages custom domain” UX). |
| API | **Render** (Docker, **free** plan) | Checked-in `render.yaml`, migrations on **startup** (`schema_migrations`, idempotent), health checks, custom domain TLS. Free tier has no pre-deploy hook and may spin down when idle. |
| DB | **Neon Postgres** (`sslmode=require`) | Managed Postgres with SSL, branching/backups, not locked to Render’s region; connection string only in Render env. |

Local LAN still uses the Next `/api` proxy. **Production does not** — the browser calls `https://api.ekpomalife.app` with cookies `Domain=.ekpomalife.app`.

---

## 0. Prerequisites

- [ ] Node **20+** (`node -v`)
- [ ] Cloudflare account (domain `ekpomalife.app` already added)
- [ ] GitHub repo connected
- [ ] Neon account + Render account
- [ ] Resend account (password reset) with domain `mail.ekpomalife.app` (or your sender domain)

---

## 1. Database (Neon — free)

1. Open [console.neon.tech](https://console.neon.tech) and sign in (GitHub is fine).
2. Click **New project** (or **Create a project**).
3. **Project name:** e.g. `ekpomalife` (any name).
4. **Region:** pick **EU (Frankfurt)** if you keep `region: frankfurt` in `render.yaml` (or match whatever region you choose on Render).
5. **Postgres version:** default is fine. Leave compute on the **free** tier if offered.
6. Click **Create project**.
7. On the project **Dashboard**, find **Connection details** (or **Connect**).
8. Set **Branch** to `main` (default), **Database** to `neondb` (default), **Role** to the default user.
9. Enable **Connection pooling** only if you want; for a single Render free instance, the direct connection string is fine.
10. Copy the **connection string** (URI). Append SSL if it is missing:  
    `?sslmode=require` (or `&sslmode=require` if the URL already has query params).  
    Example shape: `postgresql://USER:PASS@ep-….eu-central-1.aws.neon.tech/neondb?sslmode=require`
11. **Do not** commit this URL. Store it for Render step 3 as `DATABASE_URL`.

**Backup note (when you upgrade):** Neon → project → **Backups** / PITR. On free tier, note what retention you get before risky migrations.

---

## 2. Frontend env + local prod build

### 2.1 Install Cloudflare tooling (once)

From repo root:

```bash
npm install @opennextjs/cloudflare@latest
npm install -D wrangler@latest
```

(or `pnpm add @opennextjs/cloudflare@latest && pnpm add -D wrangler@latest`)

### 2.2 Production env (Cloudflare)

In Cloudflare dashboard (Workers/Pages project → Settings → Variables) **or** `.dev.vars` only for local preview — **not** committed:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.ekpomalife.app` |
| `NEXT_PUBLIC_USE_MOCKS` | `false` |
| `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` | (optional) Google Search Console HTML-tag value — **set in the Cloudflare build environment**; Next reads it at **build time** for `metadata.verification.google` |

Do **not** set `API_PROXY_TARGET` or `NEXT_PUBLIC_API_DIRECT_URL` in production.

### 2.3 Models (25 MB Cloudflare limit)

```bash
npm run models:check-size
```

Largest GLBs today are ~19 MB (under the limit). Duplicate stadium `Football stadium by Poly by Google - ….glb` was removed; runtime uses `football-stadium.glb`.

If anything exceeds ~20 MB:

```bash
npm run models:compress
```

### 2.4 Build locally (must pass)

```bash
# Node 20+
# Tests clear NEXT_PUBLIC_API_URL themselves (MSW uses /api). Build with prod values:
export NEXT_PUBLIC_API_URL=https://api.ekpomalife.app
export NEXT_PUBLIC_USE_MOCKS=false
npm test
npm run build
npm run pages:build
```

| Item | Value |
|---|---|
| Node | **20.x** (`engines.node >= 20`) |
| Package manager | **npm** (`package-lock.json` at repo root) |
| Build command (Cloudflare) | `npm run pages:build` (= `opennextjs-cloudflare build`) |
| Output | **`.open-next/`** (Worker + assets; Wrangler uploads this) |
| Config | `wrangler.jsonc`, `open-next.config.ts` |
| Windows note | OpenNext warns on native Windows — prefer **WSL** or Cloudflare’s Git builder (Linux) for `pages:build` / deploy. Local `npm run build` + `npm test` on Windows is enough to validate. |

---

## 3. API (Render + Docker)

### 3.1 Env vars (Render dashboard → ekpomalife-api → Environment)

| Name | Value / notes |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `4000` (Render sets `PORT` sometimes — Dockerfile listens on `env.PORT`) |
| `DATABASE_URL` | Neon URL with `?sslmode=require` |
| `SESSION_SECRET` | `openssl rand -hex 32` (or Render **generate**; rotating it logs everyone out) |
| `RESET_CODE_PEPPER` | `openssl rand -hex 32` |
| `FRONTEND_ORIGIN` | `https://ekpomalife.app,https://www.ekpomalife.app` |
| `MAIL_FROM` | `Ekpoma Life <noreply@mail.ekpomalife.app>` |
| `RESEND_API_KEY` | from Resend (or use `SMTP_URL` instead) |

Full list mirrors `backend/.env.example`.

### 3.2 Local API prod build (must pass)

```bash
cd backend
npm ci
npm test
npm run build
# Needs a real DATABASE_URL + SESSION_SECRET to start:
# NODE_ENV=production SESSION_SECRET=… DATABASE_URL=… node dist/server.js
# curl -s localhost:4000/health   → {"ok":true,"db":true}
```

| Item | Value |
|---|---|
| Build | `npm run build` → `tsc` → `dist/` |
| Start | `node dist/server.js` |
| Migrate | Automatic on API startup (`runMigrations` → `schema_migrations`). Manual: `node dist/migrate.js` or `npm run db:migrate` locally. |
| Listen | `0.0.0.0:$PORT` |
| Health | `GET /health` runs `SELECT 1` (503 if DB down) |
| Cookies | `Secure; HttpOnly; SameSite=Lax; Domain=.ekpomalife.app; Path=/` |
| CORS | only `FRONTEND_ORIGIN` list, `credentials: true` |
| Proxy | `trustProxy: true` |
| Rate limits | logged-in 300/min per user, anonymous 120/min per IP; signup/login/forgot/reset 10/min per IP + per email/username; `GET /health` exempt; `RATE_LIMIT_ALLOWLIST` (comma-separated IPs) skips limits for load tests — keep empty |

### 3.3 Create the Render service (free)

`render.yaml` uses `plan: free` (no `preDeployCommand` — that hook is not available on free). The Docker **start** command runs `node dist/server.js`, which applies pending SQL from `backend/sql/` before listening (safe to run on every boot).

**Option A — Blueprint (recommended)**  
1. Open [dashboard.render.com](https://dashboard.render.com) and sign in.
2. Click **New +** (top right) → **Blueprint**.
3. Connect **GitHub** if asked, then select the **ekpomalife** repository.
4. Render detects `render.yaml` at the repo root. Click **Apply** (or **Create blueprint**).
5. When prompted for **Environment Variables** / secret inputs:
   - **`DATABASE_URL`** — paste the full Neon URI from §1 (with `sslmode=require`).
   - **`RESEND_API_KEY`** — paste from Resend → **API Keys** → **Create API Key** (any name; copy once).
6. Leave **`SESSION_SECRET`** and **`RESET_CODE_PEPPER`** as **Generate** (Render fills them).
7. Click **Apply** / **Create services** and wait for the first deploy (Docker build + start). First request after idle may be slow (free spin-down).
8. Open the service → **Logs** and confirm lines like `Applied 001_init.sql` or `Skip … (already applied)` before `Server listening`.

**Option B — Manual Docker**  
1. Render → **New +** → **Web Service** → connect this repo.  
2. Runtime **Docker**, Dockerfile path `backend/Dockerfile`, context `backend`.  
3. **Instance type:** **Free**.  
4. Health check path `/health`.  
5. **Do not** set a pre-deploy command (not on free); migrations run on startup.  
6. Add env vars from the table above (same as blueprint).  

### 3.4 Custom domain on Render

1. Render service → **Settings** → **Custom Domains** → `api.ekpomalife.app`  
2. Render shows a target like `ekpomalife-api.onrender.com` — copy it for DNS (step 4).

---

## 4. Cloudflare DNS + SSL

Do this in Cloudflare → **ekpomalife.app** → **DNS** → **Records**.

### 4.1 Apex + www → frontend Worker

After first successful `npm run deploy` / Cloudflare Git deploy of OpenNext:

1. Workers & Pages → your **ekpomalife** Worker → **Settings** → **Domains & Routes** → **Add**  
   - `ekpomalife.app`  
   - `www.ekpomalife.app`  
2. Cloudflare will create/adjust DNS. Confirm records roughly:

| Type | Name | Target | Proxy |
|---|---|---|---|
| CNAME or A/AAAA | `@` | (Cloudflare Worker / Pages target) | **Proxied** (orange) |
| CNAME | `www` | `ekpomalife.app` (or Worker target) | **Proxied** |

3. **www → apex:** Workers → domain `www` → redirect, **or** Bulk Redirect / Page Rule:  
   `https://www.ekpomalife.app/*` → `https://ekpomalife.app/$1` (301).

### 4.2 API hostname

| Type | Name | Target | Proxy |
|---|---|---|---|
| CNAME | `api` | `ekpomalife-api.onrender.com` (your Render host) | **Proxied** |

### 4.3 SSL / TLS (Cloudflare)

1. **SSL/TLS** → overview → mode **Full (strict)**  
2. **Edge Certificates** → **Always Use HTTPS** = On  
3. **Automatic HTTPS Rewrites** = On  
4. Wait until `api` and apex show **Active** / trusted cert (often a few minutes).

### 4.4 Resend (password reset) DNS

In Resend → Domains → `mail.ekpomalife.app` (or your verified sender):

1. Add the **SPF**, **DKIM**, and (if shown) **DMARC** records exactly as Resend lists them under Cloudflare DNS.  
2. Keep **Receiving** off (outbound only).  
3. Set Render `MAIL_FROM=Ekpoma Life <noreply@mail.ekpomalife.app>` and `RESEND_API_KEY`.  
4. Send a test forgot-password after API is live.

---

## 5. Deploy frontend to Cloudflare

### CLI

```bash
npx wrangler login
export NEXT_PUBLIC_API_URL=https://api.ekpomalife.app
export NEXT_PUBLIC_USE_MOCKS=false
npm run deploy
```

### Git integration

1. Cloudflare → Workers → **Create** → connect GitHub → this repo  
2. Build command: `npm run pages:build`  
3. Deploy command / Wrangler config: use `wrangler.jsonc`  
4. Root directory: repo root  
5. Env vars: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_USE_MOCKS`  
6. Production branch: `main`

---

## 6. Order of operations (first launch)

1. Neon free project → copy `DATABASE_URL` (§1)  
2. Render Blueprint from repo → paste `DATABASE_URL` + `RESEND_API_KEY` → wait for deploy logs (migrations on startup) → `GET https://api.ekpomalife.app/health` → `{"ok":true,"db":true}`  
3. Add Cloudflare DNS for `api` + SSL Full (strict)  
4. Deploy frontend with prod `NEXT_PUBLIC_*`  
5. Attach `ekpomalife.app` + `www` to the Worker; set www→apex redirect  
6. Verify Resend DNS  
7. Run the launch checklist below  

---

## 7. Launch checklist

From a **phone on mobile data** (not Wi‑Fi):

- [ ] Open `https://ekpomalife.app` (padlock, no mixed content)  
- [ ] Sign up → finish look / traits / dream / live → **spin starting money** (real ₦ balance)  
- [ ] Enter campus → **work a job** → **buy** from shop → **pay rent**  
- [ ] Log out → log back in (session cookie on `.ekpomalife.app`)  
- [ ] Forgot password → email code → reset → log in  

Desktop DevTools:

- [ ] No console errors on load / play  
- [ ] Network: API calls to `https://api.ekpomalife.app` (not `/api` proxy)  
- [ ] Application → Cookies: `el_session` on `.ekpomalife.app`, **Secure**, **HttpOnly**, **SameSite=Lax**  
- [ ] `https://api.ekpomalife.app/health` → `ok: true`, `db: true`  

---

## 8. Rollback

### Frontend

```bash
# Cloudflare dashboard → Workers → ekpomalife → Deployments → Retry / Rollback previous
# or redeploy a known-good git SHA:
git checkout <good-sha>
NEXT_PUBLIC_API_URL=https://api.ekpomalife.app NEXT_PUBLIC_USE_MOCKS=false npm run deploy
```

### API

1. Render → service → **Rollback** to previous deploy, **or**  
2. Redeploy previous git SHA (migrations are forward-only / idempotent via `schema_migrations`).  
3. If a bad migration corrupted data: restore Neon backup/branch, then redeploy API.

---

## 9. Local vs production quick reference

| | Local / LAN | Production |
|---|---|---|
| Browser API base | `/api` (Next proxy) | `https://api.ekpomalife.app` |
| `API_PROXY_TARGET` | set | unset |
| `NEXT_PUBLIC_API_URL` | `http://127.0.0.1:4000` or LAN API | `https://api.ekpomalife.app` |
| `NEXT_PUBLIC_USE_MOCKS` | `false` (or `true` for UI-only) | `false` |
| Cookie Domain | host-only | `.ekpomalife.app` |
| Cookie Secure | false | true |

---

## 10. Files added for deploy

- `DEPLOY.md` (this file)  
- `wrangler.jsonc`, `open-next.config.ts`, `public/_headers`  
- `scripts/compress-models.mjs`  
- `backend/Dockerfile`, `render.yaml`  
- `backend` `build` / `start` / `migrate` scripts → `dist/`  

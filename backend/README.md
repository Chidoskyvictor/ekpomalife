# Ekpoma Life API

Signup backend for the web sim. Run this on the backend computer. The other computer’s frontend calls it.

## Why this setup

Postgres stores players. Passwords are hashed with Argon2id, never SHA-256 or plain text. Sessions are random tokens in an HttpOnly cookie; the database only keeps a hash of the token. Queries go through Prisma so user input is not concatenated into SQL. Signup is rate-limited.

## Setup

1. Install [PostgreSQL](https://www.postgresql.org/download/windows/) and create a database:

```sql
CREATE USER ekpoma WITH PASSWORD 'ekpoma';
CREATE DATABASE ekpoma_life OWNER ekpoma;
```

2. Copy `.env.example` to `.env` and set `DATABASE_URL`.
3. Install and migrate:

```bash
cd backend
npm install
npm run db:migrate
npm run dev
```

API: `http://localhost:4000`

From the other computer, set `FRONTEND_ORIGIN` to that frontend URL (for example `http://192.168.0.20:3000`) and set the frontend `NEXT_PUBLIC_API_URL` to this machine, for example `http://192.168.0.10:4000`.

## Auth

`POST /auth/signup`

```json
{ "name": "Ada", "username": "ada_aau", "password": "secretword", "isAdult": true }
```

`POST /auth/login`

```json
{ "username": "ada_aau", "password": "secretword" }
```

`POST /auth/forgot`

```json
{ "email": "ada@example.com" }
```

Always returns `{ "ok": true }`. If the email exists, a 6-digit code is stored hashed for ~12 minutes and emailed (Resend / SMTP). Without mail config, the code is printed in the API console.

`POST /auth/reset`

```json
{ "email": "ada@example.com", "code": "123456", "password": "newsecret1" }
```

# Webamazee AgentOS — Deployment Guide

## Local Development

```bash
npm install
npm run seed      # one-time: workspace + AI workforce + demo project
npm run dev       # app on http://localhost:3000 (embedded MongoDB auto-starts)
npm run worker    # agent job execution (second terminal)
```

Production-like local run:

```bash
npm run build
npm start         # serves the built app (needs a running MongoDB / embedded via dev-db)
```

## Production Build

```bash
npm run typecheck
npm run build
```

Set `MONGODB_URI` (MongoDB Atlas) and `JWT_SECRET` before `npm start`.

## Vercel Deployment (step by step)

1. **Push to GitHub**
   ```bash
   git init && git add -A && git commit -m "Webamazee AgentOS"
   git remote add origin <your-repo> && git push -u origin main
   # .gitignore excludes .next, node_modules, .data, .env*.local
   ```

2. **Import into Vercel** — New Project → Import Repository → framework is auto-detected as Next.js. No custom build settings needed.

3. **Configure environment variables** (Project → Settings → Environment Variables):
   | Name | Value | Notes |
   |---|---|---|
   | `MONGODB_URI` | `mongodb+srv://user:pass@cluster/agentos` | from Atlas Connect dialog |
   | `JWT_SECRET` | long random string | sessions + credential encryption |
   | `AI_ENABLED` | `false` | optional — enable later |
   | `AI_PROVIDER` / `AI_BASE_URL` / `AI_MODEL` / `AI_API_KEY` | provider config | only if AI enabled |

4. **Configure MongoDB Atlas** — Network Access: allow `0.0.0.0/0` (Vercel has dynamic IPs) or use VPC peering; Database user with `readWrite` on `agentos`.

5. **Deploy.**

6. **Seed the workspace** (creates the demo org + AI workforce; only works while there are no users or in development):
   ```bash
   curl -X POST https://<your-app>.vercel.app/api/seed
   ```

7. **Verify frontend** — open `https://<your-app>.vercel.app`, log in, theme switcher works (light/dark), dashboard loads.

8. **Verify API** — `curl https://<your-app>.vercel.app/api/auth/me` → 401 unauthenticated (expected); after login → 200 with user + org payload.

9. **Verify authentication** — sign up a new agency on `/signup`, log out, log in again.

10. **Verify database + jobs** — create a project with a real URL and start discovery. `vercel.json` includes a cron that calls `/api/jobs/process` every minute to execute agent jobs. Check `/app/jobs` to see the queue drain. For heavy workloads run `npm run worker` on a persistent host against the same Atlas database instead — no code changes required.

11. **Verify production env** — confirm `AI_ENABLED` and secrets differ between Preview and Production environments intentionally.

## Cron note

Vercel Hobby plans support daily crons only; Pro runs the suggested `* * * * *`. The route processes at most 15 jobs per invocation within 45 seconds — HTTP requests never stay open for long-running crawls.

## Data persistence note

The embedded MongoDB (`mongodb-memory-server`) is a **local development convenience only**. Production must use MongoDB Atlas (or any reachable MongoDB) via `MONGODB_URI`; `scripts/dev-db.mjs` is not used in production.

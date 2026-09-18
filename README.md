# Webamazee AgentOS

**AI Employees for Your Digital Agency** — by **Webamazee**

Webamazee AgentOS is an AI-powered agency operating system: build a workforce of AI employees (a Team Head + specialist SEO agents), assign client projects, and let them perform **real, verifiable** digital marketing and SEO work — crawls, audits, findings with evidence, delegated tasks, QA verification, owner approvals, and professional reports.

> Webamazee AgentOS is an **AI workforce, not an AI chatbot**.

---

## Product Concept

```
Agency Owner
      ↓
AI Team Head  (Senior SEO Manager — delegates, prioritizes, escalates)
      ↓
Specialist AI Agents  (Audit, Technical, Keywords, Competitors, On-Page,
      ↓                 Content, Local, GBP, Off-Page, Internal Links, Analytics, QA)
    Tasks → Tools → Actual Execution → QA Agent → Verified Results → Reports
```

Honesty rules baked into the platform:

- No fabricated rankings, traffic, backlinks, GBP, Search Console or Analytics data.
- Every finding carries **evidence from a real crawl**; every important action carries an **AgentRun** and **artifact**.
- Lifecycle is always explicit: `Detected → Recommended → Approved → Executing → Executed → Verified`.
- Missing integrations surface as **Integration Required** — never fake data.
- The demo project is labelled **Demo Data** everywhere.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Tailwind CSS (Next.js 14 App Router) |
| Backend / API | Node.js + TypeScript (Next.js Route Handlers — Vercel-serverless native) |
| Services | Service layer in `src/server/*` (agent engine, crawler, tools, reports) — routes stay thin |
| Database | MongoDB (Mongoose 8). Local dev: embedded MongoDB; production: MongoDB Atlas |
| Worker | Persistent local worker (`src/worker`) + serverless cron drain (`/api/jobs/process`) |
| Automation | Playwright-ready architecture (browser worker is an optional integration) |
| Deployment | Vercel |

## Architecture

```
┌──────────────────────────── Vercel ─────────────────────────────┐
│  Frontend (React) ──► API routes (/api/*)                        │
│        │                  │ enqueue job (Job collection)         │
│        │                  ▼                                      │
│        │        ┌── Agent Engine ──┐   ┌── Tool Engine ──┐       │
│        │        │ dispatch/runTask │──►│ crawler, http,  │       │
│        │        │ specialists/QA   │   │ parsers, CMS…   │       │
│        │        └────────┬─────────┘   └─────────────────┘       │
│        ▼                 ▼  updates                              │
│   MongoDB Atlas ◄─── Workflow Engine ◄── Approvals               │
│        ▲                                                         │
│   /api/jobs/process (cron) ──► drains jobs (≤45s budget)         │
└───────────────────────────────────────────────────────────────────┘
Local dev: `scripts/dev-db.mjs` + `npm run worker` (persistent worker)
```

**Honest, AI-optional design.** With `AI_ENABLED=false` (default) agents run on a deterministic rule engine over real crawl data. Enabling an AI provider (Ollama local by default) adds labelled AI narratives to strategy and reports. The platform is fully functional either way.

## Folder Structure

```
src/
├─ app/                     # Next.js app router
│  ├─ app/                  # authenticated app shell (sidebar + pages)
│  │  ├─ dashboard/  clients/  projects/  tasks/  findings/  reports/
│  │  ├─ agents/  departments/  runs/  activity/
│  │  ├─ workflows/  approvals/  jobs/  knowledge/  integrations/  settings/
│  ├─ api/                  # REST API (thin route handlers)
│  └─ login/  signup/
├─ components/              # UI system (sidebar, theme, badges, cards…)
├─ lib/                     # env, db, session(JWT), http, crypto, ratelimit, enums
├─ models/                  # Mongoose models (core / agents / work)
└─ server/                  # SERVER-ONLY domain logic
   ├─ crawler/              # real SEO crawler (robots, sitemap, parser, BFS)
   ├─ engine/               # agent engine: dispatch, queue, workflow, approvals,
   │                       # specialists-core/-misc, teamhead, run-context, process
   ├─ tools.ts              # tool registry (21 tools)
   ├─ rules.ts              # deterministic SEO audit rules
   ├─ ai.ts                 # AI provider layer (ollama/openai/groq/anthropic/custom)
   ├─ seed.ts / provision.ts# seed + per-org workforce provisioning
   └─ worker/ → src/worker  # persistent local worker process
scripts/                    # dev-db.mjs (embedded mongo launcher), run-seed.ts
```

## Quick Start (local)

```bash
npm install
npm run seed    # creates org, owner, AI workforce, SOPs, demo project
npm run dev     # http://localhost:3000
npm run worker  # second terminal: executes agent jobs
```

- On first run, an embedded MongoDB starts automatically (persistent under `.data/mongo`) — no setup needed. To use your own MongoDB/Atlas instead, set `MONGODB_URI` in `.env.local`.
- Demo login: **owner@webamazee.com** / **Agent0s!Demo123**
- Then: **Projects → New Project**, walk the 11-step wizard and press **Create project & start**. Watch the Team Head crawl the site, record findings, delegate specialists, run QA and ask for your strategy approval.

## Environment Variables

See `.env.example`. Key ones:

```bash
MONGODB_URI=            # MongoDB Atlas in production; empty locally = embedded dev DB
JWT_SECRET=             # long random string (also encrypts integration credentials)

AI_ENABLED=false        # platform works fully with AI disabled
AI_PROVIDER=local       # local | openai-compatible | groq | anthropic-compatible | custom
AI_BASE_URL=http://localhost:11434
AI_MODEL=llama3.2
AI_API_KEY=

WORKER_POLL_MS=3000
CRAWL_MAX_PAGES=25
```

Server-only secrets are never exposed to the client (no `NEXT_PUBLIC_` variants exist).

## MongoDB Atlas Setup (production)

1. Create a cluster → Database → create database `agentos`.
2. Database Access → add a user; Network Access → allow your host / Vercel.
3. Copy the connection string into `MONGODB_URI`.
4. Indexes are created automatically by Mongoose on first connection
   (org-scoped unique keys, workflow/task/status, activity & finding indexes).

## AI Provider Setup

Default development config is **AI disabled** with a local Ollama target:

```bash
AI_ENABLED=true
AI_PROVIDER=local
AI_BASE_URL=http://localhost:11434
AI_MODEL=llama3.2
```

Supported: **Ollama (local)**, **OpenAI-compatible**, **Groq-compatible**, **Anthropic-compatible**, **Custom API** (`/v1/chat/completions` or `/v1/messages` shapes). AI output is always labelled with provider/model in reports.

## Worker & Jobs

Long-running work never happens inside an HTTP request:

- **Local dev:** `npm run worker` — persistent process polling the `Job` collection.
- **Vercel:** a cron (preconfigured in `vercel.json`) hits `GET /api/jobs/process` every minute, draining up to 15 jobs within a 45s budget. A persistent queue service (e.g. a Railway/Fly worker running `npm run worker`) can be attached later **without changing the Agent Engine** — both paths call the same `processJobsFor()`.

Retries use exponential backoff at both the job level and the task level; QA can force **rework** tasks; the Team Head and workflow engine escalate failures.

## Integrations

Architecture for: Google Search Console, Google Analytics, Google Business Profile, WordPress, Shopify, Webflow, Slack, Email (SMTP), Ahrefs, Semrush, DataForSEO, custom APIs.

- States: `Connected · Not Connected · Requires OAuth · Requires API Key · Unavailable`.
- Credentials are AES-256-GCM encrypted at rest and never sent to the browser.
- Agents **gate on real connection state**: GBP/Analytics/Off-Page tasks complete with `Integration Required` output instead of fabricating data.
- WordPress execution path is implemented (title/meta updates via WP REST) but requires a connected site + application password.

## Vercel Deployment

Full instructions: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

TL;DR: push to GitHub → import in Vercel → set `MONGODB_URI` + `JWT_SECRET` → deploy → run `curl -X POST https://<app>/api/seed` once → verify login.

## Security

- JWT sessions in httpOnly, SameSite cookies (7d); bcrypt(12) password hashing.
- Server-side organization isolation on **every** query; route-level RBAC (owner/admin/member/viewer).
- Zod validation on write endpoints; in-memory rate limiting on auth/discovery endpoints.
- Encrypted integration credentials; audit log (ActivityLog) for owner/agent/system actions.

## Production Considerations

- Swap the in-memory rate limiter for Redis/Upstash when running multiple instances.
- Vercel cron runs the queue every minute; for heavy crawl workloads attach a persistent worker (`npm run worker`) against the same Atlas database.
- Playwright browser worker is an optional integration (`playwright_worker`) — disabled by default.
- Set a strong `JWT_SECRET`; it is also the credential-encryption key (rotate = re-enter credentials).

## Known Limitations

See [`docs/IMPLEMENTATION-REPORT.md`](docs/IMPLEMENTATION-REPORT.md#limitations) for the honest list.

---

**Webamazee AgentOS** — the owner manages the agency, the Team Head manages the AI employees, specialists do the specialized work, tools provide real capabilities, evidence proves what happened, QA verifies it, approvals keep the owner in control, and reports communicate the results.

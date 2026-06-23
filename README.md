# Accurate Edges

Knife sharpening **route & commission tracker** — a React/Vite PWA backed by
Supabase, deployable to Render. A boss builds daily routes and manages accounts;
field employees log work at each stop; the boss approves submissions and runs
payroll.

## Features

**Boss console**
- **Accounts** — customer records with per-account services and pricing. Scan a
  paper invoice and Claude Vision pre-fills the form; the photo is stored in a
  private bucket and auto-pruned after 90 days.
- **Route builder** — assign an ordered list of stops to an employee for a date.
- **Approvals** — review, approve, or flag submissions; export CSV or print.
- **Payroll** — per-employee commission for a date range, using a configurable
  tiered commission schedule. Export CSV.
- **Team** — see everyone who signed up; admins set anyone's role (employee /
  boss / admin).

**Field console**
- **Today** — your ordered stops, progress, and running day total.
- **Stop** — log quantities per service, add notes, submit. Submissions made
  offline are queued and synced automatically when you're back online.
- **History** — recent submissions and a month-to-date earnings estimate.
- **Translate** — English ↔ Spanish (text and voice) powered by Claude.

Plus: light/dark themes, installable PWA, password reset, and an error boundary.

## Setup

### 1. Supabase
1. Create a Supabase project.
2. Open the SQL editor and run [`supabase/schema.sql`](supabase/schema.sql).
   It is idempotent — safe to re-run. It creates all tables, row-level security
   policies, the commission schedule, the private `invoices` storage bucket, and
   the boss allowlist.

### 2. Roles and who becomes what
There are three roles, lowest to highest privilege:

- **employee** — field worker (the default for new sign-ups).
- **boss** — operational management: accounts, routes, approvals, payroll.
- **admin** — everything a boss can do, plus managing everyone's roles.

Roles can be granted automatically on sign-up via two allowlist tables.
`admin_emails` wins over `boss_emails`. The schema seeds the initial owner as
**admin**:

```sql
insert into public.admin_emails (email) values ('you@example.com');
-- or, for a boss:
insert into public.boss_emails (email)  values ('manager@example.com');
```

The schema also backfills roles for anyone who already signed up. After that,
**admins** can change anyone's role from the **Team** page — no SQL needed.
Role changes are enforced as admin-only at the database level (a trigger), so a
boss can run operations but cannot mint other bosses or admins.

### 3. Environment
Copy `.env.example` to `.env` and fill in:

| Variable | Where | Required | Purpose |
|---|---|---|---|
| `VITE_SUPABASE_URL` | client (build) | yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | client (build) | yes | Supabase anon key |
| `ANTHROPIC_API_KEY` | server (runtime) | for OCR/translate | Claude Vision + translation |
| `VITE_GOOGLE_MAPS_API_KEY` | client (build) | optional | Address autocomplete |

`ANTHROPIC_API_KEY` must stay server-side — it powers `/api/extract-invoice`
and `/api/translate` in `server.js`. Without it those features degrade to
manual entry. Without `VITE_GOOGLE_MAPS_API_KEY` the address field is plain text.

### 4. Run locally
```bash
npm install
npm run dev          # Vite dev server (client only; /api/* needs the Node server)
npm start            # build first, then serve dist + /api on the Express server
```

## Scripts
- `npm run dev` — Vite dev server
- `npm run build` — production bundle to `dist/`
- `npm start` — run the Express server (`server.js`) that serves `dist/` and the API
- `npm run lint` — ESLint
- `npm test` — Vitest unit tests

## Deployment (Render)
`render.yaml` defines a Node web service: it builds the SPA and runs
`server.js`, which serves the bundle and hosts the API routes so the Anthropic
key stays off the client. Set the env vars from the table above in the Render
dashboard (all marked `sync: false`).

## Project layout
```
src/
  components/   UI screens (boss + employee consoles)
  contexts/     Auth and theme providers
  lib/          supabase client, Claude proxy, commission math, offline queue, places
  utils/        CSV + formatting helpers
server.js       Express server: static SPA + /api/extract-invoice + /api/translate
supabase/       schema.sql (tables, RLS, storage, commission tiers, boss allowlist)
```

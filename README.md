# Finlingo

Plain-English finance learning app. The frontend is a static site (`index.html`
+ vanilla JS/CSS). The backend is a set of **Vercel Python serverless
functions** under [`api/`](api/). There is no long-running server in production
— the app loads instantly (no Render "service waking up" page).

## Architecture at a glance

| Route | Function | Purpose |
| --- | --- | --- |
| `GET /api/quotes` | [`api/quotes.py`](api/quotes.py) | Key-less Yahoo quote proxy |
| `GET /api/stock-history` | [`api/stock-history.py`](api/stock-history.py) | Key-less Yahoo chart proxy |
| `POST /api/ask-finlingo` | [`api/ask-finlingo.py`](api/ask-finlingo.py) | Ask responses, simplify, quizzes, market explainers (Anthropic) |
| `POST/GET /api/unit-jobs` | [`api/unit-jobs.py`](api/unit-jobs.py) | Create / list unit-generation jobs |
| `GET /api/unit-jobs/{id}` | [`api/unit-job.py`](api/unit-job.py) | Poll a job — **advances it one step per poll** |
| `POST /api/unit-jobs/{id}/cancel` | [`api/unit-job-cancel.py`](api/unit-job-cancel.py) | Cancel a job |
| `POST /api/unit-jobs/{id}/retry` | [`api/unit-job-retry.py`](api/unit-job-retry.py) | Retry a failed job |

Shared logic lives in [`api/_lib/`](api/_lib/) (not routable — the leading
underscore keeps Vercel from treating it as endpoints). The dynamic
`/api/unit-jobs/{id}` routes are mapped to query-param functions by the
`rewrites` in [`vercel.json`](vercel.json), which also contains the SPA fallback
that makes refreshing any page work (no 404s).

### How unit generation works on serverless

A background worker + local SQLite can't survive on stateless functions, so unit
generation uses a **durable advance-on-poll** model:

1. `POST /api/unit-jobs` writes a durable job row (status `queued`) to Supabase
   and returns immediately.
2. The frontend polls `GET /api/unit-jobs/{id}` every ~1.5s. **Each poll claims
   a short lease and performs exactly one generation step** — outline, then one
   lesson at a time, then the recap quiz, then validation — persisting progress
   as it goes.

This preserves the original UX exactly: incremental "X of N lessons ready",
cancel, retry, and resume-after-reload — with no long-lived process.

## 1. Run Finlingo locally

**Recommended (production parity — runs the real `/api` functions):**

```bash
npm i -g vercel          # one time
vercel dev               # serves the static app + /api functions at http://localhost:3000
```

Provide secrets locally in `.env.local` (already git-ignored):

```bash
ANTHROPIC_API_KEY=sk-ant-...
# Optional locally — if omitted, jobs use a local SQLite store in /tmp so unit
# generation still works offline. Set these to test the real Supabase path:
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
```

**Zero-dependency fallback (no Vercel CLI):**

```bash
ANTHROPIC_API_KEY=sk-ant-... python3 server.py   # http://localhost:8000
```

`server.py` is **local development only**. It serves the static app and the same
API surface, but backs unit jobs with a local SQLite file instead of Supabase.
Production never runs it.

## 2. Environment variables to add in Vercel

In **Project → Settings → Environment Variables** (Production + Preview):

| Variable | Required | Scope | Notes |
| --- | --- | --- | --- |
| `ANTHROPIC_API_KEY` | ✅ | **Server only** | Powers Ask + unit generation. Never shipped to the browser. |
| `SUPABASE_URL` | ✅ | Server (safe if public) | Your Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | **Server only** | Bypasses RLS for the `unit_jobs` table. **Never expose to the frontend.** |
| `FINLINGO_ENV` | optional | Server | Set to `production` to hide verbose error detail. |

The Supabase **publishable/anon** key and URL used by the browser already live in
`supabase.js` and are safe there. The **service-role** key must only ever be
read server-side (it is, in [`api/_lib/supabase_rest.py`](api/_lib/supabase_rest.py)).

## 3. Deploy through GitHub

1. Push this repo to GitHub.
2. In Vercel, **Add New… → Project → Import** the GitHub repo.
3. Framework preset: **Other** (no build step — static + Python functions are
   auto-detected). Leave build/output settings empty.
4. Add the environment variables from section 2.
5. Run the Supabase migration (see "Supabase setup" below).
6. **Deploy.** Every push to the default branch ships to production; PRs get
   preview URLs automatically.

## 4. Connect `learnfinlingo.online`

1. Vercel **Project → Settings → Domains → Add** `learnfinlingo.online` (and
   `www.` if desired).
2. At your DNS provider, follow Vercel's instructions:
   - Apex `learnfinlingo.online` → `A` record to Vercel's IP (Vercel shows the
     current value), or use Vercel nameservers.
   - `www` → `CNAME` to `cname.vercel-dns.com`.
3. Vercel issues the TLS cert automatically once DNS resolves. No code change is
   needed — the app uses relative `/api/...` paths, so it works on any domain.

## 5. Vercel serverless limitations to know

- **No shared memory / no background threads.** That's why jobs are durable in
  Supabase and advance on each poll rather than via a worker thread.
- **Ephemeral filesystem.** Only `/tmp` is writable and it is per-instance, not
  shared — never used for production job state.
- **Execution time.** Functions default to a 300s max; here each poll does just
  one step (~one Anthropic call), well within `maxDuration` (60s in
  `vercel.json`).
- **Cold starts.** First hit after idle may add a small delay; Fluid Compute
  keeps warm instances to minimize it. There is no Render-style wake-up page.
- **Rate limiting** in the functions is best-effort per-instance, not global.

## Supabase setup (required for unit generation)

Run the migration in
[`supabase/migrations/20260625000000_unit_jobs.sql`](supabase/migrations/20260625000000_unit_jobs.sql)
— either with the Supabase CLI (`supabase db push`) or by pasting it into the
Supabase SQL editor. It creates the `unit_jobs` table, indexes, and enables RLS
with **no policies**, so only the server-side service-role key can touch it.

**Cleanup (table never grows unbounded):** the app performs best-effort cleanup
on every job creation, deleting rows whose `updated_at` is older than ~2 days.
The migration also includes an optional `pg_cron` job (commented) as a backstop.

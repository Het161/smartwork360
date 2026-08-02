# Deploying

Two Vercel projects, one shared repository.

| Project | Serves | Live |
|---|---|---|
| `smartwork360-api` | Express REST API | https://smartwork360-api.vercel.app |
| `smartwork360` | Next.js web app | https://smartwork360.vercel.app |

## Status

- ✅ **API deployed and running.** It reports its own configuration state at
  [`/health`](https://smartwork360-api.vercel.app/health).
- ⏳ **Needs a database.** Until `DATABASE_URL` is set, every API call returns a
  clear `NOT_CONFIGURED` 503 naming what is missing — deliberately, rather than a
  stack trace.
- ⚠️ **Web project needs its Root Directory set to `apps/web`** (a dashboard
  setting the CLI cannot write). Until then it serves the API placeholder page.

## Step 1 — a database (2 minutes)

Vercel dashboard → **Storage** → **Create** → **Neon Postgres** (free tier) →
connect it to the **smartwork360-api** project. Vercel injects `DATABASE_URL`
automatically.

Any other Postgres works too — Supabase, Railway, Neon direct. Use the **pooled**
connection string; serverless functions open many short-lived connections.

```bash
vercel env add DATABASE_URL production --cwd .   # if adding it by hand
```

Then create the schema and seed it:

```bash
DATABASE_URL="<your pooled url>" npm run db:push
DATABASE_URL="<your pooled url>" npm run seed
```

## Step 2 — fix the web project's root directory

Vercel dashboard → **smartwork360** → Settings → **Build & Deployment** →
**Root Directory** → `apps/web` → enable **"Include files outside of the Root
Directory"** (required, because `@smartwork/shared` lives in the workspace root).

Redeploy. This is the one step the CLI cannot do — `rootDirectory` is a project
setting, not a `vercel.json` key.

## Step 3 — point the web app at the API

Already set:

```
NEXT_PUBLIC_API_URL = https://smartwork360-api.vercel.app/api/v1
```

## Notes on running serverless

- **SLA scanning.** `node-cron` needs a process that stays alive, which serverless
  has not. `vercel.json` registers a Vercel Cron that calls
  `/api/v1/jobs/sla-scan` instead. Hobby plans allow one run per day, so it is set
  to 03:00; locally the in-process cron still runs every minute.
- **Rate limiting** is in-memory, so each function instance keeps its own counter.
  Fine for a demo; a real deployment needs Redis.
- **The AI service is not deployed.** It is optional by design — the API contains
  the same algorithms in TypeScript and falls back to them automatically.
- **`NODE_ENV=production` prunes devDependencies**, which removes `tsc` and
  `prisma` before the build can run. `installCommand` is therefore
  `npm install --include=dev`.

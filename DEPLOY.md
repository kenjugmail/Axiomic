# Deploying Axiomic

This is the single source of truth for getting Axiomic online. It
assumes **no prior deployment experience**. Read top to bottom once.

---

## 1. What you're deploying

Axiomic is **one Docker container** (see `Dockerfile`). That one
container serves both the API *and* the built website on a single
port. There is no separate frontend to deploy.

It is **stateful**: the database is a SQLite file and user uploads
are written to local disk. That means production needs a
**persistent disk** — without one, every redeploy wipes all users,
progress, and content.

Container startup (`scripts/entrypoint.sh`) automatically:
1. runs DB migrations (safe/idempotent every boot),
2. runs the seed **only if** `SEED_ON_BOOT=1`,
3. starts the server (binds to `$PORT`, which the host injects).

Health check path: **`/api/v1/ready`**.

---

## 2. The setup: two environments on Render

Industry standard is a **test (staging) environment** + a
**production environment** — same platform, two services. You never
test on production; you never hand-edit production.

| | Test / staging | Production |
|---|---|---|
| Render plan | **Free** | **Starter** (~$7/mo) |
| Persistent disk | none (data is *meant* to be disposable) | **yes**, mounted at `/data` |
| Tracks git branch | your working branch (or `main`) | **`main`** |
| `SEED_ON_BOOT` | `1` permanently (fresh content every deploy) | `1` on the **first deploy only**, then delete it |
| Cost | $0 | ~$7–8/mo (service + ~1 GB disk) |

Render Free sleeps and has an ephemeral filesystem — **useless for
production, perfect for a throwaway test env.** Total ≈ $7–8/mo.

---

## 3. One-time prep (do this first, locally)

Generate the two production secrets and keep them somewhere safe
(a password manager). **Never commit them.**

```bash
bash scripts/generate-signing-key.sh   # -> AXIOMIC_SIGNING_PRIVATE_KEY_HEX
openssl rand -hex 32                    # -> SESSION_SECRET
```

The signing key must stay the **same forever** (it signs
credentials/transcripts; changing it breaks verification).

Recommended: open a PR from your working branch into `main` on
GitHub and merge it, so production deploys from a clean `main`.
(You can instead point production at the branch — both work.)

Optional sanity check before deploying, with the prod vars exported:
```bash
NODE_ENV=production bash scripts/preflight.sh
```
It passes only when all required vars are set and the signing key
is valid.

---

## 4. Create the PRODUCTION service (Render)

1. render.com → **New → Web Service** → connect your GitHub repo →
   pick the **`main`** branch. Render detects the `Dockerfile`
   automatically (no build/start command needed).
2. Instance type: **Starter**.
3. **Add a disk**: in the service's **Disks** section (or
   *Advanced → Add Disk* on the create screen) — Name: `data`,
   **Mount path: `/data`**, Size: `1 GB`. This is the #1 step
   people miss; get the mount path exactly `/data`.
4. **Health Check Path**: set it to `/api/v1/ready`.
5. **Environment** tab → add the variables in the table below.
6. Create the service. Watch the logs for
   `[entrypoint] starting server...`.
7. **After the first successful boot**, go back to Environment and
   **delete `SEED_ON_BOOT`**, then trigger a redeploy. (Leaving it
   on re-seeds every restart.)

### Production environment variables

| Variable | Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | required |
| `DATABASE_URL` | `/data/axiomic.db` | **must be inside the `/data` disk** |
| `UPLOADS_STORAGE_PATH` | `/data/uploads` | uploads also live on the disk |
| `SESSION_SECRET` | *(your `openssl` value)* | required, secret |
| `AXIOMIC_SIGNING_PRIVATE_KEY_HEX` | *(your signing key)* | required, secret, **never changes** |
| `CORS_ORIGIN` | `https://<your-prod>.onrender.com` | your production URL (set after first deploy gives you the URL, then redeploy) |
| `BOOTSTRAP_ADMIN_USERNAME` | e.g. `yourname` | sign up with this username → you get admin |
| `SEED_ON_BOOT` | `1` | **first deploy only — then delete it** |

Do **not** set `DEV_AUTH_BYPASS` in production (preflight will
refuse it). `PORT` is injected by Render — don't set it.

Optional (safe to skip for launch):
- `AI_PROVIDER` (+ provider config) — real AI grading/tutor. Unset
  = the built-in heuristic grader (works offline, costs nothing).
- `RESEND_API_KEY` — sends real verification emails; unset = email
  is logged, not sent.
- `WEB_PUSH_VAPID_PUBLIC_KEY` / `..._PRIVATE_KEY` / `..._SUBJECT` —
  browser push notifications.
- `SENTRY_TRACES_SAMPLE_RATE` — error/perf monitoring.

---

## 5. Create the TEST service (Render)

1. **New → Web Service** → same repo → pick your **working
   branch** (so pushes auto-deploy here for testing).
2. Instance type: **Free**.
3. **No disk.**
4. Health Check Path: `/api/v1/ready`.
5. Environment variables:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `SESSION_SECRET` | any throwaway `openssl rand -hex 32` value |
| `AXIOMIC_SIGNING_PRIVATE_KEY_HEX` | a throwaway `scripts/generate-signing-key.sh` value |
| `CORS_ORIGIN` | `https://<your-test>.onrender.com` |
| `SEED_ON_BOOT` | `1` (leave it on — this env is disposable) |
| `BOOTSTRAP_ADMIN_USERNAME` | `admin` |

Leave `DATABASE_URL`/`UPLOADS_STORAGE_PATH` **unset** — they fall
back to ephemeral local paths, which is exactly what you want for a
disposable test env. It may cold-start after inactivity; fine for
testing.

---

## 6. The everyday workflow

```
push to your working branch
        │
        ▼
Render auto-deploys the TEST service  ──►  click around, verify:
        │                                  /api/v1/ready is OK,
        │                                  lessons/paths/exams render,
        │                                  new question types work
        ▼
open a PR → merge into main
        │
        ▼
Render auto-deploys PRODUCTION
```

You never run migrations or seed by hand — the container does
migrations on every boot, and seeding is controlled entirely by the
`SEED_ON_BOOT` variable.

---

## 7. First-launch checklist (production)

1. `https://<your-prod>.onrender.com/api/v1/ready` returns 200.
2. Open the site; sign up with `BOOTSTRAP_ADMIN_USERNAME` → confirm
   you have admin.
3. Spot-check: the ML Engineer path and SAT Prep path render;
   open one lesson; the SAT path ends in the timed-exam capstone.
4. Confirm `SEED_ON_BOOT` has been **removed** from production env.
5. **Soft launch:** invite a handful of users first, watch the
   logs/errors for a week, *then* share widely. (That cautious
   first phase is what "beta" means — it lives on production,
   labeled as early.)

---

## 8. Gotchas (read before you go live)

- **Disk mount path must equal the directory in `DATABASE_URL`**
  (`/data`). Wrong path → data silently lost on every redeploy.
- **Keep `SESSION_SECRET` and `AXIOMIC_SIGNING_PRIVATE_KEY_HEX`
  constant and secret.** Rotating the signing key invalidates
  every issued credential.
- **`SEED_ON_BOOT=1` on production is first-boot only.** Remove it
  or every restart re-runs the seed.
- Never set `DEV_AUTH_BYPASS=1` in production.
- Render injects `PORT`; the app already reads it. Don't hardcode.

---

## 9. When you outgrow this (later, not now)

This single-container + disk setup is a legitimate production
architecture at small/medium scale. Hardening steps, in order, when
you have real traffic/revenue:

1. **Litestream → S3-compatible backups** of the SQLite file
   (continuous backup + point-in-time restore). The standard way to
   make on-disk SQLite production-grade.
2. **Move uploads to object storage** (S3 / Cloudflare R2) so the
   container becomes stateless.
3. Only if you hit many concurrent writers / need multiple app
   instances: migrate the DB to **Turso** (SQLite-compatible, small
   code change) or **managed Postgres**.

None of this is needed for beta or early production.

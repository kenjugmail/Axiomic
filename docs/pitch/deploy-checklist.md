# Axiomic — Pitch Demo Deploy Checklist

Hand this to whoever is doing the actual deploy. The goal is one
stable demo URL that you can show on a phone in front of a college
administrator or investor without anything going sideways.

## 1. Pick a host

Single instance is fine — the demo path doesn't need multiple
workers. Recommended (free / cheap, persistent volumes built in):

- **Fly.io** — `fly launch`, one volume for `/data` (DB) and one for `/uploads`. Sleeps cleanly when idle.
- **Render** — web service + persistent disk. Slightly more expensive but zero-config TLS.

Either works. Pick one and commit.

## 2. Generate secrets

Run these locally; copy the output into your host's secret store.

```bash
# Signing key (ed25519). Keep the private hex private.
bash scripts/generate-signing-key.sh
# → outputs:
#   AXIOMIC_SIGNING_PRIVATE_KEY_HEX=<64-hex-bytes>
#   public:  <32-hex-bytes>   ← can be pinned out of band by evaluators

# Session secret (any 32+ bytes of randomness).
openssl rand -hex 32
```

## 3. Required environment variables

Set every line below. `preflight.sh` checks them.

| Key | Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | Triggers fail-fast env validation, secure cookies, prod logging. |
| `PORT` | `3000` | Or whatever your host binds. |
| `DATABASE_URL` | `/data/axiomic.db` | Persistent volume mount path. |
| `UPLOADS_STORAGE_PATH` | `/uploads` | Persistent volume mount path. |
| `CORS_ORIGIN` | `https://demo.axiomic.app` | Your real frontend URL(s); comma-separated for multiple. |
| `SESSION_SECRET` | 32+ random hex bytes | From `openssl rand -hex 32`. |
| `AXIOMIC_SIGNING_PRIVATE_KEY_HEX` | from step 2 | NEVER commit. |
| `AI_PROVIDER` | `mock` | Pitch demo uses canned AI responses — no external dependency. |
| `SERVER_EXEC_BACKEND` | `stub` | Code execution disabled. Do NOT set to `local` for public demos. |
| `CONTENT_APPROVAL_ENABLED` | `1` | Routes lesson/wiki edits through admin approval — a selling point for institutional buyers. |
| `DEV_AUTH_BYPASS` | unset | Must NOT be `1` in production. preflight rejects this. |
| `SENTRY_DSN` | your Sentry DSN | Optional but strongly recommended; "we monitor production" is the answer to a real question. |
| `SENTRY_ENVIRONMENT` | `demo` | So pitch errors don't pollute the real production project. |
| `SEED_ON_BOOT` | `1` (first boot only) | Populates the demo cohort + signed-capstone artifact. UNSET this after first boot. |

## 4. Deploy flow

1. **Build + push image** (or let the host build from the repo).
2. **Mount the two volumes** at `/data` and `/uploads`.
3. **Set the env vars above.** `SEED_ON_BOOT=1` for the first boot only.
4. **Validate the env BEFORE traffic** — exec into the running container:
   ```bash
   bash scripts/preflight.sh
   ```
   Exit 0 means OK. Any non-zero exit means at least one required var is missing or invalid; fix and redeploy.
5. **First boot**: the container's entrypoint runs `db:migrate` (always) + `db:seed` (because `SEED_ON_BOOT=1`). Watch logs for `Demo cohort seeded: …`. Then UNSET `SEED_ON_BOOT` so subsequent restarts don't re-seed.
6. **Verify health**: `curl https://<your-url>/api/v1/ready` should return 200 with `{ status: "ok", db: "ok", ai: "ok" }`.
7. **Walk the pitch path** (on mobile, in incognito):
   - `/` — homepage loads
   - `/demo/competency-loop` — five-step page loads
   - `/wiki/attention` — wiki page loads with tier switcher
   - `/verify?artifact=demo-student-6-clip-style-retriever` — auto-loads + shows "Signature valid" banner
   - `/classes/discover` — class directory shows "Intro to Machine Learning — Spring 2026"

## 5. Uptime monitoring

Free tier of either is fine:

- **UptimeRobot** — point a 5-minute interval monitor at `https://<your-url>/api/v1/ready`. Alert after 2 consecutive failures.
- **BetterStack** (Better Uptime) — same idea, slightly nicer UI.

Send alerts to your phone, not just email. A live demo failure during a pitch is the worst time to find out you were down for 20 minutes.

## 6. Fallback recording

Things break in front of investors. Have a backup.

1. Record a 90-second screen capture of the pitch path on the live demo URL (QuickTime on macOS, OBS anywhere).
2. Save to `docs/pitch/demo-fallback.mp4` locally. **Do not commit it** — it's already gitignored (or add `docs/pitch/*.mp4` to `.gitignore`).
3. Test that VLC and QuickTime both play it without re-downloading.
4. If the live demo dies, switch to the recording mid-sentence. Practice the switch once.

## 7. Live dry-run

Before the real pitch:

- Walk the demo path on a phone in front of one person who has never seen Axiomic.
- Time it. Cut anything that puts you over 5 minutes.
- Note where the listener got confused; fix the copy or skip the step.

## What can go wrong (and what you'd do)

| Symptom | Likely cause | Fast fix |
|---|---|---|
| `/api/v1/ready` returns 503, db=fail | Volume not mounted, or wrong `DATABASE_URL` path | Check volume mount; restart |
| Verify page shows "No completed capstone artifact" | Seed didn't run | Re-set `SEED_ON_BOOT=1`, restart, then unset |
| Cookies not persisting | `CORS_ORIGIN` mismatch with actual URL | Update env, restart |
| 500 errors at boot | Bad env (typo, wrong format) | `bash scripts/preflight.sh` |
| Slow page loads (>3s) | Cold start on the host's free tier | Set a 2-min uptime ping so the host doesn't sleep |

## What is NOT in scope for the pitch deploy

- Multi-region replication
- Horizontal scaling
- Public account signup gating (demo uses pre-seeded `demo-instructor` / `demo-student-*` accounts; password is `demo` for the demo accounts ONLY)
- Backup automation (the persistent volume is the backup; the seed is reproducible)
- HIPAA / FERPA compliance

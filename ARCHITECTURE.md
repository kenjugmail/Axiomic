# Axiomic — Architecture

Last refreshed: Sprint 107.

## System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│  Frontend  (apps/web)                                            │
│  Vite + React + TailwindCSS + lucide-react                       │
│  Pages: Wiki / Lessons / Forum / News / Research / Capstones /   │
│         Capstone tracks / Mastery paths / Profile / Cohorts /    │
│         Cohort invitations / Knowledge MRI / Weak Concepts /     │
│         Misconception marketplace / Verify / Argument map /      │
│         Capstone artifact / Capstone review queue / Onboarding / │
│         Home dashboard / Admin (proposals, error stats, mint-DOI)│
│  Cross-cutting: AISidebar (tutor modes), CodeCell (Python+JS),   │
│                 KernelFilesPanel, PrereqXray, ConceptCard,       │
│                 VerifiedBadge, PresenceChips, CiteDialog,        │
│                 EmptyState, GoalChip                             │
└─────────────────────┬─────────────────────────────────┬──────────┘
                      │ HTTP (REST + SSE)                │ WebSocket
                      │                                  │ /api/v1/ws
┌─────────────────────┴──────────────────────────────────┴──────────┐
│  Backend  (apps/server)                                           │
│  Bun + Hono                                                       │
│                                                                   │
│  Hono routers under /api/v1 :                                     │
│    auth · wiki · comments · ai · mastery · forum · notifications  │
│    search · settings · flashcards · achievements · activity       │
│    news · social · gamification · onboarding · uploads · concepts │
│    research · capstones · capstone-tracks · misconceptions        │
│    kernel-files · cohorts · cohort-invitations · mentors          │
│    server-exec · admin · me · users                               │
│                                                                   │
│  Cross-cutting libraries (apps/server/src/lib):                   │
│    envConfig · logger · errorSampler · liveBus (WebSocket fanout) │
│    signing (ed25519) · transcripts · citations · versionSnapshots │
│    userContext · misconceptionDetector · tutorModes · knowledgeMri│
│    crossLinks · searchIndex (with embedding cache) · jobs         │
│    notifications · achievements · approvals (admin gate)          │
│    serverExec (pluggable backend)                                 │
│                                                                   │
│  Provider abstraction (packages/ai):                              │
│    AIProvider → MockProvider | OllamaProvider                     │
└─────────────────────┬─────────────────────────────────────────────┘
                      │
┌─────────────────────┴─────────────────────────────────────────────┐
│  Database  (packages/db)                                          │
│  SQLite + drizzle-orm. 50+ migrations land 100+ tables.           │
└───────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│  Filesystem  ($UPLOADS_STORAGE_PATH or ./uploads)  │
│  Image / video / file uploads, served via          │
│  GET /api/v1/uploads/:id with mime + cache hdrs.   │
└────────────────────────────────────────────────────┘
```

## Surface map

Each surface lists its primary route + the routers that back it.

| Surface | Routes | Server router |
|---|---|---|
| **Wiki** | `/wiki`, `/wiki/:slug`, `/wiki/:slug/edit` | `wiki` |
| **Lessons** | `/paths/:p/lessons/:n` (+ `/edit`, `/analytics`) | `mastery` |
| **Mastery paths** | `/paths`, `/paths/:slug` | `mastery` |
| **Forum** | `/forum`, `/forum/t/:slug`, `/forum/graph` | `forum` |
| **News** | `/news`, `/news/:slug` | `news` |
| **Research papers** | `/research`, `/research/:slug`, `/research/:slug/v/:n` | `research` |
| **Capstones** | `/capstones`, `/capstones/:slug`, `/capstones/c/:slug`, `/capstones/review-queue` | `capstones` |
| **Capstone tracks** | `/tracks`, `/tracks/:slug`, `/tracks/c/:slug` | `capstoneTracks` |
| **Cohorts** | `/cohorts`, `/invitations/:token` | `cohorts`, `cohort-invitations`, `mentors` |
| **Knowledge MRI** | `/me/mri` | `me` |
| **Weak Concepts** | `/me/weak-concepts` | `me` |
| **Misconception marketplace** | `/misconceptions` | `misconceptions` |
| **Verify** | `/verify` | `/keys/verify` |
| **Onboarding** | `/onboarding` | `onboarding` |
| **Home dashboard** | `/` (signed in) | `me` + cross-router rollups |
| **Admin** | `/admin/proposals`, `/admin/errors`, `/admin/reindex`, `/admin/mint-doi` | `admin` |
| **AI Sidebar** | (overlay on wiki / lesson / research / capstone / forum / news pages) | `ai` |

Wiki is tiered (intro / undergrad / grad), versioned, with AI-helper authoring; Concept Cards (S17), prereq X-ray (S31), and the argument-map link (S36) live alongside the body. Lessons drive mastery_nodes; question slides include MCQ + explain-it-back (S30c). Real-time draft awareness (S40) lives on the lesson editor. Capstones produce a public artifact page on completion with an ed25519-signed transcript (S37) and folded-in peer review counts (S39). Knowledge MRI is the single concept-level diagnostic dashboard, with the misconception marketplace (S38) and tutor modes (S30) feeding into it.

## Cross-cutting systems

### Authentication + sessions
Cookie-based sessions (`axiomic_session`). `requireAuth` middleware in `apps/server/src/middleware/auth.ts`. `DEV_AUTH_BYPASS` short-circuits to a configured user for local demos; disabled in production regardless.

### AI provider abstraction (`packages/ai`)
`getAIProvider()` returns `MockProvider` (canned responses, no API keys) or `OllamaProvider` (local LLM) based on `AI_PROVIDER` env var. Mock responses live in `seed-content/ai-responses/`.

### Knowledge MRI + weak-concept coaching (S29 / S33)
- `lib/misconceptionDetector.ts` walks recent quiz_mistakes, matches `misconception_catalog` by concept-slug overlap, and upserts diagnoses.
- `lib/knowledgeMri.ts` aggregates `mastery_paths`, `mastery_nodes`, `user_progress`, `misconception_diagnoses`, `quiz_mistakes`, `flashcard_reviews` into a single per-user diagnostic snapshot.
- Misconception marketplace (S38) lets the community submit + vote on new entries; +5 net votes auto-promote into the catalog.

### AI tutor modes (S30 / S32)
`lib/tutorModes.ts` holds five system-prompt builders (socratic / misconception / bridge / debate / contribution). `AISidebar` auto-selects the appropriate mode from page context (e.g. misconception when an active diagnosis matches the page).

### Citation export (S34) + DOI permalinks
`lib/citations.ts` formats research papers + capstones to BibTeX, RIS, and APA-ish plain text. `/cite/p/<author>/<slug>` and `/cite/c/<author>/<slug>` are stable permalinks bouncing to canonical pages.

### Signed transcripts (S37)
`lib/signing.ts` holds an ed25519 keypair (or generates ephemeral if `AXIOMIC_SIGNING_PRIVATE_KEY_HEX` is unset — production REQUIRES it). `lib/transcripts.ts` builds canonical-JSON manifests for completed capstones; the bundle includes the manifest + signature + public key. `/keys/verify` accepts a posted bundle for offline verification.

### Versioned papers + capstones (S35)
Every published edit snapshots into `research_paper_versions` / `capstone_versions`. `/research/:slug/versions` shows history; `/research/:slug/v/:n` renders a frozen snapshot.

### Argument map (S36)
`/forum/graph?slug=` renders any forum thread's parent-child tree as an SVG DAG using a hand-rolled tidy-tree layout (no D3 dep).

### Real-time draft collaboration (S40)
WebSocket server at `/api/v1/ws`. Clients send `subscribe_draft` frames; the server fans out `draft_update` / `draft_published` / `draft_presence` events. The lesson editor surfaces presence chips + a "pull changes" toast on conflict.

### Multi-language code cells (S41) + kernel files (S42)
`:::code[python]` cells run in Pyodide; `:::code[js]` cells run in a sandboxed JS kernel. Mounted files (uploaded via `KernelFilesPanel`) appear at `/files/<name>` for Python and `axiomicFiles['<name>']` for JS.

### Server-side execution (S44, S46)
`POST /api/v1/server-exec/runs` submits to the configured backend (`stub` or `local`). Local-process backend uses `Bun.spawn` with timeout + output caps. Sandboxed isolation (Docker/gVisor/firejail) is a planned follow-up; the current local backend is for trusted-user deploys only.

### Knowledge Navigator + prereq X-ray (S31)
`/search?navigator=1` regroups results by intent (define / practice / discuss / read / build). `PrereqXray` surfaces on Wiki, Research, Capstone, and Lesson editor preview.

### Capstone tracks (S52a)
A "track" bundles 4-6 capstones into a single learning credential (e.g., the seeded `ml-engineer-track` chains transformer-from-scratch → fine-tuning-and-lora → training-stability-at-scale → inference-optimization). `capstone_tracks`, `capstone_track_capstones`, and `capstone_track_completions` back the surface; `/tracks/c/:slug` is the public artifact page with a folded ed25519-signed manifest. Optional capstones (e.g., the rag pipeline) count toward an opt-in "extra-credit" axis.

### Cohort invitations (S52b)
`cohort_invitations` table holds email-keyed invites with token, status, expiry. Organizer dashboard (`CohortPage`) batches invite generation; URLs are surfaced for copy-paste (no SMTP integration yet). `/invitations/:token` is the public accept surface; pending invitees get a notification + a banner on the home dashboard.

### Admin gate (S52c)
A `users.role` enum (`member` | `admin`) plus a `content_proposals` table gate lesson publishing, news article creation/edits, and wiki body edits. Bootstrap admin is seeded from `BOOTSTRAP_ADMIN_USERNAME` on cold boot. `/admin/proposals` queues pending submissions with side-by-side diffs; approve/reject dispatches to per-kind apply functions in `lib/approvals.ts`. Wiki edits apply immediately (with a "pending review" badge) and revert from `priorSnapshot` on reject; lesson + news submissions stay private until approval.

### Production hardening (S53)
`lib/envConfig.ts` is the typed gateway for every env-var read; `lib/logger.ts` emits one JSON line per event with a `kind` discriminator; `lib/errorSampler.ts` keeps an in-memory ring buffer for `/admin/errors`; `scripts/preflight.sh` validates production env before deploy (signing key, session secret, CORS origin). The signing-key invariant is enforced at boot in `NODE_ENV=production` — server fails fast if `AXIOMIC_SIGNING_PRIVATE_KEY_HEX` is unset.

### DOI minting + onboarding goals (S54)
- DOI: `research_papers`, `capstones`, `capstone_tracks`, and `capstone_enrollments` carry optional `doi`, `citationCount`, `lastCitedAt` columns. `POST /admin/mint-doi` issues a synthetic `10.5555/axiomic.<kind>.<hash>` (real Crossref integration is the planned follow-up); CiteDialog + `/cite/...` permalinks include the DOI when minted.
- Onboarding goals: `users.onboardingGoal` enum (`complete_track | finish_path | publish_paper | join_cohort | ship_misconception`) is set during the wizard. `GoalChip` on the home dashboard surfaces the goal + a context-aware CTA. From S63: also threaded through `buildCoachContext` → `summarizeCoachContext` → AI tutor system prompts so the tutor can steer toward the goal.

### AI tutor model selection (S63)
`/api/v1/ai/models` returns the available models for the configured provider (`OllamaProvider.listModels()` queries `/api/tags`; `MockProvider` returns sentinel names). The `/ai/chat` request schema accepts an optional `model` field; `AIProvider.stream({ ..., model })` honors it per-request. The `AIModelPicker` chip in the sidebar persists the selection in localStorage. `AI_AVAILABLE_MODELS` env var lets ops override the picker's options when introspection isn't available.

## Schema map

The current schema (60+ tables across 35 migrations) groups roughly:

- **Auth + identity** — `users` (with `role` enum + `onboardingGoal`), `sessions`, `user_follows`, `user_achievements`, `notifications`, `activity_events`.
- **Wiki** — `wiki_pages`, `page_versions`, `comments`, `comment_edits`, `votes`.
- **Mastery + lessons** — `mastery_paths`, `mastery_nodes`, `lesson_versions`, `lesson_edit_reports`, `user_progress`, `lesson_progress`, `lesson_notes`, `lesson_slide_events`, `quiz_mistakes`, `flashcards`, `flashcard_reviews`.
- **Forum** — `domains`, `forum_topics`, `forum_posts`, `forum_post_edits`, `forum_votes`, `forum_reactions`, `forum_bookmarks`, `forum_polls`, `forum_poll_options`, `forum_poll_votes`.
- **News** — `news_articles`, `news_edit_proposals`, `news_reactions`, `news_comments`, `news_bookmarks`, `claim_threads`, `runnable_artifacts`, `reproductions`.
- **Research** — `research_papers` (with optional `doi`/`citationCount`/`lastCitedAt`), `research_paper_versions`.
- **Capstones** — `capstones` (DOI-extended), `capstone_versions`, `capstone_milestones`, `capstone_enrollments` (DOI-extended), `capstone_submissions`, `capstone_peer_reviews`.
- **Capstone tracks** — `capstone_tracks` (DOI-extended), `capstone_track_capstones`, `capstone_track_completions`.
- **Misconception coaching** — `misconception_catalog`, `misconception_diagnoses`, `misconception_submissions`, `misconception_submission_votes`.
- **Cohorts + mentorship** — `cohorts`, `cohort_members`, `cohort_invitations`, `mentor_relationships`.
- **Admin gate** — `content_proposals`.
- **Code cells** — `kernel_files`, `server_runs`.
- **Other** — `attachments`, `cached_embeddings`, `daily_challenges`, `daily_challenge_attempts`.

The platform now seeds **12 mastery paths** (ml-engineer, ai-researcher, mathematician, physicist, systems-engineer, reinforcement-learner, multimodal-engineer, comp-biologist, applied-statistician, causal-scientist, roboticist, quantum-engineer), 16 capstones, 78+ misconception-catalog entries, 14+ research papers; `seed-content/` is the source of truth.

See `packages/db/src/schema.ts` for the full source of truth.

## Configuration

All server-side env reads are centralized in `apps/server/src/lib/envConfig.ts`. See `.env.example` for the full list. Notable values:

**Required in production**:
- `CORS_ORIGIN` — comma-separated allowed origins.
- `SESSION_SECRET` — strong random session signer.
- `AXIOMIC_SIGNING_PRIVATE_KEY_HEX` — 32-byte hex seed for transcript signing. Generate via `bash scripts/generate-signing-key.sh`. Server fails fast at boot if unset under `NODE_ENV=production`.

**Optional but production-relevant**:
- `BOOTSTRAP_ADMIN_USERNAME` — seeded as the first admin on cold boot if no admin exists.
- `LOG_LEVEL` — controls `lib/logger.ts` verbosity (`debug` / `info` / `warn` / `error`).
- `ERROR_LOG_DESTINATION` — `memory` / `stdout` / `both` (default `both`); when including `stdout`, sampled errors emit a JSON line per occurrence for external aggregators.
- `ERROR_SAMPLER_BUFFER_SIZE` — number of recent errors to keep in memory (default 200).
- `AI_PROVIDER` — `mock` (default; canned responses, no API keys) or `ollama` (with `OLLAMA_HOST` + `OLLAMA_CHAT_MODEL` + `OLLAMA_EMBED_MODEL`).
- `AI_AVAILABLE_MODELS` — comma-separated; overrides what the AIModelPicker offers when the provider can't introspect.
- `SERVER_EXEC_BACKEND` — `stub` (default) or `local` (Bun.spawn-based local-process execution). Set only after auditing the risk surface.
- `UPLOADS_STORAGE_PATH` — persistent volume path for uploaded media (defaults to `./uploads`).
- `DEV_AUTH_BYPASS` — short-circuits authentication for local demos; the server warns loudly if this is set under `NODE_ENV=production`.

## Testing

- **Server (`apps/server`)** — `bun:test`. 700+ tests covering routes + libs. A small number of full-suite flakes have been observed (recommendation ranker, research feed, gamification shop) that pass on isolated reruns with a fresh seeded DB — likely shared global state (search-index cache, seeded gamification rows). `bun run --filter @axiomic/server test`.
- **Web (`apps/web`)** — `vitest`. Tests cover markdown rendering, theme, JS kernel, viz components, ConceptCard, MarkdownRenderer directives. `bun run --filter @axiomic/web test`.
- **End-to-end (`tests/e2e`)** — Playwright. Specs cover auth, core flow, lessons, lesson authoring, onboarding, theme, XSS protection, research publish, capstone transcript flow, misconception marketplace, cohort invite, verify, argument map. `bun run --filter @axiomic/web test:e2e`.
- **CI** — `.github/workflows/ci.yml` runs typecheck → migrate → seed → unit → build → e2e.

## Local quick-start

```bash
bun install
bun run --filter @axiomic/db migrate
bun run --filter @axiomic/db seed
bun run dev
```

Then browse to `http://localhost:5173`. Sign up a fresh user; everything in the surface map is reachable. The mock AI provider returns canned responses with no API keys.

## Deployment checklist

1. Set `NODE_ENV=production`.
2. Set `CORS_ORIGIN` to your frontend URL(s).
3. Generate + pin `AXIOMIC_SIGNING_PRIVATE_KEY_HEX` (`bash scripts/generate-signing-key.sh`). Required.
4. Set `SESSION_SECRET` to a strong random value. Required.
5. Set `DATABASE_URL` to a persistent path; `UPLOADS_STORAGE_PATH` to a persistent volume.
6. Choose `AI_PROVIDER`: `mock` for demos, `ollama` (with `OLLAMA_*` vars) for self-hosted LLM. Optional: set `AI_AVAILABLE_MODELS` to curate the picker.
7. Leave `SERVER_EXEC_BACKEND=stub` unless you've audited the local-process backend's risk surface.
8. Optional: set `BOOTSTRAP_ADMIN_USERNAME` to seed the first admin on cold boot (the admin gate stays inert otherwise).
9. Set `LOG_LEVEL` (typically `info` in prod) and — if shipping logs to an aggregator — `ERROR_LOG_DESTINATION=stdout` (default `both` keeps `/admin/errors` populated). Tune `ERROR_SAMPLER_BUFFER_SIZE` if the dashboard needs more/less recent history.
10. Confirm `DEV_AUTH_BYPASS` is unset (the server warns loudly on production boot if any required values are missing).
11. Run `bash scripts/preflight.sh` from the deploy environment — validates the signing key + checks all required env vars before the server boots.

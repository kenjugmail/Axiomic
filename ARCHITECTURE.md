# Axiomic — Architecture

Last refreshed: Sprint 45.

## System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│  Frontend  (apps/web)                                            │
│  Vite + React + TailwindCSS + lucide-react                       │
│  Pages: Wiki / Lessons / Forum / News / Research / Capstones /   │
│         Mastery paths / Profile / Cohorts / Knowledge MRI /      │
│         Weak Concepts / Misconception marketplace / Verify /     │
│         Argument map / Capstone artifact / Capstone review queue │
│  Cross-cutting: AISidebar (tutor modes), CodeCell (Python+JS),   │
│                 KernelFilesPanel, PrereqXray, ConceptCard,       │
│                 VerifiedBadge, PresenceChips, CiteDialog         │
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
│    research · capstones · misconceptions · kernel-files           │
│    cohorts · mentors · server-exec · me · users                   │
│                                                                   │
│  Cross-cutting libraries (apps/server/src/lib):                   │
│    envConfig · liveBus (WebSocket fanout) · signing (ed25519)     │
│    transcripts · citations · versionSnapshots · userContext       │
│    misconceptionDetector · tutorModes · knowledgeMri · crossLinks │
│    searchIndex (with embedding cache) · jobs · notifications      │
│    achievements · serverExec (pluggable backend)                  │
│                                                                   │
│  Provider abstraction (packages/ai):                              │
│    AIProvider → MockProvider | OllamaProvider                     │
└─────────────────────┬─────────────────────────────────────────────┘
                      │
┌─────────────────────┴─────────────────────────────────────────────┐
│  Database  (packages/db)                                          │
│  SQLite + drizzle-orm. 30+ migrations land 60+ tables.            │
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
| **Cohorts** | `/cohorts` | `cohorts`, `mentors` |
| **Knowledge MRI** | `/me/mri` | `me` |
| **Weak Concepts** | `/me/weak-concepts` | `me` |
| **Misconception marketplace** | `/misconceptions` | `misconceptions` |
| **Verify** | `/verify` | `/keys/verify` |
| **AI Sidebar** | (overlay on wiki / lesson pages) | `ai` |

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

## Schema map

The current schema (60+ tables across 30+ migrations) groups roughly:

- **Auth + identity** — `users`, `sessions`, `user_follows`, `user_achievements`, `notifications`, `activity_events`.
- **Wiki** — `wiki_pages`, `page_versions`, `comments`, `comment_edits`, `votes`.
- **Mastery + lessons** — `mastery_paths`, `mastery_nodes`, `lesson_versions`, `lesson_edit_reports`, `user_progress`, `lesson_progress`, `lesson_notes`, `lesson_slide_events`, `quiz_mistakes`, `flashcards`, `flashcard_reviews`.
- **Forum** — `domains`, `forum_topics`, `forum_posts`, `forum_post_edits`, `forum_votes`, `forum_reactions`, `forum_bookmarks`, `forum_polls`, `forum_poll_options`, `forum_poll_votes`.
- **News** — `news_articles`, `news_edit_proposals`, `news_reactions`, `news_comments`, `news_bookmarks`, `claim_threads`, `runnable_artifacts`, `reproductions`.
- **Research** — `research_papers`, `research_paper_versions`.
- **Capstones** — `capstones`, `capstone_versions`, `capstone_milestones`, `capstone_enrollments`, `capstone_submissions`, `capstone_peer_reviews`.
- **Misconception coaching** — `misconception_catalog`, `misconception_diagnoses`, `misconception_submissions`, `misconception_submission_votes`.
- **Cohorts + mentorship** — `cohorts`, `cohort_members`, `mentor_relationships`.
- **Code cells** — `kernel_files`, `server_runs`.
- **Other** — `attachments`, `cached_embeddings`, `daily_challenges`, `daily_challenge_attempts`.

See `packages/db/src/schema.ts` for the full source of truth.

## Configuration

All server-side env reads are centralized in `apps/server/src/lib/envConfig.ts`. See `.env.example` for the full list. Notable required-in-prod values:

- `CORS_ORIGIN` — comma-separated allowed origins.
- `SESSION_SECRET` — strong random session signer.
- `AXIOMIC_SIGNING_PRIVATE_KEY_HEX` — 32-byte hex seed for transcript signing. Generate via `bash scripts/generate-signing-key.sh`.

## Testing

- **Server (`apps/server`)** — `bun:test`. 320+ tests covering routes + libs. `bun run --filter @axiomic/server test`.
- **Web (`apps/web`)** — `vitest`. 28 tests covering markdown / theme / JS kernel. `bun run --filter @axiomic/web test`.
- **End-to-end (`tests/e2e`)** — Playwright. Specs cover auth, core flow, lessons, lesson authoring, onboarding, theme, XSS protection. `bun run --filter @axiomic/web test:e2e`.
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
3. Generate + pin `AXIOMIC_SIGNING_PRIVATE_KEY_HEX` (`bash scripts/generate-signing-key.sh`).
4. Set `SESSION_SECRET` to a strong random value.
5. Set `DATABASE_URL` to a persistent path; `UPLOADS_STORAGE_PATH` to a persistent volume.
6. Choose `AI_PROVIDER`: `mock` for demos, `ollama` (with `OLLAMA_*` vars) for self-hosted LLM.
7. Leave `SERVER_EXEC_BACKEND=stub` unless you've audited the local-process backend's risk surface.
8. Confirm `DEV_AUTH_BYPASS` is unset (the server warns loudly on production boot if any of the above are missing).

# Full Prototype Build — Autonomous 5-Hour Session

You are building a complete working prototype of **Axiomic**, the project described in VISION.md. This is a long autonomous session — multiple hours. Your goal is to produce the most complete, polished, deeply-built prototype possible in this session.

This is NOT a minimal V0. This is a thorough build. Use the full session. Use deep thinking liberally. Don't stop early.

**The prototype must work without any paid API access.** AI features use a mock provider by default and an optional Ollama provider — see the AI provider strategy section in VISION.md.

## What "complete prototype" means here

A locally runnable monorepo with:

### Wiki (the deep core)
- 30+ wiki pages on transformer-related topics — written in real markdown with real LaTeX, not placeholder
- Tiered explanations on every page (intro / undergrad / grad), with content that actually changes meaningfully between tiers
- KaTeX rendering for math, syntax highlighting for code blocks
- Page navigation, search by title and content, related-pages sidebar
- Per-page version history (every save is a new version)
- Markdown editor for creating and editing pages with live preview
- Image and embedded-visualization support
- Internal wiki links between pages with auto-detection of broken links
- Table of contents auto-generated from headings, sticky on scroll

### Visualizations (the differentiator)
- A reusable visualization framework in `packages/viz` with React components for D3 and Three.js scenes
- 8+ genuinely interactive visualizations embedded in wiki pages, including:
  - Attention weight heatmap (interactive: hover tokens, see attention weights)
  - Embedding space explorer (3D scatter of word embeddings, rotatable, hoverable)
  - Position encoding visualization (sliders to adjust dimensions and positions)
  - Layer-by-layer activation viewer (slider through layers, see how representations change)
  - Softmax temperature explorer (slider, see distribution shift)
  - Beam search tree (interactive tree visualization)
  - Tokenizer playground (type text, see BPE/WordPiece breakdown)
  - Self-attention QKV computation step-through (animated, controllable speed)
- All visualizations responsive on mobile and desktop
- All visualizations support light and dark themes

### AI integration (the magic — built behind a provider abstraction)

**Architecture: clean provider abstraction in `packages/ai`.**

The frontend has no idea which AI provider is running. It calls the same API regardless. Behind that API, an `AIProvider` interface has multiple implementations (see VISION.md for the full strategy):

- **MockProvider** (default, always works, no setup needed)
- **OllamaProvider** (optional, used when `AI_PROVIDER=ollama` env var is set)
- (AnthropicProvider stubbed for future)

For the MockProvider:
- For each of the 30+ seeded wiki pages, write 5–10 canned response templates in `seed-content/ai-responses/<page-slug>.json` covering common questions (e.g., "explain this section," "give me a simpler explanation," "quiz me on this," "what are the prerequisites")
- Plus a generic fallback that uses page content keywords
- All responses stream character-by-character with 15–25ms per character to feel real
- Mock embeddings are deterministic — hash-based 384-dim vectors with cosine similarity that's at least directionally meaningful for related pages

For the OllamaProvider:
- Connect to `http://localhost:11434` by default (configurable)
- Use `llama3.1:8b` for chat, `nomic-embed-text` for embeddings (configurable)
- Real streaming via Ollama's `/api/chat` endpoint
- Graceful fallback to MockProvider if Ollama isn't reachable

The user-facing AI features:
- **Sidebar AI companion** that knows the current page content, knows the tier, streams responses, can answer questions / generate practice problems / quiz the user / explain at different levels, cites which part of the page it's drawing from, has conversation memory within a session
- **"Rewrite at different level"** — highlight a paragraph, AI rewrites it at intro/undergrad/grad level
- **"Find related pages"** — semantic search using embeddings of page content
- **"Spaced repetition card generator"** — creates flashcards from a page
- **"Summarize discussion"** — AI-generated summary of comment threads

All of these features must be fully functional with the MockProvider. They get smarter when Ollama is wired up, but they must demo well *without* it.

### Forum / Comments (basic but real)
- Threaded comments per wiki page
- Markdown rendering in comments with LaTeX support
- Upvote/downvote on comments
- Sort by top, new, controversial
- User mentions with @username notification
- Comment editing with edit history shown

### Mastery Path (preview)
- One mastery path: "ML Engineer" with at least 20 nodes from absolute basics through transformer architecture
- Each node references one or more wiki pages
- Visual graph of the mastery path (DAG, nodes show prerequisite links)
- User progress tracking: mark nodes complete, see overall progress
- Mastery checks: short quizzes for each node, generated by the AI provider (works with the MockProvider via canned quizzes per node, smarter with Ollama)
- Visible level progression UI (Apprentice → Practitioner → Specialist → Expert → Researcher)

### Auth and user accounts
- Sign up with email + password (hashed with argon2 or bcrypt)
- Login, logout, session cookies
- User profile page showing: contributions (page edits, comments), mastery path progress
- Username uniqueness, email verification stubbed (noop for prototype)

### Frontend polish
- Beautiful homepage that explains Axiomic with real visual interest
- Topic browser page (browse all wiki pages by category)
- Mastery path browser page
- Light/dark mode toggle, system theme detection
- Responsive design that works on mobile (375px wide and up)
- Loading states, empty states, error states all handled
- Keyboard shortcuts: `/` to focus search, `g h` for home, `g w` for wiki, `?` for shortcut help
- Beautiful typography: serif for body text on wiki pages, sans for UI, monospace for code
- Custom 404 page
- Site-wide search with keyboard navigation in results

### Backend completeness
- All endpoints versioned under `/api/v1`
- Type-safe client between frontend and backend (use Hono's RPC mode or zod schemas shared)
- Rate limiting on AI endpoints (even mock ones, to enforce realistic patterns)
- Structured logging (use `pino`)
- Health and readiness endpoints
- Migrations checked in, runnable from `bun run db:migrate`
- Seed script that loads the 30+ wiki pages from `seed-content/` markdown files

### Testing
- Unit tests for all non-trivial backend logic (auth, page versioning, mastery progress, AI provider abstraction)
- Integration tests for the API
- At least 5 Playwright e2e tests covering core flows: sign up → log in → read a page → use AI sidebar → leave a comment → mark mastery node complete

### Operations
- README.md with full setup instructions, including how to optionally enable Ollama
- ARCHITECTURE.md describing how the pieces fit together
- A `bun run setup` script that does everything to get a new dev started
- `.env.example` with all configurable env vars documented
- Dockerfile for the server (even if not used in prototype)

This is a lot. That's the point. You have many hours. Use them.

## Your operating procedure

### Step 1: Plan deeply

Before writing any code, write `PROTOTYPE_PLAN.md` with:
- Directory structure you'll create
- Order of work (what to build first, second, etc.) — group into milestones M1–M10
- Specific tradeoffs you're making
- What you'll skip or stub
- Estimated time per milestone

Use deep thinking. Don't rush this step.

### Step 2: Build in milestones

Build in this rough order. Commit after every meaningful change. Aim for 50+ commits over the session.

**Milestone 1 — Foundation (target: first 30 min)**
- Monorepo scaffold: workspace package.json, tsconfig, .gitignore
- apps/server: Bun + Hono with /health endpoint
- apps/web: Vite + React + Tailwind + shadcn/ui setup
- packages/db: Drizzle + SQLite, basic schema for users and pages
- README.md skeleton

**Milestone 2 — Core data layer**
- Full Drizzle schema: users, sessions, wiki_pages, page_versions, comments, votes, mastery_paths, mastery_nodes, user_progress, ai_responses
- Migrations
- Seed script infrastructure

**Milestone 3 — Auth**
- Lucia-style auth or session cookies
- Sign up, log in, log out endpoints
- Frontend auth pages with shadcn forms
- Protected routes

**Milestone 4 — Wiki engine**
- Wiki page rendering with markdown + KaTeX + code highlighting
- Tier switcher
- Page editor with live preview
- Page versioning
- Internal links, broken link detection
- Auto-generated table of contents

**Milestone 5 — Seed content**
- Write 30+ real wiki pages on transformers in `seed-content/`
- Topics: tokens, embeddings, positional encoding, attention, self-attention, multi-head attention, FFN, layer norm, residual connections, transformer block, encoder vs decoder, masked self-attention, cross-attention, training objectives, BPE tokenization, sampling, temperature, top-k/top-p, beam search, KV cache, scaling laws, RoPE, GQA, SwiGLU, RLHF, mechanistic interpretability, induction heads, superposition, fine-tuning, LoRA, RAG
- Each page has intro/undergrad/grad tiers with substantive differences
- Real LaTeX equations
- Code examples in PyTorch where appropriate
- Cross-references between pages

**Milestone 6 — Visualizations**
- packages/viz framework: BaseViz component, theme support, responsive container
- Build all 8 visualizations listed above
- Embed them into the appropriate seed pages

**Milestone 7 — AI provider abstraction**
- packages/ai: AIProvider interface, MockProvider (full implementation), OllamaProvider (full implementation), factory based on AI_PROVIDER env var
- Mock canned responses for all 30+ seed pages in `seed-content/ai-responses/`
- Streaming infrastructure (server-sent events on the backend, EventSource on the frontend)
- Sidebar AI companion UI
- "Rewrite at level" feature
- Related pages semantic search (mock embeddings + cosine similarity)
- Spaced repetition card generator
- Discussion summarizer

**Milestone 8 — Comments and forum basics**
- Comment data model and threading
- Comment UI with markdown rendering
- Voting
- Sort options
- User mentions

**Milestone 9 — Mastery paths**
- Mastery path data model
- ML Engineer path with 20+ nodes
- DAG visualization
- Progress tracking
- Mastery check quizzes (canned per-node for MockProvider, AI-generated for OllamaProvider)
- Level progression UI

**Milestone 10 — Polish and testing**
- Homepage redesign
- Topic browser
- Mastery path browser
- Dark mode
- Keyboard shortcuts
- Loading/empty/error states everywhere
- 404 page
- Search functionality
- Profile pages
- Unit tests
- Integration tests
- Playwright e2e tests
- ARCHITECTURE.md
- Dockerfile
- Setup script

### Step 3: Don't stop early

You will be tempted to declare done at multiple points. **Don't.** This is a long session. If you finish the milestone you're on:

1. Re-read VISION.md and the spec above
2. Pick the most underbuilt area
3. Make it deeper, more polished, more complete
4. Add tests
5. Add documentation
6. Add edge cases
7. Improve UI polish
8. Add more seed content

Specific things to expand into if you finish early:
- More wiki pages (push toward 50)
- More visualizations (push toward 12)
- More mastery path content
- A second mastery path on a different topic
- Deeper testing
- Performance: lazy-load visualizations, paginate comments, add caching
- Accessibility: ARIA labels, keyboard nav, screen reader support
- More polish: micro-animations, better empty states, illustrative SVGs on the homepage
- More canned MockProvider responses for richer demo experience

The goal is a prototype someone could see running and immediately understand the vision. More content, more polish, more tests, more depth.

### Step 4: Verify continuously

After each milestone, run the app and check that things work. The agent will be tempted to write code that compiles but doesn't run. Don't be that agent. Run the dev server, hit endpoints, click around in the UI. Fix what's broken before moving on.

Specifically verify:
- The dev server starts cleanly with `bun run dev` from the root
- The MockProvider works without any external setup
- A user can sign up, log in, read a page, use the AI sidebar, leave a comment, mark a mastery node complete

### Step 5: Document as you go

Update `PROTOTYPE_NOTES.md` after each milestone with:
- What's done in this milestone
- What's stubbed or fake (especially: which AI features are mocked vs real-when-Ollama-is-running)
- Known issues
- Decisions made and why

In the morning the humans will read this first.

## Hard rules

1. **No paid API dependencies.** The prototype must run without any API key. Anthropic API, OpenAI API, etc. are all forbidden in the prototype. Local Ollama is allowed but must be optional.
2. **Real content, not lorem ipsum.** Every wiki page must teach something. Every visualization must do something.
3. **The AI sidebar UX must feel real** even with the MockProvider. Streaming, contextual responses, conversation history. A casual demo must look indistinguishable from a real LLM-backed experience.
4. **Visualizations must be genuinely interactive** — respond to clicks, drags, sliders, hovers.
5. **Commit very frequently.** Aim for 50+ commits over the session. Each commit message should be descriptive.
6. **Don't push to remote.** Commit locally only.
7. **Use deep thinking liberally** when making architecture decisions, content choices, UI design.
8. **Don't skip testing.** Tests are part of "complete," not optional.
9. **If you genuinely cannot make progress on a feature**, stub it cleanly with a TODO and move on.
10. **Don't break the working app.** Each commit should leave the app runnable.
11. **Don't add huge external dependencies** without thinking. Prefer the stack in VISION.md.

## Specific things to do well

### Wiki content quality
The 30+ wiki pages are the most important deliverable. They have to be real. For each page:
- Intro tier: explain like to a smart high schooler, no math, plain English, intuition first
- Undergrad tier: full mathematical treatment, expects linear algebra and calculus
- Grad tier: connections to current research, edge cases, recent papers cited
- All tiers cover the same conceptual ground but at different depths

Take time on these. They're the substance of the prototype.

### MockProvider response quality
The mock AI responses determine how impressive the demo feels. For each page, the canned responses should:
- Be substantive (3–6 paragraphs each, not one-liners)
- Reference actual content from the page they're attached to
- Adjust their language to the user's tier (intro / undergrad / grad)
- Include some mathematical detail where appropriate
- Feel like a knowledgeable tutor, not a generic chatbot

Don't half-ass these. They're the difference between "huh, this is a cool prototype" and "wait, this thing actually works?"

### Visualization craft
The 8+ visualizations are the second most important deliverable. They should:
- Have clean, minimal UI (no toolbar clutter)
- Use color thoughtfully (D3's `interpolatePuOr`, `viridis`, etc.)
- Animate transitions smoothly
- Have a "reset" button
- Show their parameters as live-updating labels
- Look like Distill.pub quality, not toy demos

### UI polish
This is a project for intellectually serious people. The UI should feel that way:
- Generous whitespace
- Beautiful typography (use Inter for UI, EB Garamond or Source Serif for wiki body, JetBrains Mono for code)
- Subtle, never garish
- No unnecessary animations
- Dark mode that's actually well-designed, not just inverted

## What done looks like

When you finish:
- A monorepo with everything listed above actually working
- 30+ wiki pages with real content
- 8+ working interactive visualizations
- AI sidebar streaming canned-but-realistic responses (works without any setup)
- OllamaProvider implemented for users who want real LLM responses
- Comments, mastery paths, auth, all functional
- 50+ commits with clear history
- README.md, ARCHITECTURE.md, PROTOTYPE_NOTES.md all written
- App that the founders can clone, run with `bun install && bun run dev`, and demo to friends in the morning — with zero API keys configured

If you complete all of this and still have time: keep building. Add more pages, more visualizations, more polish.

Now begin. Start by reading VISION.md, then write PROTOTYPE_PLAN.md. Use deep thinking on the plan. Take your time.

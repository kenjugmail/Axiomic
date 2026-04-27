# Prototype Notes

## Current Status

Working prototype with all core features functional.

## What's Working

### Wiki (37 pages)
- 37 real wiki pages covering tokens through mechanistic interpretability
- 9 categories: fundamentals, attention, architecture, training, decoding, efficiency, alignment, interpretability, applications
- Three explanation tiers per page (intro/undergrad/grad) with substantive differences
- KaTeX math rendering, syntax-highlighted code blocks
- 8 interactive visualizations embedded in relevant pages via `::viz[name]` directives
- Page versioning (every edit creates a new version)
- Markdown editor with live preview
- Table of contents with scroll-spy
- Category filtering and search
- Related pages via AI embeddings

### Visualizations (8)
1. **Attention Heatmap** — hover to see attention weights between token pairs
2. **Embedding Space Explorer** — drag to rotate 3D scatter, filter by category
3. **Positional Encoding** — adjustable dimensions and positions, sinusoidal heatmap
4. **Layer Activations** — slide through 12 transformer layers
5. **Softmax Temperature** — adjust T, watch distribution shift, entropy display
6. **Beam Search Tree** — adjustable beam width and depth, pruned nodes shown
7. **Tokenizer Playground** — type text, see colored BPE-like token breakdown
8. **QKV Step-Through** — animated 6-step self-attention computation

### AI Companion
- Streaming sidebar chat on every wiki page (SSE)
- Context-aware: uses page content and tier level in system prompt
- MockProvider: keyword-matched canned responses for 10+ pages, generic fallback for others
- OllamaProvider: real LLM responses when Ollama is available, falls back to mock
- Related pages via embedding similarity
- Flashcard generation from page content

### Auth & Comments
- Sign up / login / logout with bcrypt-hashed passwords
- Session cookies with 30-day expiry
- Threaded comments with markdown/LaTeX support
- Upvote/downvote with sort by new/top/controversial
- Comment editing with edit history

### Mastery Paths
- ML Engineer path: 24 nodes across 5 levels
- Apprentice → Practitioner → Specialist → Expert → Researcher
- Progress tracking with completion percentage
- Level progression visualization

### UI
- Beautiful homepage with feature cards and topic preview
- Search dialog with keyboard navigation (/ to open)
- Keyboard shortcuts (g+h home, g+w wiki, g+p paths)
- Light/dark/system theme toggle
- Responsive layout
- Loading/empty/error states

## What's Mocked

- **MockProvider responses**: Canned responses matched by keywords. 10+ pages have dedicated response files with 3-5 response templates each. Other pages use a generic fallback.
- **Embeddings**: Deterministic hash-based 384-dim vectors. Related pages feature works but isn't semantically perfect.
- **Email verification**: Noop
- **Real-time updates**: No WebSocket, manual refresh needed for new comments
- **Full-text search**: SQLite LIKE, not FTS5

## Test Suite

- **9** DB schema unit tests (users, pages, versioning, comments, voting, mastery)
- **5** MockProvider unit tests (streaming, embeddings, determinism, tier awareness)
- **12** API integration tests (health, auth, wiki, mastery, AI streaming)
- **Frontend builds cleanly** with Vite (all visualizations code-split)

## How to Run

```bash
bun install
bun run setup     # or: cd packages/db && bun run src/migrate.ts && bun run src/seed.ts

# Start both server and web:
bun run dev

# Or individually:
bun run dev:server  # port 3000
bun run dev:web     # port 5173
```

## How to Enable Ollama

```bash
ollama pull llama3.1:8b
ollama pull nomic-embed-text
AI_PROVIDER=ollama bun run dev
```

## Decisions Made

1. **bun:sqlite** over better-sqlite3 (Bun native support)
2. **Simple session cookies** over Lucia (fewer deps)
3. **Lazy-loaded visualizations** (Vite code splitting)
4. **HTML comment tier markers** in markdown (simple, invisible when rendered)
5. **Relative imports for viz** (Vite resolves better than workspace paths)
6. **SSE over WebSocket** for AI streaming (simpler, POST-compatible)

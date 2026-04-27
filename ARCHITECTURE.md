# Axiomic Architecture

## System Overview

```
┌─────────────────────────────────────────────────┐
│                   Frontend                       │
│  React + Vite + TailwindCSS                     │
│  ┌────────────┐ ┌─────────┐ ┌────────────────┐ │
│  │ Wiki Pages  │ │ Auth    │ │ Mastery Paths  │ │
│  │ + Markdown  │ │ Pages   │ │ + DAG View     │ │
│  │ + KaTeX     │ │         │ │                │ │
│  │ + Viz Embed │ │         │ │                │ │
│  └────────────┘ └─────────┘ └────────────────┘ │
│  ┌────────────┐ ┌─────────────────────────────┐ │
│  │ AI Sidebar  │ │ Comments (threaded, voting) │ │
│  │ (SSE stream)│ │                             │ │
│  └────────────┘ └─────────────────────────────┘ │
└─────────────────────┬───────────────────────────┘
                      │ HTTP / SSE
┌─────────────────────┴───────────────────────────┐
│                   Backend                        │
│  Bun + Hono                                     │
│  ┌──────────────────────────────────────────┐   │
│  │ /api/v1                                   │   │
│  │  /auth    - signup, login, logout, me     │   │
│  │  /wiki    - CRUD, versioning, search      │   │
│  │  /comments - threaded, voting, mentions   │   │
│  │  /ai      - chat (SSE), related, rewrite  │   │
│  │  /mastery - paths, nodes, progress, quiz  │   │
│  └──────────────────────────────────────────┘   │
│  ┌────────────┐  ┌───────────────────────────┐  │
│  │ Auth       │  │ AI Provider Abstraction    │  │
│  │ Middleware │  │ ┌─────────┐ ┌───────────┐ │  │
│  │ (sessions) │  │ │ Mock    │ │ Ollama    │ │  │
│  │            │  │ │Provider │ │ Provider  │ │  │
│  └────────────┘  │ └─────────┘ └───────────┘ │  │
│                  └───────────────────────────┘  │
└─────────────────────┬───────────────────────────┘
                      │
┌─────────────────────┴───────────────────────────┐
│                   Database                       │
│  SQLite + Drizzle ORM                           │
│  Tables: users, sessions, wiki_pages,           │
│  page_versions, comments, comment_edits,        │
│  votes, mastery_paths, mastery_nodes,           │
│  user_progress                                  │
└─────────────────────────────────────────────────┘
```

## Key Design Decisions

### 1. AI Provider Abstraction

The core insight: the frontend never knows which AI backend is active. The `AIProvider` interface has two methods:

- `stream(opts)` — streaming chat completion
- `embed(text)` — text embedding for semantic search

**MockProvider** (default): Returns canned responses from `seed-content/ai-responses/`, streams character-by-character with realistic delay. Mock embeddings use deterministic hashing for consistent similarity results.

**OllamaProvider**: Connects to local Ollama instance. Falls back to MockProvider if Ollama isn't available. Uses `llama3.1:8b` for chat, `nomic-embed-text` for embeddings.

### 2. Wiki Page Versioning

Every edit creates a new `page_version` row. The `wiki_pages` table tracks `current_version`. Each version stores content for all three tiers (intro, undergrad, grad) — tiers are not versioned independently.

### 3. Tiered Content in Seed Files

Seed content uses HTML comments as tier markers:
```markdown
<!-- tier:intro -->
Content for the intro tier...
<!-- tier:undergrad -->
Content for the undergrad tier...
<!-- tier:grad -->
Content for the grad tier...
```

### 4. Visualization Embedding

Wiki pages use `::viz[name]` directives to embed visualizations. The `MarkdownRenderer` splits content at these directives and renders `VizEmbed` components, which lazy-load the actual visualization.

### 5. Streaming AI Chat

Uses Server-Sent Events (SSE). The server creates a `ReadableStream` that emits `data: {"token": "..."}` events. The frontend reads via `fetch` + `ReadableStream` reader pattern (not EventSource, for POST support).

### 6. Comments Threading

Comments have a `parent_id` for threading. The API builds a tree structure server-side. Max nesting depth of 3 is enforced on the frontend.

### 7. Session Auth

Simple session cookies (not JWT). Sessions stored in SQLite with expiry. Password hashing via Bun's native bcrypt. No external auth library needed.

## Data Flow

### Reading a Wiki Page
1. Frontend calls `GET /api/v1/wiki/:slug?tier=intro`
2. Server fetches page + latest version from SQLite
3. Returns page metadata + content for requested tier + all tiers + version history
4. Frontend renders markdown with KaTeX, syntax highlighting, viz embeds
5. Related pages fetched asynchronously via `GET /api/v1/ai/related/:slug`

### AI Chat Interaction
1. User types in AI sidebar
2. Frontend POSTs to `/api/v1/ai/chat` with page context
3. Server constructs system prompt with page content and tier
4. AI provider streams response tokens
5. Server wraps in SSE events
6. Frontend reads stream, updates UI character-by-character

### Mastery Path Progress
1. User views path at `/paths/ml-engineer`
2. Frontend fetches path + nodes + user progress
3. Nodes displayed grouped by level, with prereq relationships
4. User clicks "Mark complete" → POST to `/api/v1/mastery/progress/:nodeId/complete`
5. Progress bar and level indicator update

## Performance Considerations

- Visualizations are lazy-loaded (code-split by Vite)
- SQLite with WAL mode for concurrent reads
- Mock AI responses stream with 15-25ms per character delay
- Frontend uses Zustand for minimal re-renders

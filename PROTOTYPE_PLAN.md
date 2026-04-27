# Axiomic Prototype Plan

## Directory Structure

```
/
├── apps/
│   ├── web/                    # React + Vite frontend
│   │   ├── src/
│   │   │   ├── components/     # Shared UI components
│   │   │   ├── pages/          # Route pages
│   │   │   ├── hooks/          # Custom React hooks
│   │   │   ├── lib/            # Utilities, API client
│   │   │   ├── stores/         # Zustand stores (auth, theme, etc.)
│   │   │   └── styles/         # Global styles, fonts
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── tailwind.config.ts
│   │   └── package.json
│   └── server/                 # Bun + Hono backend
│       ├── src/
│       │   ├── routes/         # Hono route handlers
│       │   ├── middleware/     # Auth, logging, rate-limit
│       │   ├── services/      # Business logic
│       │   └── index.ts       # Entry point
│       ├── package.json
│       └── tsconfig.json
├── packages/
│   ├── db/                    # Drizzle ORM + SQLite
│   │   ├── src/
│   │   │   ├── schema.ts     # All table definitions
│   │   │   ├── migrate.ts    # Migration runner
│   │   │   └── seed.ts       # Seed script
│   │   ├── drizzle/          # Generated migrations
│   │   └── package.json
│   ├── ai/                   # AI provider abstraction
│   │   ├── src/
│   │   │   ├── provider.ts   # AIProvider interface
│   │   │   ├── mock.ts       # MockProvider
│   │   │   ├── ollama.ts     # OllamaProvider
│   │   │   └── index.ts      # Factory
│   │   └── package.json
│   └── viz/                  # Visualization components
│       ├── src/
│       │   ├── components/   # Individual viz components
│       │   ├── hooks/        # Shared viz hooks (useD3, useThree)
│       │   └── index.ts
│       └── package.json
├── seed-content/
│   ├── pages/                # 30+ markdown files
│   └── ai-responses/         # Canned responses per page
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── .env.example
├── package.json              # Workspace root
├── tsconfig.json             # Base tsconfig
├── README.md
├── ARCHITECTURE.md
├── PROTOTYPE_NOTES.md
└── Dockerfile
```

## Milestones

### M1 — Foundation (~30 min)
- Root package.json with Bun workspaces
- Base tsconfig.json
- .gitignore
- apps/server: Bun + Hono, /health endpoint, pino logging
- apps/web: Vite + React + Tailwind, basic App shell
- packages/db: Drizzle config, users + pages schema stub
- README.md skeleton
- Verify: `bun install && bun run dev` starts both server and web

### M2 — Core Data Layer (~20 min)
- Full Drizzle schema: users, sessions, wiki_pages, page_versions, comments, votes, mastery_paths, mastery_nodes, user_progress
- Generate migrations
- Seed script infrastructure (reads markdown from seed-content/)
- Verify: migrations run, seed creates tables

### M3 — Auth (~25 min)
- Password hashing with bcrypt (built into Bun)
- Session cookie management
- Sign up, log in, log out API endpoints
- Frontend: auth pages with forms
- Auth middleware for protected routes
- Verify: can sign up and log in

### M4 — Wiki Engine (~30 min)
- Wiki page API: CRUD + versioning
- Markdown rendering: remark + rehype + KaTeX + syntax highlighting
- Tier switcher component
- Page editor with live preview
- Table of contents (auto-generated from headings)
- Internal wiki links
- Verify: can view and edit pages

### M5 — Seed Content (~60 min)
- Write 30+ real wiki pages with intro/undergrad/grad tiers
- Real LaTeX, real code examples, real cross-references
- This is the longest milestone — content takes time

### M6 — Visualizations (~45 min)
- packages/viz: BaseViz wrapper, theme hook, responsive container
- 8 visualizations: attention heatmap, embedding explorer, positional encoding, activation viewer, softmax temperature, beam search, tokenizer playground, QKV step-through
- Embed into wiki pages via custom markdown directive or component refs

### M7 — AI Provider + Features (~40 min)
- AIProvider interface + MockProvider + OllamaProvider
- Canned responses for all seed pages
- SSE streaming endpoint
- Sidebar AI companion UI
- Rewrite-at-level, related pages, flashcard generator, discussion summarizer

### M8 — Comments (~20 min)
- Comment CRUD with threading
- Markdown rendering in comments
- Voting system
- Sort options
- User mentions

### M9 — Mastery Paths (~25 min)
- ML Engineer path: 20+ nodes
- DAG visualization (D3 force-directed or dagre)
- Progress tracking API + UI
- Mastery check quizzes (canned for mock)
- Level progression UI

### M10 — Polish & Testing (~45 min)
- Homepage
- Topic browser, mastery path browser
- Dark mode, keyboard shortcuts
- Search functionality
- Loading/empty/error states
- Unit + integration tests
- Playwright e2e tests
- ARCHITECTURE.md, Dockerfile, setup script

## Tradeoffs

1. **SQLite over Postgres**: Simpler setup, zero dependencies. Schema designed to be portable.
2. **bcrypt over argon2**: Bun has native bcrypt support, argon2 needs native bindings.
3. **Simple session cookies over Lucia**: Less abstraction, more control, fewer dependencies.
4. **shadcn/ui components copied in**: No runtime dependency, full control over styling.
5. **Visualization embedding via React components**: Rather than custom markdown directives, viz components are rendered by slug lookup. Simpler than MDX.
6. **Mock embeddings via deterministic hashing**: Not real semantic similarity, but gives consistent results and meaningful-looking related page suggestions by encoding topic relationships into the hash.

## What I'll stub
- Email verification (noop)
- Real-time notifications (no WebSocket, just polling/page refresh)
- Full-text search will use SQLite LIKE initially, not FTS5
- Image upload (reference external URLs only)
- AnthropicProvider (stub file with TODO)

## Content plan for 30+ pages
1. tokens, 2. embeddings, 3. positional-encoding, 4. attention, 5. self-attention,
6. multi-head-attention, 7. feed-forward-networks, 8. layer-normalization,
9. residual-connections, 10. transformer-block, 11. encoder-decoder,
12. masked-self-attention, 13. cross-attention, 14. training-objectives,
15. bpe-tokenization, 16. sampling-strategies, 17. temperature,
18. top-k-top-p, 19. beam-search, 20. kv-cache, 21. scaling-laws,
22. rope, 23. grouped-query-attention, 24. swiglu, 25. rlhf,
26. mechanistic-interpretability, 27. induction-heads, 28. superposition,
29. fine-tuning, 30. lora, 31. rag, 32. softmax

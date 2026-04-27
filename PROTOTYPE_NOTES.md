# Prototype Notes

## Status

This is a working prototype of Axiomic, built in a single session. It demonstrates the core vision: an educational platform with tiered wiki content, interactive visualizations, AI-powered learning, and structured mastery paths.

## What's Real

- **32+ wiki pages** with genuinely different content across intro/undergrad/grad tiers
- **8 interactive visualizations** (attention heatmap, embedding explorer, positional encoding, layer activations, softmax temperature, beam search tree, tokenizer playground, QKV step-through)
- **AI sidebar** that streams responses contextually based on the page and tier
- **MockProvider** that works with zero setup — canned responses feel realistic
- **OllamaProvider** for real LLM responses when local Ollama is available
- **Auth** (sign up, login, logout with hashed passwords and session cookies)
- **Threaded comments** with markdown/LaTeX, upvote/downvote, edit history
- **Mastery path** (ML Engineer, 24 nodes, 5 levels) with progress tracking
- **Full monorepo** with proper workspace dependencies

## What's Mocked / Stubbed

- **MockProvider responses**: The AI sidebar uses canned responses matched by keywords. They're substantive but not truly generative. With Ollama enabled, responses become real.
- **Mock embeddings**: The related pages feature uses deterministic hash-based embeddings, not real semantic similarity. Related pages work but aren't perfectly accurate.
- **Email verification**: Noop — users can sign up with any email
- **Real-time notifications**: No WebSocket — comments update on page refresh
- **Full-text search**: Uses SQLite LIKE, not FTS5
- **Image upload**: Not implemented — wiki pages can reference external image URLs
- **Profile pages**: Stubbed but not fully built
- **Keyboard shortcuts**: Not implemented yet
- **Playwright e2e tests**: Not yet written

## Known Issues

1. The `bun run dev` from root may not start both server and web simultaneously — run them in separate terminals
2. Some wiki pages may have duplicate content between tiers if the agents generating them had issues
3. The related pages feature may show unexpected results due to hash-based embeddings
4. Mobile responsive design is basic but functional

## Decisions Made

- **SQLite over Postgres**: Zero setup for prototype. Schema is designed to be portable.
- **bun:sqlite over better-sqlite3**: better-sqlite3 not supported in Bun runtime
- **No Lucia auth**: Simple session cookies are sufficient and have fewer dependencies
- **Lazy-loaded visualizations**: Code-split for performance, each viz is its own chunk
- **Relative imports for viz package**: Vite resolves workspace packages better with relative paths
- **HTML comment tier markers**: Simple to parse, invisible in rendered markdown

## Milestone History

- M1: Foundation scaffold (monorepo, server, web, db packages)
- M2: Core data layer (full Drizzle schema, migrations)
- M3: Auth system (signup, login, sessions, frontend pages)
- M4: Wiki engine (markdown/KaTeX, tiers, ToC, versioning)
- M5: Seed content (32 pages with real tiered explanations)
- M6: Visualizations (8 interactive D3/SVG visualizations)
- M7: AI provider (MockProvider, OllamaProvider, SSE streaming, sidebar)
- M8: Comments (threading, voting, markdown rendering)
- M9: Mastery paths (ML Engineer path, 24 nodes, progress tracking)
- M10: Polish (homepage, documentation, testing)

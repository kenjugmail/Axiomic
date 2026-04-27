# Axiomic — Project Vision

This document is the source of truth for what we're building. Everything downstream should be consistent with this.

## What we're building

Axiomic is a unified intellectual platform combining four interlocking pieces:

1. **An open educational wiki** spanning every field of science and engineering. Tiered explanations per topic — elementary, undergraduate, graduate, cutting-edge research. Reader picks their level. Interactive visualizations are first-class. Free for all readers.

2. **A discourse forum** for serious intellectual conversation. Threaded long-form discussions. Structured post types: claim, question, derivation, critique, synthesis, prediction. Per-domain reputation. Steelmanning built in.

3. **AI integration throughout.** Reading companion that knows the page you're on. Writing companion that suggests citations. Discussion synthesizer for long threads. Cross-topic search grounded in our corpus.

4. **Gamified mastery paths.** Field-level structured paths from beginner to research-level expert. Each path is a graph of subtopics with mastery checks and visible progression: Apprentice → Practitioner → Specialist → Expert → Researcher.

## Why these four together

The flywheel between them is the moat. Wiki feeds forum, forum feeds wiki, both feed mastery paths, mastery feeds forum reputation. AI gets uniquely good because its corpus is our wiki + forum + user's learning trajectory.

## Phase 0 launch topic

**Modern ML / transformers / interpretability.** Both founders know it; audience overlaps with HN.

## Tech stack (locked)

- **Backend:** TypeScript, Bun, Hono
- **Database:** SQLite + Drizzle ORM for the prototype (schema portable to Postgres + pgvector later)
- **Frontend:** React, Vite, TailwindCSS, shadcn/ui
- **AI provider abstraction:** see "AI provider strategy" below — no paid API used in the prototype
- **Visualizations:** D3 for 2D, Three.js for 3D
- **Markdown:** remark + rehype, KaTeX for LaTeX
- **Auth:** Lucia or simple session cookies
- **Testing:** Vitest, Playwright
- **Monorepo:** Bun workspaces

When in doubt, pick the boring well-supported option.

## AI provider strategy

The prototype must work without any paid API access. Build a clean abstraction layer with multiple implementations:

```
packages/ai/
├── provider.ts           # AIProvider interface
├── providers/
│   ├── mock.ts           # MockProvider — canned streaming responses (default)
│   ├── ollama.ts         # OllamaProvider — calls localhost:11434
│   └── (anthropic.ts     # Stub file with TODO, not implemented in prototype)
└── index.ts              # Factory: returns provider based on env var AI_PROVIDER
```

The interface is something like:

```typescript
interface AIProvider {
  stream(opts: {
    system: string;
    messages: ChatMessage[];
    onToken: (token: string) => void;
  }): Promise<void>;

  embed(text: string): Promise<number[]>;  // for RAG / semantic search
}
```

**Default provider: `mock`.** The MockProvider returns realistic-looking streaming responses based on simple keyword matching against the page content. It includes 5–10 hand-crafted "answers" per seeded wiki page, plus a generic fallback. Streaming is simulated with character-by-character delay (10–30ms per token). Embeddings can be deterministic random vectors of the right dimension, or a simple TF-IDF approximation.

**Optional provider: `ollama`.** When the user runs `OLLAMA_HOST=localhost:11434 AI_PROVIDER=ollama bun run dev`, the OllamaProvider calls the local Ollama server. Defaults to model `llama3.1:8b` (configurable via env). Real streaming, real embeddings (via `nomic-embed-text` model).

The frontend never knows which provider is active. The UI is identical. This means:
- The prototype works out of the box with zero setup beyond `bun install` and `bun run dev`
- A user with Ollama installed can flip a switch and get real LLM responses
- Later, an API-using version can be added without changing any frontend code

## Code organization

```
/
├── apps/
│   ├── web/          # React frontend
│   └── server/       # Bun + Hono backend
├── packages/
│   ├── db/           # Drizzle schema, migrations
│   ├── ai/           # Provider abstraction, mock + ollama implementations
│   └── viz/          # Visualization framework
├── seed-content/     # Markdown source for wiki pages
│   └── ai-responses/ # Pre-written canned responses for MockProvider
└── README.md
```

## Quality bar

- Wiki pages must be technically correct.
- Visualizations must be genuinely interactive, not gifs.
- AI sidebar must look like a real assistant — streaming, formatted, contextual — even when the backend is mocked. The UX must feel real.
- UI must look polished — this audience notices.
- Non-trivial logic has tests.

## Naming

The project is **Axiomic**. Use this name throughout the prototype.

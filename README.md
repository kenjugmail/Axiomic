# Axiomic

**Learn deeply. Build real things. Prove what you know.**

A **competency operating system** for serious technical work: interactive wiki
and lessons, research and lab surfaces, classes and cohorts, exams and
diagnostics, capstones and credential tracks, plus a **verification** path for
signed artifacts — starting with modern machine learning and transformer
architectures.

## Quick Start

```bash
# Prerequisites: Bun (https://bun.sh)
curl -fsSL https://bun.sh/install | bash

# Clone and setup
git clone <repo-url> axiomic
cd axiomic
bun run setup    # installs deps, runs migrations, seeds 32+ wiki pages

# Start development
bun run dev      # starts server (port 3000) and web (port 5173)
```

Then open [http://localhost:5173](http://localhost:5173).

## What's Inside

### Competency loop tour

Static walkthrough of live routes (wiki → exams → weak concepts → tracks →
verify): open **[Competency loop tour](/demo/competency-loop)** locally after
`bun run dev` (same path on your deployed host).

### Wiki (32+ pages)
- Transformer architecture topics from tokens to mechanistic interpretability
- Three explanation tiers per page: Intro, Undergraduate, Graduate
- KaTeX math rendering, syntax-highlighted code blocks
- Interactive visualizations embedded in pages
- Version history, table of contents, related pages

### Interactive Visualizations (8)
- **Attention Heatmap** — hover tokens to see attention weights
- **Embedding Space Explorer** — drag to rotate a 3D scatter of word embeddings
- **Positional Encoding** — adjust dimensions and positions, see the sinusoidal patterns
- **Layer Activations** — slide through transformer layers
- **Softmax Temperature** — adjust T, watch the distribution shift
- **Beam Search Tree** — interactive tree with adjustable beam width
- **Tokenizer Playground** — type text, see BPE-like breakdown
- **QKV Step-Through** — animated self-attention computation

### AI Companion
- Streaming sidebar chat on every wiki page
- Context-aware: knows the page content and your tier
- Generates quizzes, practice problems, flashcards
- Works out of the box with MockProvider (no API keys needed)

### Mastery Paths
- ML Engineer path with 24 nodes across 5 levels
- Prerequisite graph with visual progress tracking
- Level progression: Apprentice → Practitioner → Specialist → Expert → Researcher

### Auth & Comments
- Email + password authentication
- Threaded comments with markdown/LaTeX support
- Upvote/downvote with sorting options

## Optional: Ollama for Real AI

The AI features work without any setup (MockProvider with canned responses). For real LLM responses:

```bash
# Install Ollama (https://ollama.ai)
ollama pull llama3.1:8b
ollama pull nomic-embed-text

# Start Axiomic with Ollama
AI_PROVIDER=ollama bun run dev
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | TypeScript, Bun, Hono |
| Database | SQLite + Drizzle ORM |
| Frontend | React, Vite, TailwindCSS, shadcn/ui patterns |
| Visualizations | D3.js, React SVG |
| Markdown | react-markdown, remark-math, rehype-katex |
| AI | Provider abstraction (Mock / Ollama) |
| Auth | Session cookies, bcrypt |

## Project Structure

```
apps/
  server/        # Hono API server
  web/           # React + Vite frontend
packages/
  db/            # Drizzle schema, migrations, seed
  ai/            # AIProvider interface + implementations
  viz/           # Visualization components
seed-content/
  pages/         # 32+ markdown wiki pages
  ai-responses/  # Canned MockProvider responses
```

## Environment Variables

See `.env.example` for all configurable options.

## License

Prototype — not yet licensed for distribution.

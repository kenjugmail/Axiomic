#!/usr/bin/env bash
set -euo pipefail

echo "🔧 Setting up Axiomic..."
echo ""

# Check for Bun
if ! command -v bun &> /dev/null; then
    echo "Bun is not installed. Installing..."
    curl -fsSL https://bun.sh/install | bash
    export PATH="$HOME/.bun/bin:$PATH"
fi

echo "Using Bun $(bun --version)"
echo ""

# Install dependencies
echo "Installing dependencies..."
bun install
echo ""

# Run migrations
echo "Running database migrations..."
cd packages/db && bun run src/migrate.ts
cd -

# Seed content
echo "Seeding wiki pages and mastery paths..."
cd packages/db && bun run src/seed.ts
cd -

echo ""
echo "Setup complete!"
echo ""
echo "To start development:"
echo "  bun run dev"
echo ""
echo "Or start server and web separately:"
echo "  bun run dev:server  # port 3000"
echo "  bun run dev:web     # port 5173"
echo ""
echo "Optional: enable Ollama for real AI responses:"
echo "  ollama pull llama3.1:8b"
echo "  ollama pull nomic-embed-text"
echo "  AI_PROVIDER=ollama bun run dev"

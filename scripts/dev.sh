#!/usr/bin/env bash
# Default local dev: Ollama + auth bypass (signed in as alice).
# Use `bun run dev:mock` for mock AI and real login.
set -euo pipefail
cd "$(dirname "$0")/.."
export DEV_AUTH_BYPASS="${DEV_AUTH_BYPASS:-1}"
export DEV_AUTH_BYPASS_USER="${DEV_AUTH_BYPASS_USER:-alice}"
export AI_PROVIDER="${AI_PROVIDER:-ollama}"
export OLLAMA_CHAT_MODEL="${OLLAMA_CHAT_MODEL:-qwen3.5:9b}"
export OLLAMA_EMBED_MODEL="${OLLAMA_EMBED_MODEL:-qwen3-embedding:4b}"
bun run --filter '@axiomic/server' dev &
bun run --filter '@axiomic/web' dev &
wait

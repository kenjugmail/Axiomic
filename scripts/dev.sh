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

# Preflight: if the API port is already held, bun --watch would
# loop on EADDRINUSE forever WITHOUT exiting while the web server
# still comes up — a half-started stack that serves the SPA
# against a dead API (looks like "no content"). Fail loud with
# the exact fix instead. We never auto-kill someone else's
# process.
PORT="${PORT:-3000}"
if command -v lsof >/dev/null 2>&1; then
  HOLDER="$(lsof -ti tcp:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
  if [ -n "$HOLDER" ]; then
    echo "✗ Port $PORT is already in use by PID(s): $HOLDER" >&2
    echo "  A dev server is probably still running. Stop it, then retry:" >&2
    echo "    kill $HOLDER        # or: kill -9 $HOLDER" >&2
    echo "  (set PORT=<other> to run on a different port.)" >&2
    exit 1
  fi
fi

# If either dev server dies (or you Ctrl-C), tear down both so we
# never leave a half-up stack behind.
trap 'trap - EXIT INT TERM; kill 0 2>/dev/null' EXIT INT TERM

bun run --filter '@axiomic/server' dev &
bun run --filter '@axiomic/web' dev &
wait

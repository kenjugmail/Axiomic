#!/usr/bin/env bash
# Sprint 45 — Generate an ed25519 signing key seed for capstone
# transcript signing.
#
# Set the printed value as AXIOMIC_SIGNING_PRIVATE_KEY_HEX in your
# production environment so transcripts keep verifying across server
# restarts. NEVER commit the value; treat it like a secret.
#
# Usage:
#   bash scripts/generate-signing-key.sh
#   bash scripts/generate-signing-key.sh > .env.signing  # one-time

set -euo pipefail

if command -v node >/dev/null 2>&1; then
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
elif command -v bun >/dev/null 2>&1; then
  bun -e "console.log(crypto.getRandomValues(new Uint8Array(32)).reduce((a, b) => a + b.toString(16).padStart(2, '0'), ''))"
elif command -v openssl >/dev/null 2>&1; then
  openssl rand -hex 32
else
  echo "error: need node, bun, or openssl on PATH to generate the key" >&2
  exit 1
fi

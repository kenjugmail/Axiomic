#!/usr/bin/env bash
# Sprint 53 — Validate the AXIOMIC_SIGNING_PRIVATE_KEY_HEX env var
# parses to a 32-byte ed25519 seed.
#
# Exits 0 when the var is unset (dev / staging without the var) OR
# when it parses cleanly. Exits non-zero when the var is set but
# malformed, so CI can gate a deploy.
#
# Usage:
#   bash scripts/validate-signing-key.sh

set -euo pipefail

if [[ -z "${AXIOMIC_SIGNING_PRIVATE_KEY_HEX:-}" ]]; then
  echo "[validate-signing-key] AXIOMIC_SIGNING_PRIVATE_KEY_HEX not set; skipping (dev/staging mode)."
  exit 0
fi

key="$AXIOMIC_SIGNING_PRIVATE_KEY_HEX"

# Must be exactly 64 hex chars (32 bytes).
if [[ ${#key} -ne 64 ]]; then
  echo "[validate-signing-key] FAIL: key is ${#key} chars; expected 64 (32 bytes hex-encoded)." >&2
  exit 1
fi

if ! [[ "$key" =~ ^[0-9a-fA-F]+$ ]]; then
  echo "[validate-signing-key] FAIL: key contains non-hex characters." >&2
  exit 1
fi

echo "[validate-signing-key] OK: 32-byte ed25519 seed parses."

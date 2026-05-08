#!/usr/bin/env bash
# Sprint 53 — Pre-deploy checklist.
#
# Validates the production environment before bringing up the server.
# Exits 0 only when all required vars are set + the signing key
# parses + the DB migration directory is present. Designed to run in
# CI before `bun run` on a deploy target.
#
# Usage:
#   NODE_ENV=production bash scripts/preflight.sh

set -uo pipefail

failures=0
warn=0

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

require() {
  local name="$1"
  local value="${!name:-}"
  if [[ -z "$value" ]]; then
    echo "[preflight] FAIL: $name is required in production." >&2
    failures=$((failures + 1))
  fi
}

soft_warn() {
  local name="$1"
  local value="${!name:-}"
  if [[ -z "$value" ]]; then
    echo "[preflight] WARN: $name is unset (recommended in production)."
    warn=$((warn + 1))
  fi
}

is_prod="false"
if [[ "${NODE_ENV:-}" == "production" ]]; then
  is_prod="true"
fi

echo "[preflight] NODE_ENV=${NODE_ENV:-development}"

# Required-in-prod env.
if [[ "$is_prod" == "true" ]]; then
  require AXIOMIC_SIGNING_PRIVATE_KEY_HEX
  require SESSION_SECRET
  require CORS_ORIGIN
  if [[ "${CORS_ORIGIN:-}" == "http://localhost:5173" ]]; then
    echo "[preflight] FAIL: CORS_ORIGIN is still the dev default." >&2
    failures=$((failures + 1))
  fi
  if [[ "${DEV_AUTH_BYPASS:-}" == "1" ]]; then
    echo "[preflight] FAIL: DEV_AUTH_BYPASS=1 in production is dangerous." >&2
    failures=$((failures + 1))
  fi
fi

# Recommended-in-prod env.
if [[ "$is_prod" == "true" ]]; then
  soft_warn BOOTSTRAP_ADMIN_USERNAME
fi

# Signing key shape.
bash "$REPO_ROOT/scripts/validate-signing-key.sh" || failures=$((failures + 1))

# Migrations directory present.
if [[ ! -d "$REPO_ROOT/packages/db/drizzle" ]]; then
  echo "[preflight] FAIL: packages/db/drizzle missing — migrations were never generated." >&2
  failures=$((failures + 1))
fi

if [[ -d "$REPO_ROOT/packages/db/drizzle" ]]; then
  count=$(find "$REPO_ROOT/packages/db/drizzle" -maxdepth 1 -name '*.sql' | wc -l | tr -d ' ')
  if [[ "$count" -eq 0 ]]; then
    echo "[preflight] FAIL: no migrations in packages/db/drizzle/." >&2
    failures=$((failures + 1))
  else
    echo "[preflight] OK: $count migration(s) present."
  fi
fi

if [[ "$failures" -gt 0 ]]; then
  echo "[preflight] $failures failure(s); aborting." >&2
  exit 1
fi

if [[ "$warn" -gt 0 ]]; then
  echo "[preflight] $warn warning(s); pass."
else
  echo "[preflight] all checks passed."
fi

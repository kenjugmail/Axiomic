#!/usr/bin/env bash
# Sprint 63e — Lighthouse mobile audit driver.
#
# Runs Lighthouse against the dev server for a fixed set of busy
# routes; emits per-route JSON reports under test-results/lighthouse/.
#
# Usage:
#   bun run dev   # in another terminal
#   bash scripts/lighthouse-audit.sh
#
# Exits non-zero if any route's mobile Performance score < 80.

set -euo pipefail

BASE_URL="${LIGHTHOUSE_BASE_URL:-http://localhost:5173}"
OUT_DIR="test-results/lighthouse"
mkdir -p "$OUT_DIR"

ROUTES=(
  "/"
  "/paths"
  "/wiki/attention"
  "/me/mri"
  "/tracks"
)

if ! command -v lighthouse >/dev/null 2>&1; then
  echo "lighthouse CLI not installed. Install with: npm install -g lighthouse" >&2
  exit 2
fi

failures=0
for route in "${ROUTES[@]}"; do
  slug="${route//\//_}"
  slug="${slug:-_root}"
  out="$OUT_DIR/${slug#_}.json"
  echo "==> auditing $BASE_URL$route"
  lighthouse "$BASE_URL$route" \
    --preset=mobile \
    --output=json \
    --output-path="$out" \
    --quiet \
    --chrome-flags="--headless --no-sandbox" \
    --only-categories=performance,accessibility,best-practices,seo

  perf=$(jq '.categories.performance.score' "$out")
  echo "    performance: $perf"
  # Bash arithmetic is integer-only; multiply by 100.
  perf_pct=$(awk -v p="$perf" 'BEGIN { printf "%d", p * 100 }')
  if [ "$perf_pct" -lt 80 ]; then
    echo "    FAIL: performance below 80"
    failures=$((failures + 1))
  fi
done

echo
if [ "$failures" -gt 0 ]; then
  echo "Lighthouse: $failures route(s) below the Performance ≥ 80 target."
  exit 1
fi
echo "Lighthouse: all routes meet the Performance ≥ 80 target."

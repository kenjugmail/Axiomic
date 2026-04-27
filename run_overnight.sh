#!/bin/bash
# Axiomic overnight prototype build — single ~5-hour autonomous run
# Usage: ./run_overnight.sh
# Stop with Ctrl-C

set -uo pipefail

# Safety: don't run on main
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "no-git")
if [ "$BRANCH" = "main" ] || [ "$BRANCH" = "master" ]; then
  echo "ERROR: refusing to run on $BRANCH branch."
  echo "Run: git checkout -b prototype-overnight"
  exit 1
fi

if [ "$BRANCH" = "no-git" ]; then
  echo "ERROR: not in a git repo."
  echo "Run: git init && git checkout -b prototype-overnight"
  exit 1
fi

# Safety: required files
for f in VISION.md FULL_PROTOTYPE.md; do
  if [ ! -f "$f" ]; then
    echo "ERROR: missing required file: $f"
    exit 1
  fi
done

mkdir -p .logs
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOGFILE=".logs/overnight_${TIMESTAMP}.log"

echo "=========================================="
echo "Axiomic overnight prototype build"
echo "Branch:    $BRANCH"
echo "Started:   $(date)"
echo "Log file:  $LOGFILE"
echo "Press Ctrl-C to abort cleanly."
echo "=========================================="
echo ""
echo "Note: the prototype will use a MockProvider for AI features."
echo "No API keys required."
echo ""

cat FULL_PROTOTYPE.md | claude --dangerously-skip-permissions 2>&1 | tee "$LOGFILE"

echo ""
echo "=========================================="
echo "Session ended at $(date)"
echo ""
echo "Commit count:"
git log --oneline 2>/dev/null | wc -l
echo ""
echo "Recent commits:"
git log --oneline 2>/dev/null | head -50
echo "=========================================="

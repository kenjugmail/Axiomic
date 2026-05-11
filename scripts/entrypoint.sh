#!/usr/bin/env bash
# Container entrypoint for Axiomic.
#
# Runs DB migrations at startup (cheap when up-to-date, idempotent),
# optionally re-seeds when SEED_ON_BOOT=1 is set, then exec's the
# server. Migrations and seed are NOT run at image-build time —
# that pattern would bake mutable data into the image and force a
# rebuild on every schema change, which is wrong for a stateful
# SQLite deploy with a persistent volume.

set -euo pipefail

# Migrations are always run. The DB lives in the persistent volume
# pointed at by $DATABASE_URL; an empty volume gets bootstrapped, a
# populated volume gets any pending schema updates applied.
echo "[entrypoint] running db migrations..."
bun run db:migrate

# Seeding only runs when explicitly opted in. For a brand-new demo
# environment, set SEED_ON_BOOT=1 the FIRST time the container starts,
# then remove it from the env so subsequent restarts don't re-seed.
if [ "${SEED_ON_BOOT:-}" = "1" ]; then
  echo "[entrypoint] SEED_ON_BOOT=1 set; running db seed..."
  bun run db:seed
else
  echo "[entrypoint] SEED_ON_BOOT not set; skipping seed."
fi

echo "[entrypoint] starting server..."
exec bun run apps/server/src/index.ts

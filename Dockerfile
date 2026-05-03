FROM oven/bun:1.3.13 AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/ai/package.json packages/ai/
COPY packages/types/package.json packages/types/
COPY packages/viz/package.json packages/viz/
RUN bun install --frozen-lockfile

# ─── Build stage: produce the web bundle ────────────────────────────────────
FROM deps AS build
WORKDIR /app
COPY . .
RUN cd apps/web && bunx vite build

# ─── Runtime stage: only what's needed to serve ─────────────────────────────
FROM oven/bun:1.3.13-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Bring node_modules and source for the workspaces the server actually needs.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/server ./apps/server
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/packages ./packages
COPY --from=build /app/seed-content ./seed-content

# Migrate and seed against an empty DB inside the image.
# (For a real deployment, mount a volume and run these on first boot instead.)
RUN bun run db:migrate && bun run db:seed

EXPOSE 3000

# Liveness/readiness probe hits the app's /api/v1/ready endpoint.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD bun -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/api/v1/ready').then(r=>{if(r.status!==200)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["bun", "run", "apps/server/src/index.ts"]

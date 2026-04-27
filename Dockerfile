FROM oven/bun:1.3 AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/ai/package.json packages/ai/
COPY packages/viz/package.json packages/viz/
RUN bun install --frozen-lockfile

# Copy source
COPY . .

# Build frontend
RUN cd apps/web && bunx vite build

# Run migrations and seed
RUN bun run db:migrate && bun run db:seed

# Expose port
EXPOSE 3000

# Start server
CMD ["bun", "run", "apps/server/src/index.ts"]

# OpenFit API — production container.
#
# Build context: the monorepo root (fly.toml sets `dockerfile = "apps/api/Dockerfile"`
# from there). We need the root package-lock.json plus every workspace package.json
# so npm can resolve the workspace graph correctly.

FROM node:20-slim
WORKDIR /app

# OS packages: openssl for Prisma's TLS to Neon, ca-certificates for outbound HTTPS
# (Anthropic API). build-essential is only needed if bcrypt's prebuilt binary is
# missing for this arch — it's present for linux/amd64 (Fly's default) so skipping.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Copy package manifests first for better Docker layer caching: npm install only
# re-runs when these change, not on every source edit.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/db/package.json packages/db/
COPY packages/types/package.json packages/types/
COPY packages/fitness-core/package.json packages/fitness-core/
COPY packages/ui/package.json packages/ui/

# --ignore-scripts so Prisma's postinstall doesn't run before we've copied the
# schema. We invoke `prisma generate` explicitly a few lines below.
RUN npm ci --ignore-scripts

# bcrypt ships a native binding that its install script downloads — `--ignore-scripts`
# above skipped that, so we trigger it explicitly here. (`npm rebuild` re-runs install
# scripts for already-installed packages.)
RUN npm rebuild bcrypt

# Source for the API and its workspace dependencies. (No need to copy apps/web,
# apps/mobile, or other packages — they aren't imported by the API.)
COPY packages/types packages/types/
COPY packages/fitness-core packages/fitness-core/
COPY packages/db packages/db/
COPY apps/api apps/api/

# Generate Prisma client into node_modules/.prisma.
RUN cd packages/db && npx prisma generate

# Uploads dir for nutrition photos. The Fly volume mounts on top of this path
# in fly.toml, so anything we write here at image-build time is hidden by the
# volume at runtime — the mkdir is purely so the path exists on first boot
# before the volume is attached.
RUN mkdir -p apps/api/uploads

WORKDIR /app/apps/api

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# tsx runs the TS source directly — the monorepo's workspace packages export
# .ts entrypoints (`packages/db/src/index.ts` etc.) rather than compiled dist,
# so we use tsx in production instead of building each package to JS.
CMD ["node", "--import", "tsx", "src/index.ts"]

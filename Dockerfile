# Multi-stage build for Resolution Companion API server
# Works with Railway, Render, Fly.io, and any Docker-compatible host

# --- Stage 1: Install dependencies ---
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# --- Stage 2: Build server ---
FROM node:22-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run server:build

# --- Stage 3: Production image ---
FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

# Copy production dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/server_dist ./server_dist

# Copy static assets and templates
COPY server/templates ./server/templates
COPY public ./public
COPY app.json ./app.json

# Copy static Expo build if it exists (pre-built bundles for mobile app)
COPY static-build* ./static-build/

EXPOSE 5000

CMD ["node", "server_dist/index.js"]

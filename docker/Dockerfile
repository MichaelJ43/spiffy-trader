# Build frontend (Vite)
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Run API + serve dist
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
# tsx is a runtime dependency (see package.json); do not use --omit=optional — esbuild needs
# @esbuild/linux-x64 (optional) inside the Linux image.
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY server.ts ./
COPY src ./src

EXPOSE 3000
CMD ["./node_modules/.bin/tsx", "server.ts"]

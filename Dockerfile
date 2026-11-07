FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build
FROM node:22-alpine AS app
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node","server.js"]
FROM node:22-alpine AS worker
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY scripts ./scripts
COPY lib ./lib
COPY package.json ./package.json
CMD ["node","scripts/worker.mjs"]
FROM node:22-alpine AS migrator
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY scripts/migrate.mjs ./scripts/migrate.mjs
COPY database ./database
COPY package.json ./package.json
CMD ["node","scripts/migrate.mjs"]

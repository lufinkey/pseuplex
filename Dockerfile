FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./

# Install all dependencies (including dev dependencies) for building
RUN npm ci && npm cache clean --force

COPY . .

RUN npm run build


# Production stage: copies dist from builder stage, then only installs dependencies needed for production (non-dev)
FROM node:22-alpine AS production

WORKDIR /app

# Run as non-root user `node`, which is a default user provided by the node image
RUN chown node:node ./
USER node

COPY --from=builder --chown=node:node /app/dist ./dist

COPY package*.json ./

RUN npm ci --omit=dev && npm cache clean --force

# Entrypoint is used here to allow signals (e.g. SIGTERM) to properly pass through to node process
ENTRYPOINT [ "node", "dist/main.js", "--config=/config/config.json" ]

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files (including lockfile if exists)
COPY package*.json ./
RUN npm install

# Copy source
COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine

# SECURITY: Use non-root user
USER node
WORKDIR /home/node/app

# Set environment to production
ENV NODE_ENV=production

# Copy package files as root to set permissions, then switch user
USER root
COPY package*.json ./
# Install only production dependencies
RUN npm install --production && chown -R node:node /home/node/app

USER node
COPY --from=builder /app/dist ./dist
# Only copy example env, real .env should be mounted or passed
COPY .env.example ./.env.example

# Create data directory with correct permissions and declare volume
USER root
RUN mkdir -p data/uploads && chown -R node:node data
VOLUME ["/home/node/app/data"]
USER node

EXPOSE 3001

CMD ["node", "dist/index.js"]

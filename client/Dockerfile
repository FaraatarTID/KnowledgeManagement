# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
# Set environment variables for the build if needed
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

# In Next.js, the standalone output is often preferred for production Docker images
# but for simplicity, we'll copy the whole build output if not using standalone
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.mjs ./
# COPY --from:builder /app/node_modules ./node_modules

EXPOSE 3000

CMD ["npm", "start"]

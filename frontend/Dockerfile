# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files first for caching
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Copy source code
COPY . .

# Build for production
RUN npm run build

# Runtime stage - serve with nginx
FROM nginx:alpine

# Copy built assets
COPY --from=builder /app/dist/frontend/browser /usr/share/nginx/html

# Copy nginx config for SPA routing
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Move config.json to template for envsubst
RUN mv /usr/share/nginx/html/assets/config.json /usr/share/nginx/html/assets/config.json.template

# Create entrypoint script for runtime config injection
# This runs before nginx starts and substitutes env vars into config.json
RUN printf '#!/bin/sh\nenvsubst < /usr/share/nginx/html/assets/config.json.template > /usr/share/nginx/html/assets/config.json\n' > /docker-entrypoint.d/40-envsubst-config.sh && \
    chmod +x /docker-entrypoint.d/40-envsubst-config.sh

# Default API URL (can be overridden via environment variable)
ENV API_URL=http://localhost:8080

# Expose port
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

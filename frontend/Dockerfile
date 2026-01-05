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

# nginx:alpine runs as nginx user by default, ensure proper permissions
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid

# Use non-root user for security
USER nginx

# Expose port
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

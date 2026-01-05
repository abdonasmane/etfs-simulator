# Build stage
FROM golang:alpine AS builder

# Enable auto toolchain for latest Go version
ENV GOTOOLCHAIN=auto

# Install swag for swagger generation
RUN go install github.com/swaggo/swag/cmd/swag@latest

WORKDIR /app

# Copy go mod files first for caching
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Generate swagger docs
RUN swag init -g cmd/api/main.go -o docs --parseDependency --parseInternal

# Build the binary with optimizations for smaller size
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /api ./cmd/api

# Runtime stage
FROM alpine:3.21

# Add ca-certificates for HTTPS calls and create non-root user
RUN apk --no-cache add ca-certificates && \
    adduser -D -g '' appuser

WORKDIR /app

# Copy binary from builder
COPY --from=builder /api .

# Use non-root user for security
USER appuser

# Expose port
EXPOSE 8080

# Run the binary
CMD ["./api"]

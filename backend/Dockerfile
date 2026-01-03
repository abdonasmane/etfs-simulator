# Build stage
FROM golang:alpine AS builder

# Enable auto toolchain to download required Go version
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

# Build the binary
RUN CGO_ENABLED=0 GOOS=linux go build -o /api ./cmd/api

# Runtime stage
FROM alpine:3.21

# Add ca-certificates for HTTPS calls
RUN apk --no-cache add ca-certificates

WORKDIR /app

# Copy binary from builder
COPY --from=builder /api .

# Expose port
EXPOSE 8080

# Run the binary
CMD ["./api"]

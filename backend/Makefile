.PHONY: fmt lint test run build clean

# Development
run:
	@go run ./cmd/api

# Build
build:
	@go build -o bin/api ./cmd/api

# Code quality
fmt:
	@gofmt -w .
	@goimports -w .

lint:
	@golangci-lint run

# Testing
test:
	@go test -v ./...

test-coverage:
	@go test -coverprofile=coverage.out ./...
	@go tool cover -html=coverage.out -o coverage.html

# Cleanup
clean:
	@rm -rf bin/
	@rm -f coverage.out coverage.html

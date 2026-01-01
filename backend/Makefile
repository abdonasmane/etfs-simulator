.PHONY: fmt lint test run build clean swagger

# Development
run:
	@go run ./cmd/api

# Build
build:
	@go build -o bin/api ./cmd/api

# Documentation
swagger:
	@swag init -g cmd/api/main.go -o swagger-docs --parseDependency --parseInternal

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
	@rm -rf swagger-docs

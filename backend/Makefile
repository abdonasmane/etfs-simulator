.PHONY: fmt lint test run build clean swagger

# Documentation (generated automatically)
swagger:
	@swag init -g cmd/api/main.go -o docs --parseDependency --parseInternal 2>/dev/null

# Development - auto-generates swagger before running
run: swagger
	@go run ./cmd/api

# Build - auto-generates swagger before building
build: swagger
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
	@rm -rf docs

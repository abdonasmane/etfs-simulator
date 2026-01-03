.PHONY: install dev build build-prod lint lint-fix format format-check test clean

# Install dependencies
install:
	@npm install

# Start development server
dev:
	@npm start

# Build for development
build:
	@npm run build

# Build for production
build-prod:
	@npm run build:prod

# Run linter
lint:
	@npm run lint

# Run linter with auto-fix
lint-fix:
	@npm run lint:fix

# Format code with Prettier
format:
	@npm run format

# Check code formatting
format-check:
	@npm run format:check

# Run tests
test:
	@npm test

# Clean build artifacts
clean:
	@rm -rf dist .angular node_modules

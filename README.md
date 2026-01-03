# ETFs Investment Simulator

A web application to simulate investment growth with compound interest.

## Quick Start (Docker)

**Prerequisites:** Docker and Docker Compose

```bash
docker-compose up --build
```

Then open:
- **Frontend:** http://localhost:4200
- **Backend API:** http://localhost:8080
- **Swagger Docs:** http://localhost:8080/swagger/index.html

## Development Setup

### Backend (Go)

**Prerequisites:** Go 1.24+

```bash
cd backend
make setup  # Install CLI tools (first time only)
make run    # Start server on :8080
```

### Frontend (Angular)

**Prerequisites:** Node.js 22+

```bash
cd frontend
npm install  # Install dependencies
npm start    # Start dev server on :4200
```

## Project Structure

```
├── backend/          # Go API server
│   ├── cmd/api/      # Entry point
│   ├── internal/     # Private packages
│   └── sdk/          # Shared utilities
├── frontend/         # Angular 21 SPA
│   └── src/app/      # Application code
└── docker-compose.yml
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| POST | `/api/v1/simulate/years` | Simulate by number of years |
| POST | `/api/v1/simulate/target` | Simulate until target date |
| GET | `/swagger/index.html` | API documentation |

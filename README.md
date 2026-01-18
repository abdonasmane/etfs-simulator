# ETFs Investment Simulator

A web application that simulates long-term investment growth using **real historical market data**. Unlike simple compound interest calculators, this tool provides realistic projections with confidence ranges based on actual ETF performance.

## Why This Tool?

Most investment calculators use a fixed return rate (e.g., 7%), which doesn't reflect market reality. This simulator:

- Uses **historical data from Yahoo Finance** to calculate realistic return expectations
- Shows **pessimistic, median, and optimistic scenarios** based on 20-year rolling returns
- Supports **portfolio diversification** across multiple ETFs
- Models **contribution growth** over time (salary increases, inflation adjustments)
- Provides **month-by-month projections** with interactive visualizations

## Quick Start

### Docker (Recommended)

**Prerequisites:** Docker and Docker Compose

```bash
docker-compose up --build
```

Then open:
- **Frontend:** http://localhost:4200
- **Backend API:** http://localhost:8080
- **Swagger Docs:** http://localhost:8080/swagger/index.html

### Local Development

#### Backend (Go)

**Prerequisites:** Go 1.24+

```bash
cd backend
make setup  # Install CLI tools (first time only)
make run    # Start server on :8080
```

#### Frontend (Angular)

**Prerequisites:** Node.js 22+

```bash
cd frontend
npm install  # Install dependencies
npm start    # Start dev server on :4200
```

## How It Works

### The Simulation Engine

The simulator performs month-by-month compound growth calculations:

```
For each month:
  1. Apply investment returns: balance *= (1 + monthlyReturnRate)
  2. Add contribution: balance += currentContribution
  3. Grow contribution (if growth rate set): contribution *= (1 + monthlyGrowthRate)
```

### Historical Return Calculation

On startup, the backend fetches historical monthly prices from Yahoo Finance and calculates:

| Metric | Description | Use Case |
|--------|-------------|----------|
| **Median Return** | 50th percentile of 20-year rolling returns | Expected scenario |
| **Pessimistic** | 5th percentile | Worst-case planning |
| **Optimistic** | 95th percentile | Best-case scenario |

### Supported ETFs

| Symbol | Name | Median Return* | Description |
|--------|------|----------------|-------------|
| SPY | S&P 500 | ~8.7% | 500 largest US companies |
| QQQ | NASDAQ 100 | ~13.6% | 100 largest non-financial NASDAQ companies |
| EFA | MSCI EAFE | ~5.7% | Developed markets excluding US & Canada |

*Returns are calculated dynamically from historical data and may vary.

## Architecture

```
┌─────────────────────┐         HTTP          ┌─────────────────────────────────┐
│                     │ ◄───────────────────► │                                 │
│   Angular 21 SPA    │                       │         Go REST API             │
│   (Port 4200)       │                       │         (Port 8080)             │
│                     │                       │                                 │
│  • Simulation Form  │                       │  • Yahoo Finance Client         │
│  • Portfolio Builder│                       │  • Statistical Analysis         │
│  • Growth Chart     │                       │  • Simulation Engine            │
│  • Results Display  │                       │  • Prometheus Metrics           │
│                     │                       │                                 │
└─────────────────────┘                       └───────────────┬─────────────────┘
                                                              │
                                                              ▼
                                              ┌───────────────────────────────┐
                                              │     Yahoo Finance API         │
                                              │   (Historical price data)     │
                                              └───────────────────────────────┘
```

## Project Structure

```
├── backend/                    # Go API server
│   ├── cmd/api/                # Application entry point
│   ├── internal/
│   │   ├── config/             # Configuration loading
│   │   ├── handler/            # HTTP handlers & simulation logic
│   │   ├── marketdata/         # Yahoo Finance client & statistics
│   │   ├── metrics/            # Prometheus metrics
│   │   └── server/             # HTTP server setup
│   └── sdk/                    # Shared utilities (errors, logger)
│
├── frontend/                   # Angular 21 SPA
│   └── src/app/
│       ├── core/               # Services and models
│       ├── features/           # Feature modules (simulation)
│       └── shared/             # Reusable components
│
└── docker-compose.yml          # Container orchestration
```

## API Reference

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/api/v1/indexes` | List available ETFs with statistics |
| `POST` | `/api/v1/simulate/years` | Simulate by number of years |
| `POST` | `/api/v1/simulate/target` | Simulate until target date |
| `GET` | `/metrics` | Prometheus metrics |
| `GET` | `/swagger/index.html` | Interactive API documentation |

### Example: Simulate by Years

**Request:**

```bash
curl -X POST http://localhost:8080/api/v1/simulate/years \
  -H "Content-Type: application/json" \
  -d '{
    "initialInvestment": 10000,
    "monthlyContribution": 500,
    "years": 20,
    "indexSymbol": "SPY",
    "contributionGrowthRate": 3
  }'
```

**Response (abbreviated):**

```json
{
  "inputs": { ... },
  "projections": [
    {
      "year": 2026,
      "month": 2,
      "monthlyContribution": 500,
      "totalContributed": 10500,
      "portfolioValue": 10572.35,
      "pessimisticValue": 10545.20,
      "optimisticValue": 10612.80
    }
  ],
  "summary": {
    "targetDate": "January 2046",
    "finalValue": 425680.50,
    "totalContributed": 165420.00,
    "totalGain": 260260.50,
    "percentageGain": 157.3,
    "hasRange": true,
    "pessimisticValue": 285420.00,
    "optimisticValue": 720350.00
  }
}
```

### Example: Custom Portfolio

```bash
curl -X POST http://localhost:8080/api/v1/simulate/years \
  -H "Content-Type: application/json" \
  -d '{
    "initialInvestment": 10000,
    "monthlyContribution": 500,
    "years": 20,
    "portfolio": [
      { "symbol": "SPY", "weight": 60 },
      { "symbol": "QQQ", "weight": 30 },
      { "symbol": "EFA", "weight": 10 }
    ]
  }'
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ENV` | `development` | Environment (`development` or `production`) |
| `SERVER_HOST` | `localhost` | Server bind address |
| `SERVER_PORT` | `8080` | Server port |

### Frontend Environment

Edit `frontend/src/environments/environment.ts`:

```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:8080'
};
```


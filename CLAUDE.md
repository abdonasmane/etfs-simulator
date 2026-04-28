# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ETFs Investment Simulator — a web app that projects long-term investment growth using **real historical market data** from Yahoo Finance. Two services:

- **`backend/`** — Go 1.25 REST API on `:8080`. Fetches historical ETF prices on startup, computes 20-year (or 10-year fallback) rolling-return percentiles (5/50/95), and runs month-by-month compound-growth simulations.
- **`frontend/`** — Angular 21 standalone-component SPA on `:4200` (nginx on `:80` in prod). Charts via `chart.js`. No state management library — services + RxJS.

Production runs on **Cloud Run** (project `downloadclip-prod`, region `us-west1`); CI/CD is **Cloud Build** triggered on push to `main`. See `INFRA.md`.

## Common Commands

### Backend (`cd backend`)

| Task | Command |
|------|---------|
| First-time tool install (swag, goimports, golangci-lint) | `make setup` |
| Run server (regenerates Swagger) | `make run` |
| Build binary (`bin/api`) | `make build` |
| Format (gofmt + goimports) | `make fmt` |
| Lint | `make lint` |
| Run all tests | `make test` |
| Run a single test | `go test -v -run TestFetchHistoricalData ./internal/marketdata` |
| Coverage HTML report | `make test-coverage` |
| Regenerate Swagger only | `make swagger` |

`go.mod` declares `go 1.25.3`; the Dockerfile uses `golang:alpine` with `GOTOOLCHAIN=auto` so the latest Go is fetched at build time.

### Frontend (`cd frontend`)

| Task | Command |
|------|---------|
| Install deps | `make install` (or `npm install`) |
| Dev server (`:4200`) | `make dev` |
| Production build | `make build-prod` |
| Lint | `make lint` |
| Lint with auto-fix | `make lint-fix` |
| Prettier write | `make format` |
| Prettier check | `make format-check` |
| Tests (Vitest via `ng test`) | `make test` |

### Full stack via Docker

```bash
docker-compose up --build   # backend :8080, frontend :4200
```

### Deployment

- Auto-deploys on push to `main` via `cloudbuild.yaml` (parallel build → push → deploy of both Cloud Run services).
- One-time GCP bootstrap: `./deploy.sh` (enables APIs, creates state bucket + Artifact Registry, runs `terraform apply`).
- Manual infra changes: `cd infra && terraform plan && terraform apply` (state lives in `gs://etfs-simulator-tf-state`).

## Architecture

### Backend layout

```
cmd/api/main.go               Entry: load config → init logger → init IndexService → start server
internal/
  config/      Env-driven Config + ServerConfig (validation in Load())
  server/      net/http wrapper with graceful shutdown on SIGINT/SIGTERM
  handler/     ServeMux routes, CORS middleware, simulation logic
                 - simulate.go            /years and /target endpoints (statistical projections)
                 - simulate_historical.go /historical endpoint ("what if" using real past prices)
                 - indexes.go             /api/v1/indexes (cached metadata)
                 - health.go, handler.go  router + CORS + JSON helpers
  marketdata/  Yahoo Finance client + IndexService (in-memory cache, 24h TTL)
  metrics/     Prometheus middleware (http_requests_total, _duration_seconds, _in_flight)
sdk/
  errors/      Custom error helpers — see "Coding style" below
  logger/      slog setup (InitDevelopment / InitProduction)
docs/          Auto-generated Swagger (do not edit; `make swagger` regenerates)
```

**Critical flow — historical data lifecycle:**
1. On startup, `marketdata.IndexService.Initialize()` loops over `DefaultSupportedIndexes` (defined in `indexservice.go`) and fetches 1mo/max history for each from Yahoo Finance.
2. For each symbol it computes 20-year rolling annualized returns, falling back to 10-year if there isn't enough history. The 5th, 50th, and 95th percentiles become `PessimisticReturn`, `MedianReturn`, `OptimisticReturn`.
3. Failures are logged and skipped — the service still starts even if some ETFs fail to fetch (only fully fails if **none** load).
4. `RefreshIfNeeded()` is invoked from the `/api/v1/indexes` handler and re-fetches asynchronously when `cacheTTL` (24h) elapses.

**Adding a new ETF:** append to `DefaultSupportedIndexes` in `internal/marketdata/indexservice.go` (US tickers plain, e.g. `SPY`; non-US use Yahoo exchange suffixes like `.L`, `.DE`). Mirror it in the frontend's `returnOptions` array in `simulation-form.component.ts`.

**Simulation engine — return-rate precedence (in `simulate.go`):** `Portfolio` > `IndexSymbol` > `AnnualReturnRate` (default 7.0). When an `IndexSymbol` or `Portfolio` is supplied, three simulations run (pessimistic/median/optimistic) and merge into a single response with `*Value` range pointers populated and `HasRange = true`.

### Frontend layout

```
src/app/
  app.config.ts            Providers: router, HttpClient (fetch), animations, ConfigService APP_INITIALIZER
  app.routes.ts            Single lazy route → SimulationPageComponent
  core/
    models/                TypeScript mirrors of backend DTOs (keep in sync!)
    services/
      api.service.ts       Typed wrappers for every endpoint
      config.service.ts    Loads /assets/config.json at startup (runtime apiUrl injection)
      theme.service.ts     Light/dark toggle persisted to localStorage
  features/simulation/     Page + form + results + growth-chart components
  shared/components/       custom-select, portfolio-allocator, theme-toggle, tooltip
```

**Runtime config (important):** the frontend reads `apiUrl` from `/assets/config.json` at boot, NOT from `environment.ts`. In Docker, the nginx entrypoint runs `envsubst` on `assets/config.json.template` to inject `$API_URL` from env. Locally, `ConfigService` falls back to `http://localhost:8080` if the file is missing or contains an unsubstituted `${...}` placeholder.

### Cross-cutting

- **CORS** is set in `handler.ServeHTTP`. `CORS_ALLOWED_ORIGINS=*` (default) allows any origin; otherwise it does an exact comma-separated allowlist match.
- **Type contract:** `frontend/src/app/core/models/simulation.model.ts` mirrors the Go DTOs in `backend/internal/handler/simulate.go` and `simulate_historical.go`. **When you change a request/response field on either side, update both.**
- **Endpoints:** `GET /health`, `GET /api/v1/indexes`, `POST /api/v1/simulate/{years,target,historical}`, `GET /metrics`, `GET /swagger/index.html`.

## Coding Style

### Go

- **Use the custom `errors` package, not raw `if err != nil`.** Import `github.com/abdonasmane/etfs-simulator/backend/sdk/errors` and write `if errors.Check(err) { return errors.Wrap(err, "context") }`. Available helpers: `Check`, `CheckAny`, `CheckAll`, `Collect`, `Combine`, `Wrap`, `Wrapf`, `New`, `Errorf`, `Is`, `As`. This pattern is consistent across the whole backend — match it.
- **Logging is `log/slog` only.** No `fmt.Println`, no `log.Printf`. Use structured attributes: `slog.Info("msg", slog.String("k", v), slog.Float64("k", v))`. The global logger is configured once in `main` via `logger.InitDevelopment()` / `logger.InitProduction()`.
- **Doc comments on every exported identifier** (package, type, func). Start with the identifier name. Section headers use `// --- Section Name ---` inside files (see `simulate.go`).
- **Linting:** `golangci-lint` enforces `govet`, `staticcheck`, `errcheck`, `ineffassign`, `unused`, `gosimple`, `gofmt`, `goimports`, `revive`. `goimports` groups local imports under the `github.com/abdonasmane/etfs-simulator/backend` prefix — let the tool order them; don't hand-edit imports.
- **Comments** explain *why* (pitfalls, hidden constraints, business rules), not *what*. Examples already in the code: the User-Agent on the Yahoo client (`// To avoid yahoo rate limiting`), the `lifecycle.ignore_changes` block in Terraform, the broad CORS comment. Don't add comments that just restate the next line.
- **Round helpers** (`round1`, `round2`, `roundTo2Decimals`) live next to the code that needs them — keep money/percent rounding consistent at response boundaries.
- **HTTP responses** go through `respondJSON` / `respondError` in `handler.go` — don't write to `http.ResponseWriter` directly.
- **Tests** that hit Yahoo Finance are in `internal/marketdata/yahoo_test.go` and make real network calls; treat them as integration tests.

### TypeScript / Angular

- **Standalone components only** (`standalone: true`, explicit `imports: [...]`). No NgModules. New routes use `loadComponent` for lazy loading.
- **DI via `inject()`**, not constructor parameters: `private readonly http = inject(HttpClient);`.
- **Selectors:** components are kebab-case `app-*` elements (e.g. `app-simulation-form`); directives are camelCase `app*` attributes. Enforced by `@angular-eslint`.
- **Templates** are external `.html` + `.scss` files via `templateUrl` / `styleUrl` (not inline) — see `simulation-form.component.ts` for the pattern.
- **Prettier config** (non-negotiable, runs in CI via `format-check`): single quotes, trailing comma `es5`, 2-space indent, semicolons on, 100-char line width, `arrowParens: avoid`. EditorConfig also enforces single quotes for `.ts`.
- **ESLint rules to satisfy:** `@typescript-eslint/explicit-function-return-type` (warn — annotate return types), `prefer-const` (error), `@typescript-eslint/no-unused-vars` with `^_` ignore prefix.
- **Doc comments** with JSDoc `/** */` on exported interfaces, components, and public methods. Match the existing tone — concise, one-line where possible, multi-line only when documenting fields.
- **Styles** are SCSS, themed via CSS custom properties on `:root` and `[data-theme="dark"]` (see `src/styles.scss`). Component styles use those variables — don't hardcode colors.
- **API calls** go through `ApiService` (`core/services/api.service.ts`) — components don't call `HttpClient` directly. Errors are normalized in `handleError` to a plain `Error` with a user-friendly message.

### General

- Don't add comments that describe what the code already says or that reference the current task/PR.
- Don't introduce abstractions, configuration knobs, or backwards-compat shims that aren't needed right now.
- Match existing patterns rather than introducing new ones; this codebase is small enough that consistency matters more than cleverness.

## Configuration

### Backend env vars (loaded in `internal/config/config.go`)

| Var | Default | Notes |
|-----|---------|-------|
| `APP_ENV` | `development` | Must be `development`, `staging`, or `production`. Controls log level. |
| `SERVER_HOST` | `0.0.0.0` | |
| `SERVER_PORT` | `8080` | |
| `SERVER_READ_TIMEOUT` / `WRITE_TIMEOUT` / `IDLE_TIMEOUT` / `SHUTDOWN_TIMEOUT` | 5s / 10s / 120s / 30s | Go `time.ParseDuration` format. |
| `CORS_ALLOWED_ORIGINS` | `*` | Comma-separated allowlist or `*`. |

### Frontend runtime config

`src/assets/config.json` (or `config.json.template` in the Docker image) is read at app startup. The only field used today is `apiUrl`. **Don't put backend URLs in `environment.ts`** — that file is effectively unused for `apiUrl` because `ConfigService` overrides it.

## Things to know before changing

- **Adding a new endpoint:** register it in `handler.registerRoutes()`, add the `@Summary`/`@Router` Swagger comments above the handler, run `make swagger`, then add the typed model and method in `frontend/src/app/core/models/` and `api.service.ts`.
- **Touching `cloudbuild.yaml`:** every change ships on the next push to `main`. Test image builds locally with `docker-compose up --build` first.
- **Touching Terraform:** the `lifecycle.ignore_changes = [template[0].containers[0].image]` blocks on both Cloud Run services are intentional — Cloud Build owns the image tag, Terraform owns everything else. Don't remove them.
- **Yahoo Finance is rate-limited and unauthenticated.** The `User-Agent` header in `yahoo.go` exists to avoid being blocked; tests make real calls.

# Infrastructure & Deployment

## Architecture

```
GitHub (push to main)
  → Cloud Build (build backend + frontend images in parallel)
    → Artifact Registry (store images)
      → Cloud Run (deploy backend + frontend services)
```

- **Cloud Run** — two services: `etfs-simulator-backend` (Go API on :8080) and `etfs-simulator-frontend` (Angular + nginx on :80)
- **Artifact Registry** — private Docker repo `etfs-simulator` (keeps last 3 images per repo)
- **Cloud Build** — CI/CD triggered on every push to `main`
- **GCS bucket** — Terraform state in `gs://etfs-simulator-tf-state`

The frontend reads `API_URL` at runtime: nginx's entrypoint runs `envsubst` on `assets/config.json.template` before starting, so the Angular SPA picks up the backend Cloud Run URL.

## GCP Project

This project shares the `downloadclip-prod` GCP project (project number 355789020017) — everything is namespaced with `etfs-simulator-*` resource names.

## Live URLs

| Service | URL |
|---------|-----|
| Frontend | https://etfs-simulator-frontend-xkamugcowq-uw.a.run.app |
| Backend | https://etfs-simulator-backend-xkamugcowq-uw.a.run.app |
| Builds | [Cloud Build History](https://console.cloud.google.com/cloud-build/builds?project=downloadclip-prod) |
| Backend logs | [Cloud Run Logs](https://console.cloud.google.com/run/detail/us-west1/etfs-simulator-backend/logs?project=downloadclip-prod) |
| Frontend logs | [Cloud Run Logs](https://console.cloud.google.com/run/detail/us-west1/etfs-simulator-frontend/logs?project=downloadclip-prod) |

## Project Structure

```
infra/
  main.tf              Both Cloud Run services, Artifact Registry, IAM
  variables.tf         Project ID, region
  terraform.tfvars     Actual values
  backend.tf           Remote state in GCS
cloudbuild.yaml        Build + push + deploy pipeline (both services)
deploy.sh              One-time bootstrap script
```

## How Auto-Deploy Works

1. Push to `main`
2. Cloud Build trigger fires
3. Backend image built from `backend/Dockerfile`, frontend from `frontend/Dockerfile` (in parallel)
4. Both images pushed to `us-west1-docker.pkg.dev/downloadclip-prod/etfs-simulator/{backend,frontend}`
5. Both Cloud Run services updated with new images
6. Traffic shifts to new revisions (zero downtime)

Build logs: [Cloud Build console](https://console.cloud.google.com/cloud-build/builds?project=downloadclip-prod).

## Cloud Run Configuration

| Setting | Backend | Frontend |
|---------|---------|----------|
| Region | us-west1 | us-west1 |
| CPU | 1 vCPU | 1 vCPU |
| Memory | 512 MiB | 512 MiB |
| Min instances | 0 (scales to zero) | 0 |
| Max instances | 2 | 2 |
| Container port | 8080 | 80 |
| Request timeout | 120s | default |

## Environment Variables

### Backend
| Var | Value |
|-----|-------|
| `APP_ENV` | `production` |
| `SERVER_HOST` | `0.0.0.0` |
| `SERVER_PORT` | `8080` |
| `CORS_ALLOWED_ORIGINS` | `*` (loosen now, tighten later — see below) |

### Frontend
| Var | Value |
|-----|-------|
| `API_URL` | Backend Cloud Run URL (wired by Terraform) |

## CORS

The backend defaults to `CORS_ALLOWED_ORIGINS=*` because it's a public read-only API. To restrict it to the frontend only after first deploy:

```bash
cd infra
# Edit main.tf: change CORS_ALLOWED_ORIGINS value to the frontend URL
terraform apply
```

## First-Time Setup

```bash
./deploy.sh
```

This script:
1. Enables required APIs
2. Creates the Terraform state bucket if missing
3. Creates the Artifact Registry repo and builds initial backend + frontend images
4. Runs `terraform apply` to provision Cloud Run services + IAM
5. Prints instructions for connecting the GitHub trigger (one-time, manual via console)

## Cost

Stays within GCP free tier for light usage:
- Cloud Run: 2M req/month, 360K vCPU-seconds free
- Artifact Registry: 500MB free (cleanup keeps 3 images per repo)
- Cloud Build: 120 build-minutes/day free
- No VMs, no fixed costs

## Collaboration

### Code Changes

1. Branch from `main`, make changes, test locally with `docker-compose up --build`
2. PR against `main` — once merged, Cloud Build auto-deploys
3. No manual deploy steps

### Infra Changes

Terraform state is in `gs://etfs-simulator-tf-state`, so multiple people can manage infra safely.

```bash
cd infra
terraform init    # pulls remote state
terraform plan    # always plan first
terraform apply
```

Commit `.tf` changes so everyone stays in sync.

### Rules

- Never push directly to `main` — use PRs
- Never commit secrets — `.gitignore` covers `.json` keys
- Always `terraform plan` before `apply`
- `cloudbuild.yaml` is the deploy pipeline — changes here affect every deploy
- Local dev uses `docker-compose.yml`; prod runs the same images on Cloud Run

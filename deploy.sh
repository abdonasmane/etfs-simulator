#!/bin/bash
set -euo pipefail

PROJECT="downloadclip-prod"
REGION="us-west1"
STATE_BUCKET="etfs-simulator-tf-state"

echo "=== ETFs Simulator GCP Deployment ==="

# ── 1. Enable APIs ──
echo "[1/5] Enabling APIs..."
gcloud config set project $PROJECT --quiet
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  storage.googleapis.com \
  --quiet

# ── 2. Create Terraform state bucket if missing ──
echo "[2/5] Ensuring Terraform state bucket exists..."
if ! gcloud storage buckets describe "gs://$STATE_BUCKET" --quiet >/dev/null 2>&1; then
  gcloud storage buckets create "gs://$STATE_BUCKET" \
    --location=$REGION \
    --uniform-bucket-level-access \
    --quiet
  gcloud storage buckets update "gs://$STATE_BUCKET" --versioning --quiet
fi

# ── 3. Build & push initial images (so Terraform has something to deploy) ──
echo "[3/5] Building and pushing initial images..."
ensure_repo() {
  gcloud artifacts repositories describe etfs-simulator --location=$REGION --quiet >/dev/null 2>&1 || \
    gcloud artifacts repositories create etfs-simulator \
      --repository-format=docker \
      --location=$REGION \
      --quiet
}
ensure_repo

gcloud builds submit backend \
  --tag "$REGION-docker.pkg.dev/$PROJECT/etfs-simulator/backend:latest" \
  --timeout=600 \
  --quiet

gcloud builds submit frontend \
  --tag "$REGION-docker.pkg.dev/$PROJECT/etfs-simulator/frontend:latest" \
  --timeout=600 \
  --quiet

# ── 4. Terraform ──
echo "[4/5] Running Terraform..."
cd "$(dirname "$0")/infra"
terraform init -input=false

# The AR repo was created by step [3] above (so the initial builds had
# somewhere to push). Import it into Terraform state if it isn't already
# managed, otherwise apply would 409.
if ! terraform state list 2>/dev/null | grep -q '^google_artifact_registry_repository.repo$'; then
  terraform import -input=false \
    google_artifact_registry_repository.repo \
    "projects/$PROJECT/locations/$REGION/repositories/etfs-simulator"
fi

terraform apply -auto-approve

BACKEND_URL=$(terraform output -raw backend_url)
FRONTEND_URL=$(terraform output -raw frontend_url)

# ── 5. Connect GitHub for auto-deploy ──
echo ""
echo "[5/5] Connect GitHub for auto-deploy:"
echo "  1. Go to: https://console.cloud.google.com/cloud-build/triggers?project=$PROJECT"
echo "  2. Click 'Create Trigger'"
echo "  3. Source: GitHub → authenticate → pick abdonasmane/etfs-simulator"
echo "  4. Event: Push to branch → ^main$"
echo "  5. Config: Cloud Build config file → cloudbuild.yaml"
echo "  6. Click Create"
echo ""
echo "=== Done! ==="
echo "Backend:  $BACKEND_URL"
echo "Frontend: $FRONTEND_URL"
echo "Every push to main auto-deploys."

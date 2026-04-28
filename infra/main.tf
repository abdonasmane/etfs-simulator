provider "google" {
  project = var.project_id
  region  = var.region
}

# ── Enable required APIs ──
resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
  ])
  service            = each.value
  disable_on_destroy = false
}

# ── Artifact Registry ──
resource "google_artifact_registry_repository" "repo" {
  location      = var.region
  repository_id = "etfs-simulator"
  format        = "DOCKER"

  cleanup_policies {
    id     = "keep-latest-3"
    action = "KEEP"
    most_recent_versions {
      keep_count = 3
    }
  }

  depends_on = [google_project_service.apis]
}

# ── Backend Cloud Run service (Go API) ──
resource "google_cloud_run_v2_service" "backend" {
  name     = "etfs-simulator-backend"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/etfs-simulator/backend:latest"

      ports {
        container_port = 8080
      }

      env {
        name  = "APP_ENV"
        value = "production"
      }

      env {
        name  = "SERVER_HOST"
        value = "0.0.0.0"
      }

      env {
        name  = "SERVER_PORT"
        value = "8080"
      }

      # Public read-only API — broad CORS is intentional. Tighten to the
      # frontend URL after first deploy if you want to lock it down.
      env {
        name  = "CORS_ALLOWED_ORIGINS"
        value = "*"
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      startup_probe {
        http_get {
          path = "/health"
          port = 8080
        }
        initial_delay_seconds = 2
        period_seconds        = 3
        failure_threshold     = 5
      }
    }

    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }

    timeout = "120s"
  }

  depends_on = [google_project_service.apis]

  lifecycle {
    ignore_changes = [template[0].containers[0].image]
  }
}

# ── Frontend Cloud Run service (Angular + nginx) ──
resource "google_cloud_run_v2_service" "frontend" {
  name     = "etfs-simulator-frontend"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/etfs-simulator/frontend:latest"

      ports {
        container_port = 80
      }

      # nginx entrypoint runs envsubst on assets/config.json at boot,
      # so the Angular app reads the backend URL at runtime.
      env {
        name  = "API_URL"
        value = google_cloud_run_v2_service.backend.uri
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }
    }

    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }
  }

  depends_on = [google_project_service.apis]

  lifecycle {
    ignore_changes = [template[0].containers[0].image]
  }
}

# ── Allow unauthenticated access ──
resource "google_cloud_run_v2_service_iam_member" "backend_public" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.backend.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service_iam_member" "frontend_public" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.frontend.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ── Grant Cloud Build deploy permissions ──
data "google_project" "project" {}

resource "google_project_iam_member" "cloudbuild_run" {
  project    = var.project_id
  role       = "roles/run.developer"
  member     = "serviceAccount:${data.google_project.project.number}@cloudbuild.gserviceaccount.com"
  depends_on = [google_project_service.apis]
}

resource "google_project_iam_member" "cloudbuild_ar" {
  project    = var.project_id
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${data.google_project.project.number}@cloudbuild.gserviceaccount.com"
  depends_on = [google_project_service.apis]
}

resource "google_project_iam_member" "cloudbuild_sa_user" {
  project    = var.project_id
  role       = "roles/iam.serviceAccountUser"
  member     = "serviceAccount:${data.google_project.project.number}@cloudbuild.gserviceaccount.com"
  depends_on = [google_project_service.apis]
}

# ── Outputs ──
output "backend_url" {
  value = google_cloud_run_v2_service.backend.uri
}

output "frontend_url" {
  value = google_cloud_run_v2_service.frontend.uri
}

output "backend_image" {
  value = "${var.region}-docker.pkg.dev/${var.project_id}/etfs-simulator/backend"
}

output "frontend_image" {
  value = "${var.region}-docker.pkg.dev/${var.project_id}/etfs-simulator/frontend"
}

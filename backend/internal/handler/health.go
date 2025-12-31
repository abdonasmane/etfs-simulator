package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"time"
)

// HealthResponse represents the response structure for health check endpoints.
type HealthResponse struct {
	// Status indicates the overall health status ("healthy", "degraded", "unhealthy").
	Status string `json:"status"`

	// Timestamp is the server time when the health check was performed.
	Timestamp string `json:"timestamp"`

	// Version is the application version (if available).
	Version string `json:"version,omitempty"`
}

// handleHealth returns the overall health status of the application.
// This endpoint is typically used by load balancers and monitoring systems.
//
// Responses:
//   - 200 OK: The service is healthy and ready to accept requests.
//   - 503 Service Unavailable: The service is unhealthy.
func (h *Handler) handleHealth(w http.ResponseWriter, r *http.Request) {
	slog.Debug("health check requested",
		slog.String("remote_addr", r.RemoteAddr),
		slog.String("user_agent", r.UserAgent()),
	)

	response := HealthResponse{
		Status:    "healthy",
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}

	h.respondJSON(w, http.StatusOK, response)
}

// handleLiveness indicates whether the application is running.
// Used by Kubernetes liveness probes. If this fails, the container will be restarted.
//
// Responses:
//   - 200 OK: The application process is running.
//   - 503 Service Unavailable: The application is in a broken state.
func (h *Handler) handleLiveness(w http.ResponseWriter, r *http.Request) {
	slog.Debug("liveness check requested",
		slog.String("remote_addr", r.RemoteAddr),
	)

	response := HealthResponse{
		Status:    "alive",
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}

	h.respondJSON(w, http.StatusOK, response)
}

// handleReadiness indicates whether the application is ready to accept traffic.
// Used by Kubernetes readiness probes. If this fails, traffic won't be routed to this pod.
//
// Responses:
//   - 200 OK: The application is ready to handle requests.
//   - 503 Service Unavailable: The application is not ready (e.g., dependencies unavailable).
func (h *Handler) handleReadiness(w http.ResponseWriter, r *http.Request) {
	slog.Debug("readiness check requested",
		slog.String("remote_addr", r.RemoteAddr),
	)

	// TODO: Add actual readiness checks (database, cache, external services)
	// For now, if the server is running, it's ready.

	response := HealthResponse{
		Status:    "ready",
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}

	h.respondJSON(w, http.StatusOK, response)
}

// respondJSON writes a JSON response with the given status code.
// It sets appropriate headers and handles encoding errors gracefully.
func (h *Handler) respondJSON(w http.ResponseWriter, statusCode int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)

	if err := json.NewEncoder(w).Encode(data); err != nil {
		slog.Error("failed to encode JSON response",
			slog.String("error", err.Error()),
		)
	}
}

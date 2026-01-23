// Package handler provides HTTP request handlers for the API.
package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"

	httpSwagger "github.com/swaggo/http-swagger/v2"

	"github.com/abdonasmane/etfs-simulator/backend/internal/marketdata"
	"github.com/abdonasmane/etfs-simulator/backend/internal/metrics"
	"github.com/abdonasmane/etfs-simulator/backend/sdk/errors"
)

// Handler is the main HTTP handler that routes requests.
type Handler struct {
	mux                *http.ServeMux
	indexService       *marketdata.IndexService
	metrics            *metrics.Metrics
	corsAllowedOrigins string
}

// New creates a new Handler with all routes registered.
func New(indexService *marketdata.IndexService, m *metrics.Metrics, corsAllowedOrigins string) *Handler {
	h := &Handler{
		mux:                http.NewServeMux(),
		indexService:       indexService,
		metrics:            m,
		corsAllowedOrigins: corsAllowedOrigins,
	}

	h.registerRoutes()
	return h
}

// ServeHTTP implements the http.Handler interface with CORS support and metrics.
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Set CORS headers for all requests
	origin := r.Header.Get("Origin")
	allowedOrigin := h.getAllowedOrigin(origin)
	if allowedOrigin != "" {
		w.Header().Set("Access-Control-Allow-Origin", allowedOrigin)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Credentials", "true")
	}

	// Handle preflight requests
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	// Apply metrics middleware
	h.metrics.Middleware(h.mux).ServeHTTP(w, r)
}

// getAllowedOrigin checks if the request origin is allowed and returns the origin to use.
func (h *Handler) getAllowedOrigin(origin string) string {
	// If "*" is configured, allow all origins
	if h.corsAllowedOrigins == "*" {
		return "*"
	}

	// Check if the origin is in the allowed list
	allowedOrigins := strings.Split(h.corsAllowedOrigins, ",")
	for _, allowed := range allowedOrigins {
		allowed = strings.TrimSpace(allowed)
		if allowed == origin {
			return origin
		}
	}

	return ""
}

// registerRoutes sets up all API routes.
func (h *Handler) registerRoutes() {
	// Swagger UI
	h.mux.Handle("GET /swagger/", httpSwagger.Handler(
		httpSwagger.URL("/swagger/doc.json"),
	))

	// Health check
	h.mux.HandleFunc("GET /health", handleHealth)

	// Prometheus metrics
	h.mux.Handle("GET /metrics", metrics.Handler())

	// Index data endpoints
	h.mux.HandleFunc("GET /api/v1/indexes", h.handleGetIndexes)

	// Simulation endpoints
	h.mux.HandleFunc("POST /api/v1/simulate/years", h.handleSimulateByYears)
	h.mux.HandleFunc("POST /api/v1/simulate/target", h.handleSimulateByTarget)
}

// ErrorResponse is the standard error response.
type ErrorResponse struct {
	Error string `json:"error" example:"invalid request"`
}

// respondJSON writes a JSON response.
func respondJSON(w http.ResponseWriter, statusCode int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)

	if err := json.NewEncoder(w).Encode(data); errors.Check(err) {
		slog.Error("failed to encode JSON response",
			slog.String("error", err.Error()),
		)
	}
}

// respondError writes an error response.
func respondError(w http.ResponseWriter, statusCode int, message string) {
	respondJSON(w, statusCode, ErrorResponse{Error: message})
}

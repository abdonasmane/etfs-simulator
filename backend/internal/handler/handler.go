// Package handler provides HTTP request handlers for the API.
package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"

	httpSwagger "github.com/swaggo/http-swagger/v2"

	"github.com/abdonasmane/etfs-simulator/backend/internal/marketdata"
	"github.com/abdonasmane/etfs-simulator/backend/sdk/errors"
)

// Handler is the main HTTP handler that routes requests.
type Handler struct {
	mux          *http.ServeMux
	indexService *marketdata.IndexService
}

// New creates a new Handler with all routes registered.
func New(indexService *marketdata.IndexService) *Handler {
	h := &Handler{
		mux:          http.NewServeMux(),
		indexService: indexService,
	}

	h.registerRoutes()
	return h
}

// ServeHTTP implements the http.Handler interface with CORS support.
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Set CORS headers for all requests
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

	// Handle preflight requests
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	h.mux.ServeHTTP(w, r)
}

// registerRoutes sets up all API routes.
func (h *Handler) registerRoutes() {
	// Swagger UI
	h.mux.Handle("GET /swagger/", httpSwagger.Handler(
		httpSwagger.URL("/swagger/doc.json"),
	))

	// Health check
	h.mux.HandleFunc("GET /health", handleHealth)

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

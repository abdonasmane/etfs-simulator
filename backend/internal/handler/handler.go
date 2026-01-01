// Package handler provides HTTP request handlers for the API.
package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"

	httpSwagger "github.com/swaggo/http-swagger/v2"

	"github.com/abdonasmane/etfs-simulator/backend/sdk/errors"
	_ "github.com/abdonasmane/etfs-simulator/backend/swagger-docs" // swagger docs
)

// Handler is the main HTTP handler that routes requests.
type Handler struct {
	mux *http.ServeMux
}

// New creates a new Handler with all routes registered.
func New() *Handler {
	h := &Handler{
		mux: http.NewServeMux(),
	}

	h.registerRoutes()
	return h
}

// ServeHTTP implements the http.Handler interface.
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
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

	// Simulation endpoints
	h.mux.HandleFunc("POST /api/v1/simulate/years", handleSimulateByYears)
	h.mux.HandleFunc("POST /api/v1/simulate/target", handleSimulateByTarget)
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

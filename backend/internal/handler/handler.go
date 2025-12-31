// Package handler provides HTTP request handlers for the API.
// It follows a clean architecture pattern where handlers depend on
// abstractions rather than concrete implementations.
package handler

import (
	"net/http"
)

// Handler is the main HTTP handler that routes requests to appropriate endpoints.
// It encapsulates all dependencies needed by the API handlers.
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
// It delegates all requests to the internal router.
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	h.mux.ServeHTTP(w, r)
}

// registerRoutes sets up all API routes.
// Routes are organized by resource and HTTP method.
func (h *Handler) registerRoutes() {
	// Health check endpoints
	h.mux.HandleFunc("GET /health", h.handleHealth)
	h.mux.HandleFunc("GET /health/live", h.handleLiveness)
	h.mux.HandleFunc("GET /health/ready", h.handleReadiness)
}

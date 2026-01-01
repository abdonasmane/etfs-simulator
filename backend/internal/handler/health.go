package handler

import (
	"net/http"
	"time"
)

// HealthResponse represents the response structure for health check.
type HealthResponse struct {
	// Status is the health status of the application.
	Status string `json:"status" example:"healthy"`

	// Timestamp is the timestamp of the health check.
	Timestamp string `json:"timestamp" example:"2024-01-01T12:00:00Z"`
}

// handleHealth returns the health status of the application.
//
//	@Summary		Health check
//	@Description	Returns the health status of the API
//	@Tags			health
//	@Produce		json
//	@Success		200	{object}	HealthResponse
//	@Router			/health [get]
func handleHealth(w http.ResponseWriter, _ *http.Request) {
	response := HealthResponse{
		Status:    "healthy",
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}
	respondJSON(w, http.StatusOK, response)
}

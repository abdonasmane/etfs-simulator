package handler

import (
	"net/http"

	"github.com/abdonasmane/etfs-simulator/backend/internal/marketdata"
)

// IndexesResponse is the response for the GET /api/v1/indexes endpoint.
type IndexesResponse struct {
	Indexes []*marketdata.IndexInfo `json:"indexes"`
}

// handleGetIndexes returns all available market indexes with their statistics.
// @Summary Get available market indexes
// @Description Returns all supported market indexes with their historical return statistics
// @Tags indexes
// @Produce json
// @Success 200 {object} IndexesResponse
// @Router /api/v1/indexes [get]
func (h *Handler) handleGetIndexes(w http.ResponseWriter, _ *http.Request) {
	// Trigger background refresh if cache is stale
	h.indexService.RefreshIfNeeded()

	indexes := h.indexService.GetAllIndexes()

	respondJSON(w, http.StatusOK, IndexesResponse{
		Indexes: indexes,
	})
}

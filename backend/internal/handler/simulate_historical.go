package handler

import (
	"encoding/json"
	"log/slog"
	"math"
	"net/http"
	"time"

	"github.com/abdonasmane/etfs-simulator/backend/sdk/errors"
)

// --- Request / Response Types ---

// SimulateHistoricalRequest is the input for a "what if" historical simulation.
// It replays actual market data from a past date to today.
type SimulateHistoricalRequest struct {
	// InitialInvestment is the starting amount.
	InitialInvestment float64 `json:"initialInvestment" example:"1000"`

	// MonthlyContribution is the starting monthly contribution amount.
	MonthlyContribution float64 `json:"monthlyContribution" example:"500"`

	// StartYear is the year when the investment would have started (>= 1993).
	StartYear int `json:"startYear" example:"2010"`

	// StartMonth is the month when the investment would have started (1-12).
	StartMonth int `json:"startMonth" example:"1"`

	// Portfolio is a list of ETF allocations. Takes precedence over IndexSymbol.
	Portfolio []PortfolioAllocation `json:"portfolio,omitempty"`

	// IndexSymbol is the ETF symbol (e.g., "SPY"). Used when Portfolio is not provided.
	IndexSymbol *string `json:"indexSymbol,omitempty" example:"SPY"`

	// ContributionGrowthRate is the annual percentage increase in contributions (default: 0).
	ContributionGrowthRate *float64 `json:"contributionGrowthRate,omitempty" example:"3.0"`
}

// HistoricalSimulateSummary contains the actual results of a historical simulation.
type HistoricalSimulateSummary struct {
	StartDate                string                  `json:"startDate" example:"January 2010"`
	EndDate                  string                  `json:"endDate" example:"April 2026"`
	FinalValue               float64                 `json:"finalValue" example:"147382.50"`
	TotalContributed         float64                 `json:"totalContributed" example:"97000"`
	TotalGain                float64                 `json:"totalGain" example:"50382.50"`
	PercentageGain           float64                 `json:"percentageGain" example:"51.9"`
	TotalMonths              int                     `json:"totalMonths" example:"195"`
	AnnualizedReturn         float64                 `json:"annualizedReturn" example:"8.7"`
	FinalMonthlyContribution float64                 `json:"finalMonthlyContribution" example:"500"`
	ContributionMilestones   []ContributionMilestone `json:"contributionMilestones"`
	Portfolio                []PortfolioBreakdown    `json:"portfolio,omitempty"`
}

// SimulateHistoricalResponse is the output for a historical simulation.
type SimulateHistoricalResponse struct {
	Inputs      SimulateHistoricalRequest `json:"inputs"`
	Projections []MonthProjection         `json:"projections"`
	Summary     HistoricalSimulateSummary `json:"summary"`
}

// --- Handler ---

// handleSimulateHistorical runs a "what if" simulation using real historical price data.
//
//	@Summary		Simulate using historical data
//	@Description	Replays actual market returns from a past date to today to show what a portfolio would be worth
//	@Tags			simulation
//	@Accept			json
//	@Produce		json
//	@Param			request	body		SimulateHistoricalRequest	true	"Simulation parameters"
//	@Success		200		{object}	SimulateHistoricalResponse
//	@Failure		400		{object}	ErrorResponse
//	@Router			/api/v1/simulate/historical [post]
func (h *Handler) handleSimulateHistorical(w http.ResponseWriter, r *http.Request) {
	var req SimulateHistoricalRequest
	if err := json.NewDecoder(r.Body).Decode(&req); errors.Check(err) {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Validate inputs
	if req.InitialInvestment < 0 {
		respondError(w, http.StatusBadRequest, "initialInvestment must be >= 0")
		return
	}
	if req.MonthlyContribution < 0 {
		respondError(w, http.StatusBadRequest, "monthlyContribution must be >= 0")
		return
	}
	if req.StartMonth < 1 || req.StartMonth > 12 {
		respondError(w, http.StatusBadRequest, "startMonth must be between 1 and 12")
		return
	}
	if req.StartYear < 1993 {
		respondError(w, http.StatusBadRequest, "startYear must be 1993 or later (earliest ETF data available)")
		return
	}

	now := time.Now()
	startDate := time.Date(req.StartYear, time.Month(req.StartMonth), 1, 0, 0, 0, 0, time.UTC)

	// Need at least 2 months of data to compute a return
	if !startDate.Before(now.AddDate(0, -1, 0)) {
		respondError(w, http.StatusBadRequest, "start date must be at least 1 month in the past")
		return
	}

	// Apply defaults
	contributionGrowth := applyDefault(req.ContributionGrowthRate, 0.0)
	req.ContributionGrowthRate = &contributionGrowth

	if contributionGrowth < 0 || contributionGrowth > 20 {
		respondError(w, http.StatusBadRequest, "contributionGrowthRate must be between 0 and 20")
		return
	}

	// Resolve symbols and weights from portfolio or single index
	symbols, weights, portfolioBreakdown, err := h.resolveHistoricalAllocations(req)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Fetch actual historical prices for all symbols
	// We fetch from one month before startDate to get the baseline price
	fetchStart := startDate.AddDate(0, -1, 0)
	pricesBySymbol := make(map[string]map[string]float64)

	for _, symbol := range symbols {
		data, fetchErr := h.indexService.FetchHistoricalPrices(symbol, fetchStart, now)
		if errors.Check(fetchErr) {
			respondError(w, http.StatusBadRequest,
				"failed to fetch historical data for "+symbol+": "+fetchErr.Error()+
					". This ETF may not have data going back that far.")
			return
		}

		priceMap := make(map[string]float64)
		for _, p := range data.DataPoints {
			key := p.Date.Format("2006-01")
			priceMap[key] = p.AdjClose
		}
		pricesBySymbol[symbol] = priceMap
	}

	// Run historical simulation
	projections, summary, simErr := runHistoricalSimulation(
		req.InitialInvestment,
		req.MonthlyContribution,
		startDate,
		now,
		symbols,
		weights,
		pricesBySymbol,
		contributionGrowth,
	)
	if errors.Check(simErr) {
		respondError(w, http.StatusBadRequest, simErr.Error())
		return
	}

	if len(portfolioBreakdown) > 0 {
		summary.Portfolio = portfolioBreakdown
	}

	slog.Debug("historical simulation completed",
		slog.Float64("initial", req.InitialInvestment),
		slog.Float64("monthly", req.MonthlyContribution),
		slog.String("start", summary.StartDate),
		slog.String("end", summary.EndDate),
		slog.Float64("final_value", summary.FinalValue),
		slog.Int("months", summary.TotalMonths),
	)

	respondJSON(w, http.StatusOK, SimulateHistoricalResponse{
		Inputs:      req,
		Projections: projections,
		Summary:     summary,
	})
}

// resolveHistoricalAllocations extracts symbols, weights, and breakdown from the request.
func (h *Handler) resolveHistoricalAllocations(req SimulateHistoricalRequest) (
	symbols []string,
	weights []float64,
	breakdown []PortfolioBreakdown,
	err error,
) {
	if len(req.Portfolio) > 0 {
		var totalWeight float64
		for _, a := range req.Portfolio {
			if a.Weight <= 0 {
				return nil, nil, nil, errors.New("weight must be positive for symbol: " + a.Symbol)
			}
			totalWeight += a.Weight
		}
		if math.Abs(totalWeight-100) > 0.01 {
			return nil, nil, nil, errors.New("portfolio weights must sum to 100")
		}

		for _, a := range req.Portfolio {
			symbols = append(symbols, a.Symbol)
			weights = append(weights, a.Weight/100.0)

			name := a.Symbol
			medianReturn := 0.0
			if info, ok := h.indexService.GetIndex(a.Symbol); ok {
				name = info.Name
				medianReturn = round1(info.MedianReturn)
			}
			breakdown = append(breakdown, PortfolioBreakdown{
				Symbol:       a.Symbol,
				Name:         name,
				Weight:       a.Weight,
				MedianReturn: medianReturn,
			})
		}
		return symbols, weights, breakdown, nil
	}

	if req.IndexSymbol != nil && *req.IndexSymbol != "" {
		return []string{*req.IndexSymbol}, []float64{1.0}, nil, nil
	}

	return nil, nil, nil, errors.New("either indexSymbol or portfolio must be provided")
}

// --- Core Simulation Logic ---

// runHistoricalSimulation replays actual monthly price returns from startDate to endDate.
// Each month's return is derived from real adjusted-close prices fetched from Yahoo Finance.
func runHistoricalSimulation(
	initial, monthlyBase float64,
	startDate, endDate time.Time,
	symbols []string,
	weights []float64,
	pricesBySymbol map[string]map[string]float64,
	contributionGrowth float64,
) ([]MonthProjection, HistoricalSimulateSummary, error) {
	monthlyContributionGrowth := math.Pow(1+contributionGrowth/100, 1.0/12.0) - 1

	balance := initial
	totalContributed := initial
	currentContribution := monthlyBase
	projections := make([]MonthProjection, 0)

	// Walk month by month: prevDate is the baseline, curDate is the month we're projecting
	prevDate := startDate.AddDate(0, -1, 0)
	curDate := startDate

	for !curDate.After(endDate) {
		prevKey := prevDate.Format("2006-01")
		curKey := curDate.Format("2006-01")

		// Compute blended return across all symbols for this month
		blendedReturn, dataOK := computeBlendedReturn(symbols, weights, pricesBySymbol, prevKey, curKey)
		if !dataOK {
			// Missing data for this month — advance without recording
			prevDate = curDate
			curDate = curDate.AddDate(0, 1, 0)
			continue
		}

		// Apply market return then add monthly contribution
		balance = balance*(1+blendedReturn) + currentContribution
		totalContributed += currentContribution

		projections = append(projections, MonthProjection{
			Year:                curDate.Year(),
			Month:               int(curDate.Month()),
			MonthlyContribution: round2(currentContribution),
			TotalContributed:    round2(totalContributed),
			PortfolioValue:      round2(balance),
		})

		currentContribution *= (1 + monthlyContributionGrowth)

		prevDate = curDate
		curDate = curDate.AddDate(0, 1, 0)
	}

	if len(projections) == 0 {
		return nil, HistoricalSimulateSummary{}, errors.New(
			"no historical data available for the specified period and symbols — " +
				"the ETF may not have existed at that date")
	}

	summary := buildHistoricalSummary(projections, startDate, endDate)
	return projections, summary, nil
}

// computeBlendedReturn calculates the weighted average return for a given month.
func computeBlendedReturn(
	symbols []string,
	weights []float64,
	pricesBySymbol map[string]map[string]float64,
	prevKey, curKey string,
) (float64, bool) {
	var blended float64
	for i, symbol := range symbols {
		prices := pricesBySymbol[symbol]
		prevPrice, hasPrev := prices[prevKey]
		curPrice, hasCur := prices[curKey]

		if !hasPrev || !hasCur || prevPrice <= 0 || curPrice <= 0 {
			return 0, false
		}

		blended += weights[i] * (curPrice/prevPrice - 1)
	}
	return blended, true
}

// buildHistoricalSummary constructs the summary from completed projections.
func buildHistoricalSummary(projections []MonthProjection, startDate, endDate time.Time) HistoricalSimulateSummary {
	final := projections[len(projections)-1]
	totalGain := final.PortfolioValue - final.TotalContributed

	percentageGain := 0.0
	if final.TotalContributed > 0 {
		percentageGain = round1((totalGain / final.TotalContributed) * 100)
	}

	totalMonths := len(projections)
	totalYears := float64(totalMonths) / 12.0

	// Approximate annualized return: CAGR of value vs. contributed (informational only)
	annualizedReturn := 0.0
	if totalYears >= 1 && final.TotalContributed > 0 && final.PortfolioValue > 0 {
		annualizedReturn = round1((math.Pow(final.PortfolioValue/final.TotalContributed, 1.0/totalYears) - 1) * 100)
	}

	milestones := buildContributionMilestones(projections, startDate.Year())

	return HistoricalSimulateSummary{
		StartDate:                startDate.Format("January 2006"),
		EndDate:                  time.Date(final.Year, time.Month(final.Month), 1, 0, 0, 0, 0, time.UTC).Format("January 2006"),
		FinalValue:               round2(final.PortfolioValue),
		TotalContributed:         round2(final.TotalContributed),
		TotalGain:                round2(totalGain),
		PercentageGain:           percentageGain,
		TotalMonths:              totalMonths,
		AnnualizedReturn:         annualizedReturn,
		FinalMonthlyContribution: final.MonthlyContribution,
		ContributionMilestones:   milestones,
	}
}

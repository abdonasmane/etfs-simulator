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

	// Reject start dates that predate any selected ETF's first data point.
	// Without this check, the simulation would silently clip to the latest
	// common start month and report a shorter duration than the user asked for.
	if err := h.validateSymbolCoverage(symbols, startDate); errors.Check(err) {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Fetch actual historical prices for all symbols. We pull a 12-month
	// buffer before startDate so the baseline lookup can walk back through
	// any Yahoo gaps (Yahoo's monthly bars for some LSE-listed ETFs — e.g.
	// ISDU.L — are missing every October).
	fetchStart := startDate.AddDate(-1, 0, 0)
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

// validateSymbolCoverage rejects start dates that predate any selected ETF's
// first available data point. Without this check, the simulation would silently
// clip to the latest common start month, producing a "duration" mismatch
// between the requested span and the months actually replayed.
//
// Symbols missing from the cache (e.g. failed startup fetch or unknown ticker)
// are skipped so the live Yahoo fetch downstream can surface its own error.
func (h *Handler) validateSymbolCoverage(symbols []string, startDate time.Time) error {
	for _, symbol := range symbols {
		info, ok := h.indexService.GetIndex(symbol)
		if !ok {
			continue
		}
		earliest := time.Date(info.DataStartYear, time.Month(info.DataStartMonth), 1, 0, 0, 0, 0, time.UTC)
		if startDate.Before(earliest) {
			return errors.Errorf(
				"%s only has data from %s — please pick a start date on or after that",
				symbol, info.DataStartDate,
			)
		}
	}
	return nil
}

// --- Core Simulation Logic ---

// runHistoricalSimulation replays actual monthly price returns from startDate
// to endDate. Each month's return is derived from real adjusted-close prices
// fetched from Yahoo Finance.
//
// Yahoo Finance's monthly bars are not perfectly contiguous — some LSE-listed
// ETFs (e.g. ISDU.L) are systematically missing one month per year, and
// occasional gaps exist for other ETFs too. To keep the simulation duration
// faithful to what the user asked for, we carry the last known price forward
// when a month is missing. The next real bar then captures the cumulative
// return across the gap in one step, which is mathematically equivalent to
// computing each missing month's contribution at the spot rate. The result:
//   - every calendar month from startDate to endDate gets a projection,
//   - cumulative returns match what the underlying prices say,
//   - the user sees the duration they asked for, not a silently-clipped one.
func runHistoricalSimulation(
	initial, monthlyBase float64,
	startDate, endDate time.Time,
	symbols []string,
	weights []float64,
	pricesBySymbol map[string]map[string]float64,
	contributionGrowth float64,
) ([]MonthProjection, HistoricalSimulateSummary, error) {
	monthlyContributionGrowth := math.Pow(1+contributionGrowth/100, 1.0/12.0) - 1

	// Establish a baseline price for every symbol from the months immediately
	// preceding startDate. Walks back up to 12 months to absorb a leading
	// Yahoo gap (we already fetched a 12-month buffer in the handler).
	lastKnownPrice := make(map[string]float64, len(symbols))
	for _, symbol := range symbols {
		baseline, ok := findBaselinePrice(pricesBySymbol[symbol], startDate)
		if !ok {
			return nil, HistoricalSimulateSummary{}, errors.Errorf(
				"no baseline price available for %s near %s", symbol, startDate.Format("January 2006"))
		}
		lastKnownPrice[symbol] = baseline
	}

	balance := initial
	totalContributed := initial
	currentContribution := monthlyBase
	projections := make([]MonthProjection, 0)

	for curDate := startDate; !curDate.After(endDate); curDate = curDate.AddDate(0, 1, 0) {
		curKey := curDate.Format("2006-01")

		var blendedReturn float64
		for i, symbol := range symbols {
			prevPrice := lastKnownPrice[symbol]
			curPrice, hasCur := pricesBySymbol[symbol][curKey]
			if !hasCur || curPrice <= 0 {
				// Yahoo gap — carry the last known price forward. This symbol
				// contributes 0% to the blend this month; the move will be
				// captured at the next available bar.
				curPrice = prevPrice
			} else {
				lastKnownPrice[symbol] = curPrice
			}
			if prevPrice > 0 {
				blendedReturn += weights[i] * (curPrice/prevPrice - 1)
			}
		}

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
	}

	if len(projections) == 0 {
		return nil, HistoricalSimulateSummary{}, errors.New(
			"no historical data available for the specified period and symbols — " +
				"the ETF may not have existed at that date")
	}

	summary := buildHistoricalSummary(projections, startDate, endDate)
	return projections, summary, nil
}

// findBaselinePrice returns the most recent available adjusted close at or
// before startDate-1mo, scanning back up to 12 months to absorb leading Yahoo
// gaps. If even that fails it falls back to startDate's own bar (which yields
// a 0% return on the first month — appropriate when the user's start date
// coincides with the ETF's very first data point).
func findBaselinePrice(prices map[string]float64, startDate time.Time) (float64, bool) {
	candidate := startDate.AddDate(0, -1, 0)
	for i := 0; i < 12; i++ {
		if p, ok := prices[candidate.Format("2006-01")]; ok && p > 0 {
			return p, true
		}
		candidate = candidate.AddDate(0, -1, 0)
	}
	if p, ok := prices[startDate.Format("2006-01")]; ok && p > 0 {
		return p, true
	}
	return 0, false
}

// buildHistoricalSummary constructs the summary from completed projections.
func buildHistoricalSummary(projections []MonthProjection, startDate, _ time.Time) HistoricalSimulateSummary {
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

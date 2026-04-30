package handler

import (
	"encoding/json"
	"log/slog"
	"math"
	"net/http"
	"sort"
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
	// Mutually exclusive with ContributionGrowthAmount.
	ContributionGrowthRate *float64 `json:"contributionGrowthRate,omitempty" example:"3.0"`

	// ContributionGrowthAmount is a fixed yearly euro increase applied stepwise
	// at each anniversary: the monthly contribution stays flat for 12 months,
	// then jumps by this amount on month 13 / 25 / 37 … (e.g., 500 with a
	// €500/mo base → year 1 is €500/mo, year 2 is €1000/mo, year 3 is €1500/mo).
	// Mutually exclusive with ContributionGrowthRate.
	ContributionGrowthAmount *float64 `json:"contributionGrowthAmount,omitempty" example:"500"`
}

// DailyPoint is a single trading-day portfolio snapshot used to render the
// What If chart at full daily resolution. Kept separate from MonthProjection
// so the table/comparison views stay month-grained while the chart can show
// every trading day's actual portfolio value (intra-month volatility).
type DailyPoint struct {
	Date             string  `json:"date" example:"2010-01-04"`
	PortfolioValue   float64 `json:"portfolioValue" example:"1437.45"`
	TotalContributed float64 `json:"totalContributed" example:"1500"`
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
	// DailyPoints carries one snapshot per trading day for high-resolution
	// chart rendering. Same simulation as Projections, just sampled per day.
	DailyPoints []DailyPoint              `json:"dailyPoints"`
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

	// Apply defaults — either rate or fixed-amount growth, not both.
	contributionGrowth, contributionGrowthAmount, growthErr := resolveContributionGrowth(
		req.ContributionGrowthRate, req.ContributionGrowthAmount,
	)
	if errors.Check(growthErr) {
		respondError(w, http.StatusBadRequest, growthErr.Error())
		return
	}
	req.ContributionGrowthRate = &contributionGrowth
	req.ContributionGrowthAmount = &contributionGrowthAmount

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

	// Fetch DAILY historical prices for all symbols. We pull a 30-day buffer
	// before startDate so we have a baseline price even if startDate falls on
	// a weekend/holiday. Daily bars give us intra-month volatility — a
	// contribution that lands on day 1 of a month is properly exposed to that
	// month's actual ups and downs, not just its end-of-month outcome.
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
			key := p.Date.Format("2006-01-02")
			priceMap[key] = p.AdjClose
		}
		pricesBySymbol[symbol] = priceMap
	}

	// Run historical simulation
	projections, dailyPoints, summary, simErr := runHistoricalSimulation(
		req.InitialInvestment,
		req.MonthlyContribution,
		startDate,
		now,
		symbols,
		weights,
		pricesBySymbol,
		contributionGrowth,
		contributionGrowthAmount,
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
		DailyPoints: dailyPoints,
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

// runHistoricalSimulation replays actual DAILY price returns from startDate
// to endDate. Each trading day's return is derived from real adjusted-close
// prices fetched from Yahoo Finance.
//
// Cadence model:
//   - Walk every trading day Yahoo gives us (sorted union across all symbols).
//     Daily price ratios compound naturally, so we capture intra-month
//     volatility that an end-of-month-only model would smooth out.
//   - Add the monthly contribution on the FIRST trading day of each calendar
//     month. This matches the realistic DCA pattern (contributing early, then
//     riding the month's moves) and means the contribution is exposed to that
//     month's actual ups and downs.
//   - Emit one MonthProjection per calendar month, snapshotted on the LAST
//     trading day of that month. This keeps the response shape stable so the
//     UI/chart/table don't change.
//   - Stepwise yearly contribution bumps (€/year fixed mode) apply on the
//     first trading day after each year anniversary.
//   - Carry-forward semantics: if a symbol is missing a particular trading
//     day (rare with daily data, but possible at bilateral holiday gaps),
//     its contribution to that day's blended return is 0 and the move is
//     caught at the next available bar.
func runHistoricalSimulation(
	initial, monthlyBase float64,
	startDate, endDate time.Time,
	symbols []string,
	weights []float64,
	pricesBySymbol map[string]map[string]float64,
	contributionGrowth, contributionGrowthAmount float64,
) ([]MonthProjection, []DailyPoint, HistoricalSimulateSummary, error) {
	// Convert annual % to a daily compound factor (252 trading days/year).
	dailyContributionGrowth := math.Pow(1+contributionGrowth/100, 1.0/252.0) - 1

	// Build the master sorted list of trading days from the union of every
	// symbol's day keys, restricted to startDate..endDate.
	tradingDays := buildTradingDays(pricesBySymbol, startDate, endDate)
	if len(tradingDays) == 0 {
		return nil, nil, HistoricalSimulateSummary{}, errors.New(
			"no trading-day data available for the specified period and symbols — " +
				"the ETF may not have existed at that date")
	}

	// Establish a baseline price per symbol from the days immediately preceding
	// startDate (we fetched a 30-day buffer for this).
	lastKnownPrice := make(map[string]float64, len(symbols))
	for _, symbol := range symbols {
		baseline, ok := findBaselineDailyPrice(pricesBySymbol[symbol], startDate)
		if !ok {
			return nil, nil, HistoricalSimulateSummary{}, errors.Errorf(
				"no baseline price available for %s near %s", symbol, startDate.Format("2006-01-02"))
		}
		lastKnownPrice[symbol] = baseline
	}

	balance := initial
	totalContributed := initial
	currentContribution := monthlyBase
	projections := make([]MonthProjection, 0)
	dailyPoints := make([]DailyPoint, 0, len(tradingDays))

	var prevYear int
	var prevMonth time.Month
	yearAnniversaryDate := startDate.AddDate(1, 0, 0) // next stepwise bump trigger
	monthlyProj := monthSnapshot{} // running accumulator for end-of-month emit

	for idx, day := range tradingDays {
		// Stepwise yearly bump: when we cross a year anniversary, bump the
		// monthly contribution. Compare with day at start of trading-day so
		// the bump applies to all of the new year's contributions.
		if !day.Before(yearAnniversaryDate) {
			currentContribution += contributionGrowthAmount
			yearAnniversaryDate = yearAnniversaryDate.AddDate(1, 0, 0)
		}

		// Compute blended return for this trading day (carry-forward gaps).
		var blendedReturn float64
		dayKey := day.Format("2006-01-02")
		for i, symbol := range symbols {
			prevPrice := lastKnownPrice[symbol]
			curPrice, hasCur := pricesBySymbol[symbol][dayKey]
			if !hasCur || curPrice <= 0 {
				curPrice = prevPrice
			} else {
				lastKnownPrice[symbol] = curPrice
			}
			if prevPrice > 0 {
				blendedReturn += weights[i] * (curPrice/prevPrice - 1)
			}
		}
		balance *= (1 + blendedReturn)

		// On the FIRST trading day of each calendar month, deposit the
		// monthly contribution and reset the month accumulator.
		isNewMonth := idx == 0 || day.Month() != prevMonth || day.Year() != prevYear
		if isNewMonth {
			// Emit the previous month's snapshot if there is one.
			if idx > 0 {
				projections = append(projections, monthlyProj.toProjection())
			}
			balance += currentContribution
			totalContributed += currentContribution

			monthlyProj = monthSnapshot{
				year:                day.Year(),
				month:               int(day.Month()),
				monthlyContribution: currentContribution,
				totalContributed:    totalContributed,
				portfolioValue:      balance,
			}
			prevYear = day.Year()
			prevMonth = day.Month()
		} else {
			// Mid-month: just update the snapshot's running portfolio value.
			monthlyProj.portfolioValue = balance
		}

		// Record this trading day's snapshot for high-resolution chart rendering.
		dailyPoints = append(dailyPoints, DailyPoint{
			Date:             dayKey,
			PortfolioValue:   round2(balance),
			TotalContributed: round2(totalContributed),
		})

		// Smooth percentage daily compounding for next day (no-op when rate is 0).
		currentContribution *= (1 + dailyContributionGrowth)
	}

	// Flush the final month's snapshot.
	projections = append(projections, monthlyProj.toProjection())

	summary := buildHistoricalSummary(projections, startDate, endDate)
	return projections, dailyPoints, summary, nil
}

// monthSnapshot holds the running state for the calendar month currently
// being accumulated. We snapshot at end-of-month — the portfolio value
// reflects all daily compounding through the last trading day of that month.
type monthSnapshot struct {
	year                int
	month               int
	monthlyContribution float64
	totalContributed    float64
	portfolioValue      float64
}

func (m monthSnapshot) toProjection() MonthProjection {
	return MonthProjection{
		Year:                m.year,
		Month:               m.month,
		MonthlyContribution: round2(m.monthlyContribution),
		TotalContributed:    round2(m.totalContributed),
		PortfolioValue:      round2(m.portfolioValue),
	}
}

// buildTradingDays returns the sorted union of every symbol's available
// trading-day keys, restricted to the [startDate, endDate] window. The
// union (rather than intersection) means that a holiday at one exchange
// doesn't strand the whole simulation; carry-forward inside the loop
// handles the missing symbol.
func buildTradingDays(pricesBySymbol map[string]map[string]float64, startDate, endDate time.Time) []time.Time {
	seen := make(map[string]struct{})
	for _, prices := range pricesBySymbol {
		for k := range prices {
			seen[k] = struct{}{}
		}
	}
	startKey := startDate.Format("2006-01-02")
	endKey := endDate.Format("2006-01-02")
	keys := make([]string, 0, len(seen))
	for k := range seen {
		if k >= startKey && k <= endKey {
			keys = append(keys, k)
		}
	}
	sort.Strings(keys)
	out := make([]time.Time, 0, len(keys))
	for _, k := range keys {
		t, err := time.Parse("2006-01-02", k)
		if errors.Check(err) {
			continue
		}
		out = append(out, t)
	}
	return out
}

// findBaselineDailyPrice returns the best available adjusted close to use
// as the "previous day" baseline at the start of the simulation.
//
// Lookup order:
//  1. Walk BACKWARD up to 60 calendar days from startDate. This handles the
//     common cases — startDate falling on a weekend or holiday, or just
//     anchoring to the prior trading day so the first day's return reflects
//     a real price move.
//  2. If nothing earlier exists, walk FORWARD up to 60 calendar days. This
//     handles the edge case where the user picks the very first month of an
//     ETF's history (e.g. IGDA.L and Jan 2022) — there's no "before" data
//     because the ETF didn't exist yet, so we anchor to the FIRST available
//     trading day instead. The result: the first iteration's return is 0%
//     (price/price - 1) and the simulation effectively starts from that
//     first available day, which matches "you couldn't have invested earlier
//     because the ETF didn't trade yet".
func findBaselineDailyPrice(prices map[string]float64, startDate time.Time) (float64, bool) {
	candidate := startDate.AddDate(0, 0, -1)
	for range 60 {
		if p, ok := prices[candidate.Format("2006-01-02")]; ok && p > 0 {
			return p, true
		}
		candidate = candidate.AddDate(0, 0, -1)
	}
	candidate = startDate
	for range 60 {
		if p, ok := prices[candidate.Format("2006-01-02")]; ok && p > 0 {
			return p, true
		}
		candidate = candidate.AddDate(0, 0, 1)
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

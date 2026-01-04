package handler

import (
	"encoding/json"
	"log/slog"
	"math"
	"net/http"
	"time"

	"github.com/abdonasmane/etfs-simulator/backend/sdk/errors"
)

// --- Request Types ---

// SimulateByYearsRequest is the input for simulating by number of years.
type SimulateByYearsRequest struct {
	// InitialInvestment is the starting amount.
	InitialInvestment float64 `json:"initialInvestment" example:"1000"`

	// MonthlyContribution is the starting monthly contribution amount.
	MonthlyContribution float64 `json:"monthlyContribution" example:"500"`

	// Years is the number of years to simulate (1-50).
	Years int `json:"years" example:"10"`

	// IndexSymbol is the market index symbol (e.g., "SPY", "QQQ"). If provided, returns range projections.
	IndexSymbol *string `json:"indexSymbol,omitempty" example:"SPY"`

	// AnnualReturnRate is the expected annual return percentage (default: 7.0). Ignored if IndexSymbol is provided.
	AnnualReturnRate *float64 `json:"annualReturnRate,omitempty" example:"7.0"`

	// ContributionGrowthRate is the annual percentage increase in contributions (default: 0).
	ContributionGrowthRate *float64 `json:"contributionGrowthRate,omitempty" example:"3.0"`
}

// SimulateByTargetRequest is the input for simulating until a target date.
type SimulateByTargetRequest struct {
	// InitialInvestment is the starting amount.
	InitialInvestment float64 `json:"initialInvestment" example:"1000"`

	// MonthlyContribution is the starting monthly contribution amount.
	MonthlyContribution float64 `json:"monthlyContribution" example:"500"`

	// TargetYear is the target year (e.g., 2035).
	TargetYear int `json:"targetYear" example:"2035"`

	// TargetMonth is the target month (1-12). Defaults to 12 (December).
	TargetMonth *int `json:"targetMonth,omitempty" example:"6"`

	// IndexSymbol is the market index symbol (e.g., "SPY", "QQQ"). If provided, returns range projections.
	IndexSymbol *string `json:"indexSymbol,omitempty" example:"SPY"`

	// AnnualReturnRate is the expected annual return percentage (default: 7.0). Ignored if IndexSymbol is provided.
	AnnualReturnRate *float64 `json:"annualReturnRate,omitempty" example:"7.0"`

	// ContributionGrowthRate is the annual percentage increase in contributions (default: 0).
	ContributionGrowthRate *float64 `json:"contributionGrowthRate,omitempty" example:"3.0"`
}

// --- Response Types ---

// MonthProjection represents the portfolio state at the end of a month.
type MonthProjection struct {
	Year                int     `json:"year" example:"2025"`
	Month               int     `json:"month" example:"6"`
	MonthlyContribution float64 `json:"monthlyContribution" example:"515.00"`
	TotalContributed    float64 `json:"totalContributed" example:"4000"`
	PortfolioValue      float64 `json:"portfolioValue" example:"4150.25"`

	// Range values (only present when IndexSymbol is provided)
	PessimisticValue *float64 `json:"pessimisticValue,omitempty" example:"3950.00"`
	OptimisticValue  *float64 `json:"optimisticValue,omitempty" example:"4400.00"`
}

// ContributionMilestone shows the monthly contribution at key years.
type ContributionMilestone struct {
	Year                int     `json:"year" example:"2030"`
	YearsFromNow        int     `json:"yearsFromNow" example:"5"`
	MonthlyContribution float64 `json:"monthlyContribution" example:"608.33"`
}

// SimulateSummary contains the final simulation results.
type SimulateSummary struct {
	TargetDate               string  `json:"targetDate" example:"December 2035"`
	FinalValue               float64 `json:"finalValue" example:"102601.08"`
	TotalContributed         float64 `json:"totalContributed" example:"61000"`
	TotalGain                float64 `json:"totalGain" example:"41601.08"`
	PercentageGain           float64 `json:"percentageGain" example:"68.2"`
	TotalMonths              int     `json:"totalMonths" example:"120"`
	FinalMonthlyContribution float64 `json:"finalMonthlyContribution" example:"672.75"`

	// ContributionMilestones shows how contributions grow over time.
	ContributionMilestones []ContributionMilestone `json:"contributionMilestones"`

	// Range values (only present when IndexSymbol is provided)
	HasRange           bool     `json:"hasRange"`
	PessimisticValue   *float64 `json:"pessimisticValue,omitempty" example:"85000.00"`
	OptimisticValue    *float64 `json:"optimisticValue,omitempty" example:"125000.00"`
	PessimisticGain    *float64 `json:"pessimisticGain,omitempty" example:"24000.00"`
	OptimisticGain     *float64 `json:"optimisticGain,omitempty" example:"64000.00"`
	PessimisticPercent *float64 `json:"pessimisticPercent,omitempty" example:"39.3"`
	OptimisticPercent  *float64 `json:"optimisticPercent,omitempty" example:"104.9"`
}

// SimulateByYearsResponse is the output for years-based simulation.
type SimulateByYearsResponse struct {
	Inputs      SimulateByYearsRequest `json:"inputs"`
	Projections []MonthProjection      `json:"projections"`
	Summary     SimulateSummary        `json:"summary"`
}

// SimulateByTargetResponse is the output for target-date simulation.
type SimulateByTargetResponse struct {
	Inputs      SimulateByTargetRequest `json:"inputs"`
	Projections []MonthProjection       `json:"projections"`
	Summary     SimulateSummary         `json:"summary"`
}

// --- Handlers ---

// handleSimulateByYears runs a simulation for a specified number of years.
//
//	@Summary		Simulate by years
//	@Description	Calculates projected portfolio value for a given number of years
//	@Tags			simulation
//	@Accept			json
//	@Produce		json
//	@Param			request	body		SimulateByYearsRequest	true	"Simulation parameters"
//	@Success		200		{object}	SimulateByYearsResponse
//	@Failure		400		{object}	ErrorResponse
//	@Router			/api/v1/simulate/years [post]
func (h *Handler) handleSimulateByYears(w http.ResponseWriter, r *http.Request) {
	var req SimulateByYearsRequest
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
	if req.Years < 1 || req.Years > 50 {
		respondError(w, http.StatusBadRequest, "years must be between 1 and 50")
		return
	}

	// Get index info if symbol provided
	var indexInfo *indexReturnRates
	if req.IndexSymbol != nil && *req.IndexSymbol != "" {
		info, ok := h.indexService.GetIndex(*req.IndexSymbol)
		if !ok {
			respondError(w, http.StatusBadRequest, "unknown index symbol: "+*req.IndexSymbol)
			return
		}
		indexInfo = &indexReturnRates{
			median:      info.MedianReturn,
			pessimistic: info.PessimisticReturn,
			optimistic:  info.OptimisticReturn,
		}
	}

	// Apply defaults
	var annualRate float64
	if indexInfo != nil {
		annualRate = indexInfo.median
	} else {
		annualRate = applyDefault(req.AnnualReturnRate, 7.0)
	}
	contributionGrowth := applyDefault(req.ContributionGrowthRate, 0.0)

	req.AnnualReturnRate = &annualRate
	req.ContributionGrowthRate = &contributionGrowth

	// Validate rates
	if contributionGrowth < 0 || contributionGrowth > 20 {
		respondError(w, http.StatusBadRequest, "contributionGrowthRate must be between 0 and 20")
		return
	}

	// Calculate dates
	now := time.Now()
	startYear := now.Year()
	startMonth := int(now.Month())
	totalMonths := req.Years * 12

	endMonth := startMonth
	endYear := startYear + req.Years

	// Run simulation(s)
	var projections []MonthProjection
	var summary SimulateSummary

	if indexInfo != nil {
		// Run all three simulations for range
		projections, summary = simulateWithRange(
			req.InitialInvestment,
			req.MonthlyContribution,
			startYear, startMonth,
			totalMonths,
			indexInfo,
			contributionGrowth,
			endYear, endMonth,
		)
	} else {
		// Single simulation
		projections = simulateMonthly(
			req.InitialInvestment,
			req.MonthlyContribution,
			startYear, startMonth,
			totalMonths,
			annualRate,
			contributionGrowth,
		)
		summary = buildSummary(projections, totalMonths, endYear, endMonth, startYear)
	}

	slog.Debug("simulation by years completed",
		slog.Float64("initial", req.InitialInvestment),
		slog.Float64("monthly", req.MonthlyContribution),
		slog.Int("years", req.Years),
		slog.Float64("contribution_growth", contributionGrowth),
		slog.Float64("final_value", summary.FinalValue),
		slog.Bool("has_range", summary.HasRange),
	)

	respondJSON(w, http.StatusOK, SimulateByYearsResponse{
		Inputs:      req,
		Projections: projections,
		Summary:     summary,
	})
}

// handleSimulateByTarget runs a simulation until a target date.
//
//	@Summary		Simulate by target date
//	@Description	Calculates projected portfolio value until a specific month and year
//	@Tags			simulation
//	@Accept			json
//	@Produce		json
//	@Param			request	body		SimulateByTargetRequest	true	"Simulation parameters"
//	@Success		200		{object}	SimulateByTargetResponse
//	@Failure		400		{object}	ErrorResponse
//	@Router			/api/v1/simulate/target [post]
func (h *Handler) handleSimulateByTarget(w http.ResponseWriter, r *http.Request) {
	var req SimulateByTargetRequest
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

	// Default target month to December
	endMonth := 12
	if req.TargetMonth != nil {
		endMonth = *req.TargetMonth
	}
	req.TargetMonth = &endMonth

	if endMonth < 1 || endMonth > 12 {
		respondError(w, http.StatusBadRequest, "targetMonth must be between 1 and 12")
		return
	}

	// Validate target date is in the future
	now := time.Now()
	startYear := now.Year()
	startMonth := int(now.Month())

	if req.TargetYear < startYear || (req.TargetYear == startYear && endMonth <= startMonth) {
		respondError(w, http.StatusBadRequest, "target date must be in the future")
		return
	}

	// Calculate total months
	totalMonths := (req.TargetYear-startYear)*12 + (endMonth - startMonth)
	if totalMonths < 1 {
		respondError(w, http.StatusBadRequest, "simulation period must be at least 1 month")
		return
	}
	if totalMonths > 600 {
		respondError(w, http.StatusBadRequest, "simulation period cannot exceed 50 years")
		return
	}

	// Get index info if symbol provided
	var indexInfo *indexReturnRates
	if req.IndexSymbol != nil && *req.IndexSymbol != "" {
		info, ok := h.indexService.GetIndex(*req.IndexSymbol)
		if !ok {
			respondError(w, http.StatusBadRequest, "unknown index symbol: "+*req.IndexSymbol)
			return
		}
		indexInfo = &indexReturnRates{
			median:      info.MedianReturn,
			pessimistic: info.PessimisticReturn,
			optimistic:  info.OptimisticReturn,
		}
	}

	// Apply defaults
	var annualRate float64
	if indexInfo != nil {
		annualRate = indexInfo.median
	} else {
		annualRate = applyDefault(req.AnnualReturnRate, 7.0)
	}
	contributionGrowth := applyDefault(req.ContributionGrowthRate, 0.0)

	req.AnnualReturnRate = &annualRate
	req.ContributionGrowthRate = &contributionGrowth

	// Validate rates
	if contributionGrowth < 0 || contributionGrowth > 20 {
		respondError(w, http.StatusBadRequest, "contributionGrowthRate must be between 0 and 20")
		return
	}

	// Run simulation(s)
	var projections []MonthProjection
	var summary SimulateSummary

	if indexInfo != nil {
		// Run all three simulations for range
		projections, summary = simulateWithRange(
			req.InitialInvestment,
			req.MonthlyContribution,
			startYear, startMonth,
			totalMonths,
			indexInfo,
			contributionGrowth,
			req.TargetYear, endMonth,
		)
	} else {
		// Single simulation
		projections = simulateMonthly(
			req.InitialInvestment,
			req.MonthlyContribution,
			startYear, startMonth,
			totalMonths,
			annualRate,
			contributionGrowth,
		)
		summary = buildSummary(projections, totalMonths, req.TargetYear, endMonth, startYear)
	}

	slog.Debug("simulation by target completed",
		slog.Float64("initial", req.InitialInvestment),
		slog.Float64("monthly", req.MonthlyContribution),
		slog.String("target", summary.TargetDate),
		slog.Float64("contribution_growth", contributionGrowth),
		slog.Float64("final_value", summary.FinalValue),
		slog.Bool("has_range", summary.HasRange),
	)

	respondJSON(w, http.StatusOK, SimulateByTargetResponse{
		Inputs:      req,
		Projections: projections,
		Summary:     summary,
	})
}

// --- Shared Logic ---

// applyDefault returns the pointer value or a default.
func applyDefault(ptr *float64, defaultVal float64) float64 {
	if ptr != nil {
		return *ptr
	}
	return defaultVal
}

// simulateMonthly calculates month-by-month portfolio growth with growing contributions.
func simulateMonthly(
	initial, monthlyBase float64,
	startYear, startMonth, totalMonths int,
	annualRate, contributionGrowth float64,
) []MonthProjection {
	// Convert annual rates to monthly factors
	monthlyReturnRate := math.Pow(1+annualRate/100, 1.0/12.0) - 1
	monthlyContributionGrowth := math.Pow(1+contributionGrowth/100, 1.0/12.0) - 1

	projections := make([]MonthProjection, 0, totalMonths)
	balance := initial
	totalContributed := initial
	currentContribution := monthlyBase

	currentYear := startYear
	currentMonth := startMonth

	for i := 0; i < totalMonths; i++ {
		// Advance to next month
		currentMonth++
		if currentMonth > 12 {
			currentMonth = 1
			currentYear++
		}

		// Apply investment return
		balance *= (1 + monthlyReturnRate)

		// Add contribution (grows each month)
		balance += currentContribution
		totalContributed += currentContribution

		projections = append(projections, MonthProjection{
			Year:                currentYear,
			Month:               currentMonth,
			MonthlyContribution: round2(currentContribution),
			TotalContributed:    round2(totalContributed),
			PortfolioValue:      round2(balance),
		})

		// Grow contribution for next month
		currentContribution *= (1 + monthlyContributionGrowth)
	}

	return projections
}

// buildSummary creates the summary from projections.
func buildSummary(projections []MonthProjection, totalMonths, endYear, endMonth, startYear int) SimulateSummary {
	finalProjection := projections[len(projections)-1]
	totalContributed := finalProjection.TotalContributed
	totalGain := finalProjection.PortfolioValue - totalContributed

	percentageGain := 0.0
	if totalContributed > 0 {
		percentageGain = round1((totalGain / totalContributed) * 100)
	}

	targetDate := time.Month(endMonth).String() + " " + time.Date(endYear, 1, 1, 0, 0, 0, 0, time.UTC).Format("2006")

	// Build contribution milestones
	milestones := buildContributionMilestones(projections, startYear)

	return SimulateSummary{
		TargetDate:               targetDate,
		FinalValue:               round2(finalProjection.PortfolioValue),
		TotalContributed:         round2(totalContributed),
		TotalGain:                round2(totalGain),
		PercentageGain:           percentageGain,
		TotalMonths:              totalMonths,
		FinalMonthlyContribution: finalProjection.MonthlyContribution,
		ContributionMilestones:   milestones,
	}
}

// buildContributionMilestones extracts contribution values at key years (now, 5, 10, 15, 20, etc.).
func buildContributionMilestones(projections []MonthProjection, startYear int) []ContributionMilestone {
	milestones := []ContributionMilestone{}

	// Find milestones at specific intervals
	milestoneYears := map[int]bool{}
	totalYears := projections[len(projections)-1].Year - startYear

	// Add milestones at 5-year intervals, plus the final year
	for y := 5; y <= totalYears; y += 5 {
		milestoneYears[startYear+y] = true
	}
	// Always include final year
	milestoneYears[projections[len(projections)-1].Year] = true

	// Track which years we've added
	addedYears := map[int]bool{}

	for _, p := range projections {
		// Only add January projections (or first occurrence of a milestone year)
		if milestoneYears[p.Year] && !addedYears[p.Year] && p.Month == 1 {
			milestones = append(milestones, ContributionMilestone{
				Year:                p.Year,
				YearsFromNow:        p.Year - startYear,
				MonthlyContribution: p.MonthlyContribution,
			})
			addedYears[p.Year] = true
		}
	}

	// If final year wasn't January, add the final projection
	finalProj := projections[len(projections)-1]
	if !addedYears[finalProj.Year] {
		milestones = append(milestones, ContributionMilestone{
			Year:                finalProj.Year,
			YearsFromNow:        finalProj.Year - startYear,
			MonthlyContribution: finalProj.MonthlyContribution,
		})
	}

	return milestones
}

// round2 rounds to 2 decimal places.
func round2(val float64) float64 {
	return math.Round(val*100) / 100
}

// round1 rounds to 1 decimal place.
func round1(val float64) float64 {
	return math.Round(val*10) / 10
}

// indexReturnRates holds the three return rates for an index.
type indexReturnRates struct {
	median      float64
	pessimistic float64
	optimistic  float64
}

// simulateWithRange runs three simulations (pessimistic, median, optimistic) and merges results.
func simulateWithRange(
	initial, monthlyBase float64,
	startYear, startMonth, totalMonths int,
	rates *indexReturnRates,
	contributionGrowth float64,
	endYear, endMonth int,
) ([]MonthProjection, SimulateSummary) {
	// Run all three simulations
	medianProj := simulateMonthly(initial, monthlyBase, startYear, startMonth, totalMonths, rates.median, contributionGrowth)
	pessimisticProj := simulateMonthly(initial, monthlyBase, startYear, startMonth, totalMonths, rates.pessimistic, contributionGrowth)
	optimisticProj := simulateMonthly(initial, monthlyBase, startYear, startMonth, totalMonths, rates.optimistic, contributionGrowth)

	// Merge into single projection list with range values
	projections := make([]MonthProjection, len(medianProj))
	for i := range medianProj {
		pessVal := pessimisticProj[i].PortfolioValue
		optVal := optimisticProj[i].PortfolioValue

		projections[i] = MonthProjection{
			Year:                medianProj[i].Year,
			Month:               medianProj[i].Month,
			MonthlyContribution: medianProj[i].MonthlyContribution,
			TotalContributed:    medianProj[i].TotalContributed,
			PortfolioValue:      medianProj[i].PortfolioValue,
			PessimisticValue:    &pessVal,
			OptimisticValue:     &optVal,
		}
	}

	// Build summary with range
	summary := buildSummary(projections, totalMonths, endYear, endMonth, startYear)

	// Add range values to summary
	finalPess := pessimisticProj[len(pessimisticProj)-1]
	finalOpt := optimisticProj[len(optimisticProj)-1]
	totalContributed := summary.TotalContributed

	pessGain := finalPess.PortfolioValue - totalContributed
	optGain := finalOpt.PortfolioValue - totalContributed

	var pessPercent, optPercent float64
	if totalContributed > 0 {
		pessPercent = round1((pessGain / totalContributed) * 100)
		optPercent = round1((optGain / totalContributed) * 100)
	}

	pessValue := round2(finalPess.PortfolioValue)
	optValue := round2(finalOpt.PortfolioValue)
	pessGainRounded := round2(pessGain)
	optGainRounded := round2(optGain)

	summary.HasRange = true
	summary.PessimisticValue = &pessValue
	summary.OptimisticValue = &optValue
	summary.PessimisticGain = &pessGainRounded
	summary.OptimisticGain = &optGainRounded
	summary.PessimisticPercent = &pessPercent
	summary.OptimisticPercent = &optPercent

	return projections, summary
}

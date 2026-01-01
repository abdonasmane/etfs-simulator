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

	// MonthlyContribution is the amount added each month.
	MonthlyContribution float64 `json:"monthlyContribution" example:"500"`

	// Years is the number of years to simulate (1-50).
	Years int `json:"years" example:"10"`

	// AnnualReturnRate is the expected annual return percentage (default: 7.0).
	AnnualReturnRate *float64 `json:"annualReturnRate,omitempty" example:"7.0"`
}

// SimulateByTargetRequest is the input for simulating until a target date.
type SimulateByTargetRequest struct {
	// InitialInvestment is the starting amount.
	InitialInvestment float64 `json:"initialInvestment" example:"1000"`

	// MonthlyContribution is the amount added each month.
	MonthlyContribution float64 `json:"monthlyContribution" example:"500"`

	// TargetYear is the target year (e.g., 2035).
	TargetYear int `json:"targetYear" example:"2035"`

	// TargetMonth is the target month (1-12). Defaults to 12 (December).
	TargetMonth *int `json:"targetMonth,omitempty" example:"6"`

	// AnnualReturnRate is the expected annual return percentage (default: 7.0).
	AnnualReturnRate *float64 `json:"annualReturnRate,omitempty" example:"7.0"`
}

// --- Response Types ---

// MonthProjection represents the portfolio state at the end of a month.
type MonthProjection struct {
	Year             int     `json:"year" example:"2025"`
	Month            int     `json:"month" example:"6"`
	TotalContributed float64 `json:"totalContributed" example:"4000"`
	PortfolioValue   float64 `json:"portfolioValue" example:"4150.25"`
}

// SimulateSummary contains the final simulation results.
type SimulateSummary struct {
	TargetDate       string  `json:"targetDate" example:"December 2035"`
	FinalValue       float64 `json:"finalValue" example:"102601.08"`
	TotalContributed float64 `json:"totalContributed" example:"61000"`
	TotalGain        float64 `json:"totalGain" example:"41601.08"`
	PercentageGain   float64 `json:"percentageGain" example:"68.2"`
	TotalMonths      int     `json:"totalMonths" example:"120"`
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
func handleSimulateByYears(w http.ResponseWriter, r *http.Request) {
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

	// Default annual return rate to 7%
	annualRate := 7.0
	if req.AnnualReturnRate != nil {
		annualRate = *req.AnnualReturnRate
	}
	req.AnnualReturnRate = &annualRate

	// Calculate dates
	now := time.Now()
	startYear := now.Year()
	startMonth := int(now.Month())
	totalMonths := req.Years * 12

	endMonth := startMonth
	endYear := startYear + req.Years

	// Run simulation
	projections := simulateMonthly(
		req.InitialInvestment,
		req.MonthlyContribution,
		startYear,
		startMonth,
		totalMonths,
		annualRate,
	)

	// Build response
	response := buildResponse(projections, req.InitialInvestment, req.MonthlyContribution, totalMonths, endYear, endMonth)

	slog.Debug("simulation by years completed",
		slog.Float64("initial", req.InitialInvestment),
		slog.Float64("monthly", req.MonthlyContribution),
		slog.Int("years", req.Years),
		slog.Float64("final_value", response.FinalValue),
	)

	respondJSON(w, http.StatusOK, SimulateByYearsResponse{
		Inputs:      req,
		Projections: projections,
		Summary:     response,
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
func handleSimulateByTarget(w http.ResponseWriter, r *http.Request) {
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

	// Default annual return rate to 7%
	annualRate := 7.0
	if req.AnnualReturnRate != nil {
		annualRate = *req.AnnualReturnRate
	}
	req.AnnualReturnRate = &annualRate

	// Run simulation
	projections := simulateMonthly(
		req.InitialInvestment,
		req.MonthlyContribution,
		startYear,
		startMonth,
		totalMonths,
		annualRate,
	)

	// Build response
	response := buildResponse(projections, req.InitialInvestment, req.MonthlyContribution, totalMonths, req.TargetYear, endMonth)

	slog.Debug("simulation by target completed",
		slog.Float64("initial", req.InitialInvestment),
		slog.Float64("monthly", req.MonthlyContribution),
		slog.String("target", response.TargetDate),
		slog.Float64("final_value", response.FinalValue),
	)

	respondJSON(w, http.StatusOK, SimulateByTargetResponse{
		Inputs:      req,
		Projections: projections,
		Summary:     response,
	})
}

// --- Shared Logic ---

// simulateMonthly calculates month-by-month portfolio growth.
func simulateMonthly(initial, monthly float64, startYear, startMonth, totalMonths int, annualRate float64) []MonthProjection {
	monthlyRate := math.Pow(1+annualRate/100, 1.0/12.0) - 1

	projections := make([]MonthProjection, 0, totalMonths)
	balance := initial
	totalContributed := initial

	currentYear := startYear
	currentMonth := startMonth

	for i := 0; i < totalMonths; i++ {
		currentMonth++
		if currentMonth > 12 {
			currentMonth = 1
			currentYear++
		}

		balance *= (1 + monthlyRate)
		balance += monthly
		totalContributed += monthly

		projections = append(projections, MonthProjection{
			Year:             currentYear,
			Month:            currentMonth,
			TotalContributed: math.Round(totalContributed*100) / 100,
			PortfolioValue:   math.Round(balance*100) / 100,
		})
	}

	return projections
}

// buildResponse creates the summary from projections.
func buildResponse(projections []MonthProjection, initial, monthly float64, totalMonths, endYear, endMonth int) SimulateSummary {
	finalProjection := projections[len(projections)-1]
	totalContributed := initial + (monthly * float64(totalMonths))
	totalGain := finalProjection.PortfolioValue - totalContributed
	percentageGain := 0.0
	if totalContributed > 0 {
		percentageGain = math.Round((totalGain/totalContributed)*1000) / 10
	}

	targetDate := time.Month(endMonth).String() + " " + time.Date(endYear, 1, 1, 0, 0, 0, 0, time.UTC).Format("2006")

	return SimulateSummary{
		TargetDate:       targetDate,
		FinalValue:       math.Round(finalProjection.PortfolioValue*100) / 100,
		TotalContributed: totalContributed,
		TotalGain:        math.Round(totalGain*100) / 100,
		PercentageGain:   percentageGain,
		TotalMonths:      totalMonths,
	}
}

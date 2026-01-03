/**
 * Models for the simulation API endpoints.
 * These types match the backend Go structs exactly.
 */

// --- Request Types ---

/**
 * Request for simulating by number of years.
 * POST /api/v1/simulate/years
 */
export interface SimulateByYearsRequest {
  /** Starting investment amount */
  initialInvestment: number;

  /** Amount added each month */
  monthlyContribution: number;

  /** Number of years to simulate (1-50) */
  years: number;

  /** Expected annual return percentage (default: 7.0) */
  annualReturnRate?: number;
}

/**
 * Request for simulating until a target date.
 * POST /api/v1/simulate/target
 */
export interface SimulateByTargetRequest {
  /** Starting investment amount */
  initialInvestment: number;

  /** Amount added each month */
  monthlyContribution: number;

  /** Target year (e.g., 2035) */
  targetYear: number;

  /** Target month (1-12), defaults to December */
  targetMonth?: number;

  /** Expected annual return percentage (default: 7.0) */
  annualReturnRate?: number;
}

// --- Response Types ---

/**
 * Portfolio state at the end of a month.
 */
export interface MonthProjection {
  /** Year (e.g., 2025) */
  year: number;

  /** Month (1-12) */
  month: number;

  /** Total amount contributed so far */
  totalContributed: number;

  /** Current portfolio value */
  portfolioValue: number;
}

/**
 * Summary of simulation results.
 */
export interface SimulateSummary {
  /** Human-readable target date (e.g., "December 2035") */
  targetDate: string;

  /** Final portfolio value */
  finalValue: number;

  /** Total amount contributed */
  totalContributed: number;

  /** Total gain (finalValue - totalContributed) */
  totalGain: number;

  /** Percentage gain */
  percentageGain: number;

  /** Total number of months simulated */
  totalMonths: number;
}

/**
 * Response for years-based simulation.
 */
export interface SimulateByYearsResponse {
  inputs: SimulateByYearsRequest;
  projections: MonthProjection[];
  summary: SimulateSummary;
}

/**
 * Response for target-date simulation.
 */
export interface SimulateByTargetResponse {
  inputs: SimulateByTargetRequest;
  projections: MonthProjection[];
  summary: SimulateSummary;
}

// --- Error Response ---

/**
 * Standard API error response.
 */
export interface ApiError {
  error: string;
}

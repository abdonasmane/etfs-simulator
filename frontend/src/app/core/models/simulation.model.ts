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

  /** Starting monthly contribution amount */
  monthlyContribution: number;

  /** Number of years to simulate (1-50) */
  years: number;

  /** Index symbol (e.g., "SPY", "QQQ"). If provided, returns range projections. */
  indexSymbol?: string;

  /** Expected annual return percentage (default: 7.0). Ignored if indexSymbol is provided. */
  annualReturnRate?: number;

  /** Annual percentage increase in contributions (default: 0) */
  contributionGrowthRate?: number;
}

/**
 * Request for simulating until a target date.
 * POST /api/v1/simulate/target
 */
export interface SimulateByTargetRequest {
  /** Starting investment amount */
  initialInvestment: number;

  /** Starting monthly contribution amount */
  monthlyContribution: number;

  /** Target year (e.g., 2035) */
  targetYear: number;

  /** Target month (1-12), defaults to December */
  targetMonth?: number;

  /** Index symbol (e.g., "SPY", "QQQ"). If provided, returns range projections. */
  indexSymbol?: string;

  /** Expected annual return percentage (default: 7.0). Ignored if indexSymbol is provided. */
  annualReturnRate?: number;

  /** Annual percentage increase in contributions (default: 0) */
  contributionGrowthRate?: number;
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

  /** Monthly contribution for this month */
  monthlyContribution: number;

  /** Total amount contributed so far */
  totalContributed: number;

  /** Current portfolio value (median) */
  portfolioValue: number;

  /** Pessimistic portfolio value (5th percentile) - only present when indexSymbol is used */
  pessimisticValue?: number;

  /** Optimistic portfolio value (95th percentile) - only present when indexSymbol is used */
  optimisticValue?: number;
}

/**
 * Contribution milestone showing the monthly contribution at key years.
 */
export interface ContributionMilestone {
  /** The year */
  year: number;

  /** Years from now */
  yearsFromNow: number;

  /** Monthly contribution at this point */
  monthlyContribution: number;
}

/**
 * Summary of simulation results.
 */
export interface SimulateSummary {
  /** Human-readable target date (e.g., "December 2035") */
  targetDate: string;

  /** Final portfolio value (median) */
  finalValue: number;

  /** Total amount contributed */
  totalContributed: number;

  /** Total gain (median) */
  totalGain: number;

  /** Percentage gain (median) */
  percentageGain: number;

  /** Total number of months simulated */
  totalMonths: number;

  /** Final monthly contribution amount */
  finalMonthlyContribution: number;

  /** Contribution milestones showing how contributions grow over time */
  contributionMilestones: ContributionMilestone[];

  /** Whether range data is available (true when indexSymbol was provided) */
  hasRange: boolean;

  /** Pessimistic final value (5th percentile) */
  pessimisticValue?: number;

  /** Optimistic final value (95th percentile) */
  optimisticValue?: number;

  /** Pessimistic gain */
  pessimisticGain?: number;

  /** Optimistic gain */
  optimisticGain?: number;

  /** Pessimistic percentage gain */
  pessimisticPercent?: number;

  /** Optimistic percentage gain */
  optimisticPercent?: number;
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

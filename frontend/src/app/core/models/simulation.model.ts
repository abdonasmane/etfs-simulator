/**
 * Models for the simulation API endpoints.
 * These types match the backend Go structs exactly.
 */

// --- Portfolio Types ---

/**
 * Represents an ETF allocation in a portfolio.
 */
export interface PortfolioAllocation {
  /** ETF symbol (e.g., "SPY", "QQQ", "EFA") */
  symbol: string;

  /** Allocation percentage (0-100). All weights must sum to 100. */
  weight: number;
}

/**
 * Portfolio breakdown showing allocation and expected return for each ETF.
 */
export interface PortfolioBreakdown {
  /** ETF symbol */
  symbol: string;

  /** ETF name (e.g., "S&P 500") */
  name: string;

  /** Allocation percentage */
  weight: number;

  /** Median return for this ETF */
  medianReturn: number;
}

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

  /** Portfolio allocations. If provided, calculates blended returns with range. */
  portfolio?: PortfolioAllocation[];

  /** Index symbol (e.g., "SPY", "QQQ"). If provided, returns range projections. Ignored if portfolio is provided. */
  indexSymbol?: string;

  /** Expected annual return percentage (default: 7.0). Ignored if indexSymbol or portfolio is provided. */
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

  /** Portfolio allocations. If provided, calculates blended returns with range. */
  portfolio?: PortfolioAllocation[];

  /** Index symbol (e.g., "SPY", "QQQ"). If provided, returns range projections. Ignored if portfolio is provided. */
  indexSymbol?: string;

  /** Expected annual return percentage (default: 7.0). Ignored if indexSymbol or portfolio is provided. */
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

  /** Whether range data is available (true when indexSymbol or portfolio was provided) */
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

  /** Portfolio breakdown (only present when portfolio was provided) */
  portfolio?: PortfolioBreakdown[];

  /** Blended median return for portfolio */
  blendedMedianReturn?: number;
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

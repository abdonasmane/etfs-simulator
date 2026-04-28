/**
 * Models for the indexes endpoint.
 * Mirrors backend `marketdata.IndexInfo` and the `IndexesResponse` wrapper.
 */

/**
 * Metadata and statistics for one supported ETF / market index.
 */
export interface IndexInfo {
  symbol: string;
  name: string;
  description: string;
  medianReturn: number;
  pessimisticReturn: number;
  optimisticReturn: number;
  standardDeviation: number;
  dataYears: number;
  /** Human-readable first-available month, e.g. "Aug 2012". */
  dataStartDate: string;
  /** First-available year (machine-readable). Pairs with {@link dataStartMonth}. */
  dataStartYear: number;
  /** First-available month, 1-12 (machine-readable). */
  dataStartMonth: number;
  rollingPeriodYears: number;
}

/**
 * Response from GET /api/v1/indexes.
 */
export interface IndexesResponse {
  indexes: IndexInfo[];
}

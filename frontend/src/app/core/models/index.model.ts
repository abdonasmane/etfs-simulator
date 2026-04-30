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
  /**
   * Rolling-window length actually used for the percentile stats: 20, 10, or 5.
   * Zero means we couldn't compute statistics at all (under 5y of history) —
   * statistical projection endpoints (years/target) reject the symbol; the
   * What If endpoint still works since it uses live Yahoo prices.
   */
  rollingPeriodYears: number;
  /**
   * True when the symbol's rolling window had to fall back below the standard
   * 10-year (i.e., 5y was used) OR no statistics were computed at all (0y).
   * Frontend can dim or tag these in dropdowns to set expectations.
   */
  limitedHistory: boolean;
}

/**
 * Response from GET /api/v1/indexes.
 */
export interface IndexesResponse {
  indexes: IndexInfo[];
}

/**
 * Inflation adjustment helpers — convert nominal euro amounts at any past or
 * future date into "today's purchasing power".
 *
 * Why this matters: a nominal €871k in 2056 is NOT the same as €871k today
 * because inflation erodes purchasing power. Most retirement calculators
 * silently ignore this and quietly mislead users — we surface it as a
 * one-click toggle so users can see the honest, deflated picture.
 *
 * Convention: "today" is the current calendar month. Past values get
 * INFLATED UP (€500 in 2010 was worth more then than €500 today, so its
 * today's-purchasing-power equivalent is larger). Future values get
 * DEFLATED DOWN. The point that lies on "today" itself is unchanged.
 *
 * Default rate: 2.5%/yr. Eurozone HICP has averaged ~2.0% since 1999;
 * 2.5% is a slightly conservative anchor that accounts for recent years
 * and matches what most retirement planning tools use.
 */

/** Convert a (year, 1-indexed month) into a fractional-year decimal. */
export function yearMonthToDecimal(year: number, month: number): number {
  return year + (month - 1) / 12;
}

/** Today's date as a fractional-year decimal. Recomputed per call. */
export function todayDecimal(): number {
  const now = new Date();
  return now.getFullYear() + now.getMonth() / 12;
}

/**
 * Convert a nominal value at a given calendar date to its today's-euros
 * equivalent. `pointYearDecimal` can come from yearMonthToDecimal() or be
 * computed ad hoc (e.g., mid-point of a period).
 *
 * - yearsAgo > 0 (point is in the past)   → multiply (inflate up)
 * - yearsAgo < 0 (point is in the future) → divide (deflate down)
 */
export function nominalToReal(
  nominal: number,
  pointYearDecimal: number,
  annualRatePercent: number
): number {
  const yearsAgo = todayDecimal() - pointYearDecimal;
  return nominal * Math.pow(1 + annualRatePercent / 100, yearsAgo);
}

/**
 * Real-purchasing-power equivalent of a CUMULATIVE contribution sum.
 *
 * Strict accuracy would require iterating each individual contribution
 * with its own inflation factor — that's only practical when we have the
 * per-month projection list. For top-line summary numbers (where we only
 * have the total), use the mid-point of the simulation period as the
 * effective contribution date. The error is small because contributions
 * are evenly distributed and inflation factors are near-linear over the
 * window; the mid-point is the integral's center of mass.
 */
export function realCumulativeContributed(
  nominalSum: number,
  startYear: number,
  startMonth: number,
  endYear: number,
  endMonth: number,
  annualRatePercent: number
): number {
  const startDec = yearMonthToDecimal(startYear, startMonth);
  const endDec = yearMonthToDecimal(endYear, endMonth);
  return nominalToReal(nominalSum, (startDec + endDec) / 2, annualRatePercent);
}

/**
 * Convert a nominal annualized return into a real annualized return using
 * the Fisher equation: (1 + nominal) / (1 + inflation) - 1.
 *
 * Both inputs and outputs are PERCENTAGES (e.g. 8.5 means 8.5%). For the
 * common case of small rates this approximates `nominal - inflation`, but
 * the Fisher form is correct at all magnitudes.
 */
export function realAnnualizedReturn(nominalPercent: number, inflationRatePercent: number): number {
  const r = (1 + nominalPercent / 100) / (1 + inflationRatePercent / 100) - 1;
  return r * 100;
}

/** Parse a "YYYY-MM-DD" daily point key into a fractional year. */
export function isoDateToDecimal(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  // 30.44 = avg days/month; sub-month precision matters less than getting the
  // month right, but this gives a smooth deflator across daily points.
  return y + (m - 1) / 12 + (d - 1) / (12 * 30.44);
}

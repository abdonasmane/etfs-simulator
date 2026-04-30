/**
 * URL encode/decode helpers for shareable simulation links.
 *
 * Round-trips the user's form state through query parameters so a link like
 *   `/?mode=whatif&initial=1000&monthly=500&startYear=2010&startMonth=1&etf=SPY&compareEtf=QQQ`
 * lands the recipient on the exact same simulation result.
 *
 * Param naming favors readability over compactness — these URLs are meant
 * to be human-debuggable and shareable in plain text. Validation is lenient:
 * malformed or partial URLs return null and the page falls back to defaults
 * (rather than surfacing a user-hostile error).
 */
import { AllocationOutput } from '../../shared/components/portfolio-allocator/portfolio-allocator.component';
import { SimulationFormData } from './components/simulation-form/simulation-form.component';

/** Encode current form state into URLSearchParams. */
export function encodeSimulationParams(data: SimulationFormData): URLSearchParams {
  const p = new URLSearchParams();
  p.set('mode', data.mode);
  p.set('initial', String(data.initialInvestment));
  p.set('monthly', String(data.monthlyContribution));

  if (data.contributionGrowthRate > 0) {
    p.set('growth', stripTrailingZeros(data.contributionGrowthRate));
  }
  if (data.contributionGrowthAmount > 0) {
    p.set('growthAmount', String(data.contributionGrowthAmount));
  }

  if (data.mode === 'years' && data.years !== undefined) {
    p.set('years', String(data.years));
  }
  if (data.mode === 'target') {
    if (data.targetYear !== undefined) p.set('targetYear', String(data.targetYear));
    if (data.targetMonth !== undefined) p.set('targetMonth', String(data.targetMonth));
  }
  if (data.mode === 'whatif') {
    if (data.startYear !== undefined) p.set('startYear', String(data.startYear));
    if (data.startMonth !== undefined) p.set('startMonth', String(data.startMonth));
    if (data.compareIndexSymbol) p.set('compareEtf', data.compareIndexSymbol);
  }

  // Return source: portfolio > indexSymbol > annualReturnRate. Mutually exclusive.
  if (data.portfolio && data.portfolio.length > 0) {
    p.set('pf', data.portfolio.map(a => `${a.symbol}:${a.weight}`).join(','));
  } else if (data.indexSymbol) {
    p.set('etf', data.indexSymbol);
  } else if (data.annualReturnRate !== undefined) {
    p.set('rate', stripTrailingZeros(data.annualReturnRate));
  }

  return p;
}

/**
 * Decode URLSearchParams into a SimulationFormData. Returns null when the
 * URL is missing required fields or contains invalid values — the caller
 * then falls back to defaults silently.
 */
export function decodeSimulationParams(params: URLSearchParams): SimulationFormData | null {
  const mode = params.get('mode');
  if (mode !== 'years' && mode !== 'target' && mode !== 'whatif') return null;

  const initial = parseFiniteNonNegative(params.get('initial'));
  const monthly = parseFiniteNonNegative(params.get('monthly'));
  if (initial === null || monthly === null) return null;

  const data: SimulationFormData = {
    mode,
    initialInvestment: initial,
    monthlyContribution: monthly,
    contributionGrowthRate: clamp(parseNumber(params.get('growth')) ?? 0, 0, 20),
    contributionGrowthAmount: clamp(parseNumber(params.get('growthAmount')) ?? 0, 0, 10000),
  };

  if (mode === 'years') {
    const y = parseNumber(params.get('years'));
    if (y === null || y < 1 || y > 49) return null;
    data.years = y;
  } else if (mode === 'target') {
    const ty = parseNumber(params.get('targetYear'));
    if (ty === null) return null;
    const tm = parseNumber(params.get('targetMonth')) ?? 12;
    if (tm < 1 || tm > 12) return null;
    data.targetYear = ty;
    data.targetMonth = tm;
  } else {
    const sy = parseNumber(params.get('startYear'));
    if (sy === null || sy < 1993) return null;
    const sm = parseNumber(params.get('startMonth')) ?? 1;
    if (sm < 1 || sm > 12) return null;
    data.startYear = sy;
    data.startMonth = sm;
    const compareEtf = params.get('compareEtf');
    if (compareEtf) data.compareIndexSymbol = compareEtf;
  }

  // Return source: at most one of pf / etf / rate.
  const pf = params.get('pf');
  if (pf) {
    const portfolio = parsePortfolio(pf);
    if (portfolio === null) return null;
    data.portfolio = portfolio;
  } else if (params.has('etf')) {
    data.indexSymbol = params.get('etf')!;
  } else if (params.has('rate')) {
    const r = parseNumber(params.get('rate'));
    if (r === null || r < 0 || r > 100) return null;
    data.annualReturnRate = r;
  }

  return data;
}

/** Build the absolute share URL for the current location with given form data. */
export function buildShareUrl(data: SimulationFormData): string {
  const url = new URL(window.location.href);
  url.search = '?' + encodeSimulationParams(data).toString();
  url.hash = '';
  return url.toString();
}

// --- internals ---

function parseNumber(raw: string | null): number | null {
  if (raw === null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function parseFiniteNonNegative(raw: string | null): number | null {
  const n = parseNumber(raw);
  return n !== null && n >= 0 ? n : null;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}

/**
 * Parse "SPY:60,QQQ:30,EFA:10" into a portfolio allocation list. Returns null
 * when the string is malformed or weights don't sum cleanly to 100 (within
 * a small tolerance — the backend has stricter validation downstream).
 */
function parsePortfolio(raw: string): AllocationOutput[] | null {
  const parts = raw.split(',');
  const out: AllocationOutput[] = [];
  for (const p of parts) {
    const [symbol, weightStr] = p.split(':');
    if (!symbol || !weightStr) return null;
    const weight = Number(weightStr);
    if (!Number.isFinite(weight) || weight <= 0 || weight > 100) return null;
    out.push({ symbol: symbol.trim(), weight });
  }
  if (out.length === 0) return null;
  const total = out.reduce((sum, a) => sum + a.weight, 0);
  if (Math.abs(total - 100) > 0.5) return null;
  return out;
}

/** "3" instead of "3.0", "2.5" stays "2.5" — keeps URLs tidy. */
function stripTrailingZeros(n: number): string {
  return Number.isInteger(n) ? String(n) : String(n);
}

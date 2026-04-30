import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DecimalPipe } from '@angular/common';
import { trigger, transition, style, animate } from '@angular/animations';

import {
  ComparisonResult,
  ComparisonSide,
  DailyPoint,
  MonthProjection,
  SimulateSummary,
} from '../../../../core/models';
import { CompareSeries, GrowthChartComponent } from '../growth-chart/growth-chart.component';
import {
  isoDateToDecimal,
  nominalToReal,
  realAnnualizedReturn,
  realCumulativeContributed,
  yearMonthToDecimal,
} from '../../inflation.helper';

/**
 * Component displaying simulation results with chart and summary.
 */
@Component({
  selector: 'app-simulation-results',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, DecimalPipe, GrowthChartComponent],
  templateUrl: './simulation-results.component.html',
  styleUrl: './simulation-results.component.scss',
  animations: [
    trigger('expandCollapse', [
      transition(':enter', [
        style({ opacity: 0, height: 0, paddingTop: 0, paddingBottom: 0 }),
        animate(
          '200ms ease-out',
          style({ opacity: 1, height: '*', paddingTop: '*', paddingBottom: '*' })
        ),
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ opacity: 0, height: 0, paddingTop: 0, paddingBottom: 0 })),
      ]),
    ]),
  ],
})
export class SimulationResultsComponent {
  @Input({ required: true }) summary!: SimulateSummary;
  @Input({ required: true }) projections!: MonthProjection[];

  /**
   * High-resolution daily portfolio snapshots. When non-empty (What If mode),
   * the chart renders one point per trading day. When empty (years/target),
   * the chart falls back to the monthly projections.
   */
  @Input() dailyPoints: DailyPoint[] = [];

  /**
   * When set, renders the dual-card "ETF A vs ETF B" comparison layout
   * instead of the single-result layout. The chart pulls a second line from
   * the secondary side; summary cards stack side-by-side and highlight the
   * winner. Either side may be missing data (per-side error) — the layout
   * degrades gracefully.
   */
  @Input() comparison: ComparisonResult | null = null;

  /** View mode for projections table */
  showMonthly = false;

  /** Show/hide contribution milestones */
  showMilestones = false;

  /**
   * Projections to display in the table, after applying both the inflation
   * adjustment (if toggled on) and the yearly/monthly filter.
   */
  get displayedProjections(): MonthProjection[] {
    const base = this.displayProjections;
    if (this.showMonthly) return base;
    return base.filter((p, i) => p.month === 12 || i === base.length - 1);
  }

  /**
   * Toggle between monthly and yearly view.
   */
  toggleView(): void {
    this.showMonthly = !this.showMonthly;
  }

  /**
   * Toggle contribution milestones visibility.
   */
  toggleMilestones(): void {
    this.showMilestones = !this.showMilestones;
  }

  /**
   * Format month number to short name.
   */
  getMonthName(month: number): string {
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    return months[month - 1] || '';
  }

  /**
   * Calculate gain for a projection.
   */
  getGain(projection: MonthProjection): number {
    return projection.portfolioValue - projection.totalContributed;
  }

  /**
   * True when the displayed projection at index `i` has a lower portfolio
   * value than the previous DISPLAYED row. The comparison is against the
   * adjacent displayed row (not the underlying month) so yearly view picks
   * up year-over-year drops and monthly view picks up month-over-month
   * drops — both useful, both visualized the same way (red text + ▼).
   */
  isProjectionDrop(i: number): boolean {
    if (i <= 0) return false;
    const rows = this.displayedProjections;
    return rows[i].portfolioValue < rows[i - 1].portfolioValue;
  }

  /** Drop check for the primary side of the comparison table. */
  isPrimaryDrop(i: number): boolean {
    if (i <= 0) return false;
    const rows = this.comparisonRows;
    return rows[i].primaryValue < rows[i - 1].primaryValue;
  }

  /** Drop check for the secondary side of the comparison table. */
  isSecondaryDrop(i: number): boolean {
    if (i <= 0) return false;
    const rows = this.comparisonRows;
    return rows[i].secondaryValue < rows[i - 1].secondaryValue;
  }

  /**
   * Check if contribution milestones show any growth. Milestones are NOT
   * inflation-adjusted (they're literal monthly contribution amounts the
   * user will pay nominally) — so this reads from the raw summary.
   */
  get hasContributionGrowth(): boolean {
    return this.summary.contributionMilestones && this.summary.contributionMilestones.length > 0;
  }

  /** ETF color map for portfolio visualization — must mirror AVAILABLE_ETFS colors */
  private readonly etfColors: Record<string, string> = {
    SPY: '#4361ee',
    QQQ: '#7c3aed',
    EFA: '#0891b2',
    VTI: '#059669',
    IEMG: '#dc2626',
    'VWCE.DE': '#6366f1',
    'CSPX.L': '#2563eb',
    GLD: '#d97706',
    TLT: '#64748b',
    'ISDU.L': '#0d9488',
    'IGDA.L': '#b45309',
  };

  /**
   * Get color for an ETF symbol.
   */
  getETFColor(symbol: string): string {
    return this.etfColors[symbol] || '#64748b';
  }

  /** Primary chart line label when comparing (the symbol of the primary ETF). */
  get primaryChartLabel(): string | null {
    return this.comparison?.primary.symbol ?? null;
  }

  /**
   * Chart input for the secondary line. Returns null when not comparing or
   * when the secondary side has no data (errored). The chart in that case
   * falls back to single-line rendering of whichever side did succeed.
   * Includes dailyPoints when available so the secondary line also renders
   * at full daily resolution.
   */
  get secondaryChartSeries(): CompareSeries | null {
    const c = this.displayComparison; // already inflation-adjusted when toggle is on
    if (!c) return null;
    const { secondary, primary } = c;
    if (!primary.summary || !primary.projections) return null;
    if (!secondary.summary || !secondary.projections) return null;
    return {
      label: secondary.symbol,
      projections: secondary.projections,
      dailyPoints: secondary.dailyPoints,
    };
  }

  /**
   * The side whose `summary`+`projections` should drive the single-line chart
   * fallback when comparison overlay isn't possible (one side errored).
   */
  get fallbackChartSide(): ComparisonSide | null {
    if (!this.comparison) return null;
    const { primary, secondary } = this.comparison;
    if (primary.summary && primary.projections) return primary;
    if (secondary.summary && secondary.projections) return secondary;
    return null;
  }

  /**
   * Identify the higher-final-value side so we can highlight it. Returns null
   * when comparison is off, when sides tie, or when one side has no data.
   */
  get winningSide(): 'primary' | 'secondary' | null {
    const c = this.displayComparison;
    if (!c) return null;
    const a = c.primary.summary?.finalValue;
    const b = c.secondary.summary?.finalValue;
    if (a === undefined || b === undefined) return null;
    if (a === b) return null;
    return a > b ? 'primary' : 'secondary';
  }

  /**
   * Per-row comparison data for the growth-timeline table when comparing.
   * Aligned by (year, month) rather than by index — that way a one-month
   * leading-bar gap on either side doesn't shift values out of sync. Rows
   * where either side is missing the bar are dropped (a half-row would
   * confuse more than help).
   *
   * Honors the same yearly/monthly toggle as the single-side table.
   */
  get comparisonRows(): ComparisonRow[] {
    const c = this.displayComparison;
    if (!c) return [];
    const primary = c.primary.projections;
    const secondary = c.secondary.projections;
    if (!primary || !secondary) return [];

    const secondaryByKey = new Map<string, MonthProjection>();
    for (const p of secondary) {
      secondaryByKey.set(`${p.year}-${p.month}`, p);
    }

    const rows: ComparisonRow[] = [];
    for (const a of primary) {
      const b = secondaryByKey.get(`${a.year}-${a.month}`);
      if (!b) continue;
      const primaryGain = a.portfolioValue - a.totalContributed;
      const secondaryGain = b.portfolioValue - b.totalContributed;
      rows.push({
        year: a.year,
        month: a.month,
        totalContributed: a.totalContributed,
        primaryValue: a.portfolioValue,
        primaryGain,
        secondaryValue: b.portfolioValue,
        secondaryGain,
        rowWinner:
          a.portfolioValue === b.portfolioValue
            ? null
            : a.portfolioValue > b.portfolioValue
              ? 'primary'
              : 'secondary',
      });
    }

    if (this.showMonthly) return rows;
    // Yearly view: keep December of each year, plus the final row regardless.
    return rows.filter((r, i) => r.month === 12 || i === rows.length - 1);
  }

  // ─── Inflation adjustment ("Today's €" toggle) ───────────────────────

  /**
   * When true, every euro number on screen is adjusted to today's
   * purchasing power. State is owned by the page (so it can be encoded
   * into the share URL and survive a reload). We mirror it in a local
   * signal driven by setter/getter so template bindings stay reactive.
   */
  @Input() set realValues(v: boolean) {
    this._showRealValues.set(v);
  }
  private readonly _showRealValues = signal(false);
  readonly showRealValues = this._showRealValues.asReadonly();

  /** Emitted when the user flips the toggle. Page picks this up to re-sync the URL. */
  @Output() readonly realValuesChange = new EventEmitter<boolean>();

  /**
   * Annual inflation rate used for adjustments, in percent. 2.5% is a
   * reasonable anchor — eurozone HICP has averaged ~2.0% since 1999, and
   * 2.5% absorbs the recent above-target years. Hardcoded for v1; could
   * be a dropdown in v2 (1% / 2% / 2.5% / 3%).
   */
  readonly inflationRate = signal(2.5);

  /** Toggle the "Today's €" view. */
  toggleRealValues(): void {
    const next = !this._showRealValues();
    this._showRealValues.set(next);
    this.realValuesChange.emit(next);
  }

  // ─ Display getters: each one returns either the raw input (toggle OFF)
  // ─ or an inflation-adjusted view (toggle ON). The template binds to
  // ─ display* getters everywhere instead of the raw inputs.

  get displaySummary(): SimulateSummary {
    if (!this.showRealValues()) return this.summary;
    return this.adjustSummary(this.summary);
  }

  get displayProjections(): MonthProjection[] {
    if (!this.showRealValues()) return this.projections;
    return this.projections.map(p => this.adjustProjection(p));
  }

  get displayDailyPoints(): DailyPoint[] {
    if (!this.showRealValues()) return this.dailyPoints;
    const r = this.inflationRate();
    return this.dailyPoints.map(p => {
      const dec = isoDateToDecimal(p.date);
      return {
        date: p.date,
        portfolioValue: nominalToReal(p.portfolioValue, dec, r),
        totalContributed: nominalToReal(p.totalContributed, dec, r),
      };
    });
  }

  /** Returns inflation-adjusted version of comparison.primary/secondary. */
  get displayComparison(): ComparisonResult | null {
    const c = this.comparison;
    if (!c || !this.showRealValues()) return c;
    return {
      primary: this.adjustComparisonSide(c.primary),
      secondary: this.adjustComparisonSide(c.secondary),
    };
  }

  private adjustComparisonSide(side: ComparisonSide): ComparisonSide {
    if (!side.summary || !side.projections) return side;
    return {
      ...side,
      summary: this.adjustSummary(side.summary),
      projections: side.projections.map(p => this.adjustProjection(p)),
      dailyPoints: side.dailyPoints?.map(p => {
        const dec = isoDateToDecimal(p.date);
        const r = this.inflationRate();
        return {
          date: p.date,
          portfolioValue: nominalToReal(p.portfolioValue, dec, r),
          totalContributed: nominalToReal(p.totalContributed, dec, r),
        };
      }),
    };
  }

  private adjustProjection(p: MonthProjection): MonthProjection {
    const r = this.inflationRate();
    const dec = yearMonthToDecimal(p.year, p.month);
    return {
      ...p,
      portfolioValue: nominalToReal(p.portfolioValue, dec, r),
      totalContributed: nominalToReal(p.totalContributed, dec, r),
      pessimisticValue:
        p.pessimisticValue !== undefined ? nominalToReal(p.pessimisticValue, dec, r) : undefined,
      optimisticValue:
        p.optimisticValue !== undefined ? nominalToReal(p.optimisticValue, dec, r) : undefined,
    };
  }

  /**
   * Adjust a summary in-place semantically: end-of-period values use the
   * end-date factor; cumulative contributed uses the mid-period factor;
   * gains and percentages are recomputed from the adjusted values; the
   * annualized return uses the Fisher equation.
   */
  private adjustSummary(s: SimulateSummary): SimulateSummary {
    const r = this.inflationRate();
    const projections = this.projections.length > 0 ? this.projections : null;
    if (!projections) return s;

    const startMonth = projections[0];
    const endMonth = projections[projections.length - 1];
    const endDec = yearMonthToDecimal(endMonth.year, endMonth.month);

    const finalValue = nominalToReal(s.finalValue, endDec, r);
    const totalContributed = realCumulativeContributed(
      s.totalContributed,
      startMonth.year,
      startMonth.month,
      endMonth.year,
      endMonth.month,
      r
    );
    const totalGain = finalValue - totalContributed;
    const percentageGain =
      totalContributed > 0 ? Math.round((totalGain / totalContributed) * 1000) / 10 : 0;

    const pessimisticValue =
      s.pessimisticValue !== undefined ? nominalToReal(s.pessimisticValue, endDec, r) : undefined;
    const optimisticValue =
      s.optimisticValue !== undefined ? nominalToReal(s.optimisticValue, endDec, r) : undefined;
    const pessimisticGain =
      pessimisticValue !== undefined ? pessimisticValue - totalContributed : undefined;
    const optimisticGain =
      optimisticValue !== undefined ? optimisticValue - totalContributed : undefined;
    const pessimisticPercent =
      pessimisticGain !== undefined && totalContributed > 0
        ? Math.round((pessimisticGain / totalContributed) * 1000) / 10
        : undefined;
    const optimisticPercent =
      optimisticGain !== undefined && totalContributed > 0
        ? Math.round((optimisticGain / totalContributed) * 1000) / 10
        : undefined;

    const annualizedReturn =
      s.annualizedReturn !== undefined
        ? Math.round(realAnnualizedReturn(s.annualizedReturn, r) * 10) / 10
        : undefined;

    return {
      ...s,
      finalValue,
      totalContributed,
      totalGain,
      percentageGain,
      pessimisticValue,
      optimisticValue,
      pessimisticGain,
      optimisticGain,
      pessimisticPercent,
      optimisticPercent,
      annualizedReturn,
    };
  }

  // ─── Share button + toast ────────────────────────────────────────────
  /** Toast message shown after a share / copy action. Empty = hidden. */
  readonly shareToast = signal<string>('');
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Share or copy the URL of the current simulation. Strategy:
   *   1. If `navigator.share` is available (most mobile + Edge/Safari on
   *      desktop), open the native share sheet — the user gets all their
   *      OS-installed share targets (Messages, AirDrop, WhatsApp, "Copy",
   *      etc.) and we don't have to second-guess.
   *   2. Otherwise, write the URL to the clipboard. Modern browsers allow
   *      this from a click handler in a secure context (HTTPS / localhost).
   *   3. If clipboard fails (insecure context, denied permission), fall
   *      back to a manual prompt with the URL pre-filled — the user can
   *      copy it themselves.
   *
   * In all cases we surface a small toast so there's no silent failure.
   */
  async share(): Promise<void> {
    const url = window.location.href;

    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        // Only pass `url` — never `text`. Some platforms (Edge / macOS Safari
        // with Web Share, plus several OS share sheets when the user picks
        // "Copy") concatenate `text + url` into the clipboard, which makes
        // pasting into a URL bar fail. With just `url`, every target gets a
        // pure link; messaging apps auto-render previews and the user adds
        // their own commentary if they want.
        await navigator.share({ url });
        // User completed the native share — no toast needed (the OS handled it).
        return;
      } catch (err) {
        // AbortError = user cancelled → silent, no fallback needed.
        if ((err as DOMException)?.name === 'AbortError') return;
        // Other errors (NotAllowedError, etc.) → fall through to clipboard.
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      this.flashToast('Link copied to clipboard');
    } catch {
      // Clipboard not available — last-resort fallback uses prompt() so the
      // user at least sees the URL and can long-press / Cmd+C to copy it.
      window.prompt('Copy this link to share your simulation:', url);
    }
  }

  private flashToast(message: string): void {
    this.shareToast.set(message);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.shareToast.set(''), 2500);
  }
}

/** One row of the side-by-side growth-timeline table in comparison mode. */
interface ComparisonRow {
  year: number;
  month: number;
  totalContributed: number;
  primaryValue: number;
  primaryGain: number;
  secondaryValue: number;
  secondaryGain: number;
  /** Higher-portfolio-value side at this row, or null on ties. */
  rowWinner: 'primary' | 'secondary' | null;
}

import { Component, Input } from '@angular/core';
import { CommonModule, CurrencyPipe, DecimalPipe } from '@angular/common';
import { trigger, transition, style, animate } from '@angular/animations';

import {
  ComparisonResult,
  ComparisonSide,
  MonthProjection,
  SimulateSummary,
} from '../../../../core/models';
import { CompareSeries, GrowthChartComponent } from '../growth-chart/growth-chart.component';

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
   * Get projections to display based on view mode.
   */
  get displayedProjections(): MonthProjection[] {
    if (this.showMonthly) {
      return this.projections;
    }
    // Show December of each year, or last projection
    return this.projections.filter((p, i) => p.month === 12 || i === this.projections.length - 1);
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
   * Check if contribution milestones show any growth.
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
   */
  get secondaryChartSeries(): CompareSeries | null {
    if (!this.comparison) return null;
    const { secondary, primary } = this.comparison;
    // If the primary errored but secondary succeeded, the secondary becomes
    // the primary line on the chart — no compare overlay needed.
    if (!primary.summary || !primary.projections) return null;
    if (!secondary.summary || !secondary.projections) return null;
    return { label: secondary.symbol, projections: secondary.projections };
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
    if (!this.comparison) return null;
    const a = this.comparison.primary.summary?.finalValue;
    const b = this.comparison.secondary.summary?.finalValue;
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
    if (!this.comparison) return [];
    const primary = this.comparison.primary.projections;
    const secondary = this.comparison.secondary.projections;
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

import {
  Component,
  Input,
  OnChanges,
  SimpleChanges,
  ElementRef,
  ViewChild,
  AfterViewInit,
  HostListener,
  inject,
  effect,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, ChartConfiguration, ChartDataset, registerables } from 'chart.js';

import { DailyPoint, MonthProjection } from '../../../../core/models';
import { ThemeService } from '../../../../core/services';

// Register Chart.js components
Chart.register(...registerables);

/** A secondary projection series rendered alongside the primary one. */
export interface CompareSeries {
  /** Display label (typically the ETF symbol). */
  label: string;
  /** Monthly projection fallback. */
  projections: MonthProjection[];
  /**
   * Optional daily points. When present (What If mode), the chart renders the
   * comparison line at full daily resolution alongside the primary line.
   */
  dailyPoints?: DailyPoint[];
}

/**
 * Interactive growth chart with daily-resolution rendering when daily points
 * are supplied (What If mode), monthly otherwise. Includes a fullscreen zoom
 * modal triggered by the expand icon — useful for inspecting long-window
 * simulations where ~4,000 daily points compress into a small inline canvas.
 */
@Component({
  selector: 'app-growth-chart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="chart-shell">
      <button
        type="button"
        class="zoom-btn"
        (click)="openZoom()"
        aria-label="Expand chart"
        title="Expand chart"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="15 3 21 3 21 9"></polyline>
          <polyline points="9 21 3 21 3 15"></polyline>
          <line x1="21" y1="3" x2="14" y2="10"></line>
          <line x1="3" y1="21" x2="10" y2="14"></line>
        </svg>
      </button>
      <div class="chart-container">
        <canvas #chartCanvas></canvas>
      </div>
    </div>

    @if (isZoomed()) {
      <div
        class="zoom-overlay"
        (click)="onOverlayClick($event)"
        (keydown.escape)="closeZoom()"
        role="dialog"
        aria-modal="true"
        aria-label="Expanded chart — press Escape or click outside to close"
        tabindex="0"
      >
        <div class="zoom-frame">
          <button
            type="button"
            class="zoom-close-btn"
            (click)="closeZoom()"
            aria-label="Close expanded chart"
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.4"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
          <div class="zoom-canvas-wrap">
            <canvas #zoomCanvas></canvas>
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .chart-shell {
        position: relative;
      }

      .chart-container {
        position: relative;
        width: 100%;
        height: 320px;
        background: var(--color-bg-secondary);
        border: 1px solid var(--color-border);
        border-radius: 8px;
        padding: 1.25rem;
        transition:
          background-color 0.25s ease,
          border-color 0.25s ease;
      }

      .zoom-btn {
        position: absolute;
        top: 0.5rem;
        right: 0.5rem;
        z-index: 2;
        width: 28px;
        height: 28px;
        border: 1px solid var(--color-border);
        background: var(--color-bg-secondary);
        color: var(--color-text-muted);
        border-radius: 6px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition:
          color 0.15s ease,
          background 0.15s ease,
          border-color 0.15s ease,
          transform 0.15s ease;
        padding: 0;
      }

      .zoom-btn:hover {
        color: var(--color-accent);
        border-color: var(--color-accent);
        background: var(--color-accent-light);
        transform: translateY(-1px);
      }

      .zoom-btn:active {
        transform: translateY(0);
      }

      /* ---- Fullscreen zoom modal ---- */
      .zoom-overlay {
        position: fixed;
        inset: 0;
        background: rgba(9, 9, 11, 0.72);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 3rem 2rem;
        animation: zoomFadeIn 0.18s ease-out;
      }

      .zoom-frame {
        position: relative;
        width: min(1280px, 96vw);
        height: min(800px, 88vh);
        background: var(--color-bg-secondary);
        border: 1px solid var(--color-border);
        border-radius: 12px;
        box-shadow:
          0 24px 64px rgba(0, 0, 0, 0.45),
          0 4px 16px rgba(0, 0, 0, 0.3);
        padding: 1.5rem 1.5rem 1.25rem;
        display: flex;
        flex-direction: column;
        animation: zoomScaleIn 0.22s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .zoom-close-btn {
        position: absolute;
        top: 0.5rem;
        right: 0.5rem;
        z-index: 10;
        width: 24px;
        height: 24px;
        border: 1px solid var(--color-border);
        background: var(--color-bg-secondary);
        color: var(--color-text-muted);
        border-radius: 6px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition:
          color 0.15s ease,
          background 0.15s ease,
          border-color 0.15s ease;
        padding: 0;
      }

      .zoom-close-btn:hover {
        color: var(--color-text-primary);
        background: var(--color-bg-tertiary);
        border-color: var(--color-border-strong);
      }

      .zoom-canvas-wrap {
        flex: 1;
        min-height: 0;
        position: relative;
      }

      @keyframes zoomFadeIn {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }

      @keyframes zoomScaleIn {
        from {
          opacity: 0;
          transform: scale(0.96);
        }
        to {
          opacity: 1;
          transform: scale(1);
        }
      }
    `,
  ],
})
export class GrowthChartComponent implements AfterViewInit, OnChanges {
  @Input({ required: true }) projections!: MonthProjection[];

  /**
   * High-resolution daily portfolio snapshots. When non-empty, the chart
   * renders one point per trading day instead of one per month — captures
   * intra-month volatility properly. Empty falls back to projections.
   */
  @Input() dailyPoints: DailyPoint[] = [];

  /** When true, renders chart in historical amber/gold color scheme */
  @Input() isHistorical = false;

  /** Optional label for the primary line when comparing (e.g. "SPY"). */
  @Input() primaryLabel: string | null = null;

  /**
   * Optional second projection series for ETF-vs-ETF comparison. When set,
   * the "Total Contributed" line is hidden (identical between sides — adds
   * noise) and both portfolio lines render in distinct colors.
   */
  @Input() compareSeries: CompareSeries | null = null;

  @ViewChild('chartCanvas') chartCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('zoomCanvas') zoomCanvas?: ElementRef<HTMLCanvasElement>;

  /** Modal open/closed state. */
  readonly isZoomed = signal(false);

  private readonly themeService = inject(ThemeService);
  private chart: Chart | null = null;
  private zoomChart: Chart | null = null;

  constructor() {
    // Recreate the inline chart on theme changes.
    effect(() => {
      this.themeService.theme();
      if (this.chart && this.chartCanvas?.nativeElement) {
        this.chart.destroy();
        this.chart = null;
        this.createChart();
      }
      // Also rebuild the zoom chart while it's open.
      if (this.zoomChart && this.zoomCanvas?.nativeElement) {
        this.zoomChart.destroy();
        this.zoomChart = null;
        this.createZoomChart();
      }
    });
  }

  ngAfterViewInit(): void {
    this.createChart();
  }

  ngOnChanges(changes: SimpleChanges): void {
    const relevant =
      changes['projections'] ||
      changes['dailyPoints'] ||
      changes['isHistorical'] ||
      changes['compareSeries'] ||
      changes['primaryLabel'];
    if (relevant && this.chart) {
      this.updateChart();
    }
    if (relevant && this.zoomChart) {
      // Rebuild the zoom chart on data changes too — its canvas dimensions
      // are different so a fresh build is cleaner than mutating in place.
      this.zoomChart.destroy();
      this.zoomChart = null;
      this.createZoomChart();
    }
  }

  /** Open the fullscreen zoom modal and instantiate its chart. */
  openZoom(): void {
    if (this.isZoomed()) return;
    this.isZoomed.set(true);
    // Wait for the modal's open animation to finish before instantiating
    // the chart. While the modal is animating (`zoomScaleIn`, 220ms),
    // CSS `transform: scale()` makes getBoundingClientRect() report
    // animation-time-scaled dimensions. Chart.js measures during creation,
    // so creating mid-animation locks it to ~96% of the final size; the
    // chart then visually "grows" the first time the user hovers (Chart.js
    // re-measures at full size during a hover redraw). Waiting past the
    // animation duration ensures we measure final dimensions on the first
    // shot. 240ms = 220ms animation + 20ms slack.
    window.setTimeout(() => this.createZoomChart(), 240);
  }

  /** Close the fullscreen zoom modal and tear down its chart. */
  closeZoom(): void {
    if (!this.isZoomed()) return;
    if (this.zoomChart) {
      this.zoomChart.destroy();
      this.zoomChart = null;
    }
    this.isZoomed.set(false);
  }

  /**
   * Backdrop-click handler. Closes the modal only when the click landed
   * directly on the overlay (not on the inner frame) — that way clicks on
   * the chart, axis labels, or close button don't propagate-close.
   */
  onOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closeZoom();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.isZoomed()) this.closeZoom();
  }

  /** Get theme-aware colors */
  private get colors(): {
    text: string;
    textMuted: string;
    grid: string;
    accent: string;
    accentLight: string;
    contributed: string;
    optimistic: string;
    pessimistic: string;
    tooltipBg: string;
    compare: string;
    compareLight: string;
  } {
    const isDark = this.themeService.isDark();
    return isDark
      ? {
          text: '#fafafa',
          textMuted: '#737373',
          grid: '#26262b',
          accent: '#818cf8',
          accentLight: 'rgba(129, 140, 248, 0.15)',
          contributed: '#525258',
          optimistic: 'rgba(74, 222, 128, 0.5)',
          pessimistic: 'rgba(248, 113, 113, 0.5)',
          tooltipBg: '#131316',
          compare: '#fbbf24',
          compareLight: 'rgba(251, 191, 36, 0.15)',
        }
      : {
          text: '#09090b',
          textMuted: '#a3a3a3',
          grid: '#f0f0f0',
          accent: '#4f46e5',
          accentLight: 'rgba(79, 70, 229, 0.1)',
          contributed: '#a3a3a3',
          optimistic: 'rgba(21, 128, 61, 0.4)',
          pessimistic: 'rgba(185, 28, 28, 0.4)',
          tooltipBg: '#09090b',
          compare: '#b45309',
          compareLight: 'rgba(180, 83, 9, 0.1)',
        };
  }

  private createChart(): void {
    if (!this.chartCanvas?.nativeElement || !this.projections?.length) {
      return;
    }
    const ctx = this.chartCanvas.nativeElement.getContext('2d');
    if (!ctx) return;
    this.chart = new Chart(ctx, this.buildConfig(ctx));
  }

  private updateChart(): void {
    if (!this.chart) {
      this.createChart();
      return;
    }
    const ctx = this.chartCanvas.nativeElement.getContext('2d');
    if (!ctx) return;
    const config = this.buildConfig(ctx);
    this.chart.data.labels = config.data.labels;
    this.chart.data.datasets = config.data.datasets;
    this.chart.update('none');
  }

  private createZoomChart(): void {
    if (!this.zoomCanvas?.nativeElement || !this.projections?.length) return;
    const ctx = this.zoomCanvas.nativeElement.getContext('2d');
    if (!ctx) return;
    this.zoomChart = new Chart(ctx, this.buildConfig(ctx));
  }

  /**
   * Build a complete Chart.js configuration. Used for both the inline chart
   * and the zoom-modal chart so styling stays in lockstep.
   */
  private buildConfig(ctx: CanvasRenderingContext2D): ChartConfiguration<'line'> {
    const data = this.getChartData();
    const datasets = this.buildDatasets(ctx, data);
    const colors = this.colors;
    return {
      type: 'line',
      data: { labels: data.labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        devicePixelRatio: Math.max(window.devicePixelRatio || 1, 2),
        // Same draw-in animation across all modes for visual consistency.
        // Daily mode renders ~4k points so we tighten the duration so it
        // doesn't feel sluggish; monthly modes use Chart.js's default.
        animation: this.usingDaily ? { duration: 500, easing: 'easeOutQuart' } : undefined,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            align: 'end',
            labels: {
              usePointStyle: true,
              pointStyle: 'circle',
              boxWidth: 8,
              boxHeight: 8,
              padding: 16,
              color: colors.text,
              font: {
                size: 11,
                weight: 500,
                family: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
              },
            },
          },
          tooltip: {
            backgroundColor: colors.tooltipBg,
            titleColor: '#ffffff',
            bodyColor: '#d4d4d4',
            borderColor: 'rgba(255,255,255,0.06)',
            borderWidth: 1,
            titleFont: {
              size: 12,
              weight: 600,
              family: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
            },
            bodyFont: {
              size: 12,
              family: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
            },
            padding: 10,
            cornerRadius: 6,
            displayColors: true,
            boxPadding: 4,
            usePointStyle: true,
            callbacks: {
              label: (context): string => {
                const value = context.parsed.y ?? 0;
                return ` ${context.dataset.label}  €${value.toLocaleString('de-DE', { maximumFractionDigits: 0 })}`;
              },
            },
          },
        },
        scales: {
          x: {
            display: true,
            grid: { display: false },
            border: { color: colors.grid },
            ticks: {
              maxTicksLimit: 8,
              autoSkip: true,
              maxRotation: 0,
              font: {
                size: 10,
                family: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
              },
              color: colors.textMuted,
            },
          },
          y: {
            display: true,
            grid: { color: colors.grid, tickLength: 0 },
            border: { display: false },
            ticks: {
              callback: (value): string =>
                `€${Number(value).toLocaleString('de-DE', { notation: 'compact' })}`,
              font: {
                size: 10,
                family: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
              },
              color: colors.textMuted,
              padding: 8,
            },
          },
        },
      },
    };
  }

  /**
   * Build chart datasets. Layout precedence:
   *   1. range area (pessimistic/optimistic) when present
   *   2. comparison series — two portfolio lines, no fills (overlay-readable)
   *   3. otherwise: single portfolio line + filled "Total Contributed"
   *
   * In daily mode point markers are disabled (4000+ dots clutter); only
   * hover surfaces a marker. Borders are slightly thinner.
   */
  private buildDatasets(
    ctx: CanvasRenderingContext2D,
    data: ReturnType<typeof this.getChartData>
  ): ChartDataset<'line'>[] {
    const datasets: ChartDataset<'line'>[] = [];
    const colors = this.colors;
    const isDark = this.themeService.isDark();
    const daily = this.usingDaily;

    if (this.compareSeries) {
      const primaryLabel = this.primaryLabel ?? 'Primary';
      datasets.push({
        label: primaryLabel,
        data: data.portfolioValues,
        borderColor: colors.accent,
        backgroundColor: 'transparent',
        fill: false,
        tension: daily ? 0.05 : 0.4,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: colors.accent,
        pointHoverBorderColor: isDark ? '#1e293b' : '#ffffff',
        pointHoverBorderWidth: 2,
        borderWidth: daily ? 1.5 : 2.5,
      });

      datasets.push({
        label: this.compareSeries.label,
        data: data.compareValues ?? [],
        borderColor: colors.compare,
        backgroundColor: 'transparent',
        fill: false,
        tension: daily ? 0.05 : 0.4,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: colors.compare,
        pointHoverBorderColor: isDark ? '#1e293b' : '#ffffff',
        pointHoverBorderWidth: 2,
        borderWidth: daily ? 1.5 : 2.5,
      });

      datasets.push({
        label: 'Total Contributed',
        data: data.contributions,
        borderColor: colors.contributed,
        backgroundColor: 'transparent',
        fill: false,
        tension: daily ? 0 : 0.4,
        pointRadius: 0,
        pointHoverRadius: 6,
        borderWidth: 1.5,
        borderDash: [5, 5],
      });

      return datasets;
    }

    if (data.optimisticValues && data.pessimisticValues) {
      datasets.push({
        label: 'Optimistic',
        data: data.optimisticValues,
        borderColor: colors.optimistic,
        backgroundColor: 'transparent',
        fill: false,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 2,
        borderDash: [4, 4],
      });

      datasets.push({
        label: 'Pessimistic',
        data: data.pessimisticValues,
        borderColor: colors.pessimistic,
        backgroundColor: colors.accentLight,
        fill: '-1',
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 2,
        borderDash: [4, 4],
      });
    }

    datasets.push({
      label: this.isHistorical
        ? 'Actual Portfolio Value'
        : this.hasRangeData
          ? 'Expected (Median)'
          : 'Portfolio Value',
      data: data.portfolioValues,
      borderColor: colors.accent,
      backgroundColor: this.hasRangeData
        ? 'transparent'
        : this.createGradient(ctx, colors.accent, daily ? 0.18 : 0.3),
      fill: !this.hasRangeData,
      tension: daily ? 0.05 : 0.4,
      pointRadius: 0,
      pointHoverRadius: 6,
      pointHoverBackgroundColor: colors.accent,
      pointHoverBorderColor: isDark ? '#1e293b' : '#ffffff',
      pointHoverBorderWidth: 2,
      borderWidth: daily ? 1.6 : 2.5,
    });

    datasets.push({
      label: 'Total Contributed',
      data: data.contributions,
      borderColor: colors.contributed,
      backgroundColor: this.createGradient(ctx, colors.contributed, daily ? 0.08 : 0.15),
      fill: !daily,
      tension: daily ? 0 : 0.4,
      pointRadius: 0,
      pointHoverRadius: 6,
      pointHoverBackgroundColor: colors.contributed,
      pointHoverBorderColor: isDark ? '#1e293b' : '#ffffff',
      pointHoverBorderWidth: 2,
      borderDash: [5, 5],
      borderWidth: daily ? 1.2 : 2,
    });

    return datasets;
  }

  /**
   * Check if projections have range data (pessimistic/optimistic values).
   */
  private get hasRangeData(): boolean {
    return this.projections?.length > 0 && this.projections[0].pessimisticValue !== undefined;
  }

  /** True when we're rendering the chart from daily points (vs monthly). */
  private get usingDaily(): boolean {
    return this.dailyPoints.length > 0;
  }

  private getChartData(): {
    labels: string[];
    portfolioValues: number[];
    contributions: number[];
    pessimisticValues?: number[];
    optimisticValues?: number[];
    compareValues?: number[];
  } {
    if (this.usingDaily) {
      return this.getDailyChartData();
    }
    return this.getMonthlyChartData();
  }

  /**
   * Build chart series from daily points — one entry per trading day. Compare
   * mode aligns the secondary side by date string; days only one side has
   * (rare with major ETFs but possible at LSE/NYSE holiday gaps) get the
   * carry-forward value from the most recent shared day.
   */
  private getDailyChartData(): ReturnType<typeof this.getChartData> {
    const primary = this.dailyPoints;
    const labels = primary.map(p => this.formatDailyLabel(p.date));
    const portfolioValues = primary.map(p => p.portfolioValue);
    const contributions = primary.map(p => p.totalContributed);

    const data: ReturnType<typeof this.getChartData> = {
      labels,
      portfolioValues,
      contributions,
    };

    if (this.compareSeries?.dailyPoints?.length) {
      const secByDate = new Map<string, number>();
      for (const p of this.compareSeries.dailyPoints) {
        secByDate.set(p.date, p.portfolioValue);
      }
      let lastSeen = secByDate.get(primary[0].date) ?? 0;
      data.compareValues = primary.map(p => {
        const v = secByDate.get(p.date);
        if (v !== undefined) lastSeen = v;
        return lastSeen;
      });
    }

    return data;
  }

  private getMonthlyChartData(): ReturnType<typeof this.getChartData> {
    const sampledProjections = this.sampleProjections(this.projections);

    const data: ReturnType<typeof this.getChartData> = {
      labels: sampledProjections.map(p => this.formatMonthLabel(p.year, p.month)),
      portfolioValues: sampledProjections.map(p => p.portfolioValue),
      contributions: sampledProjections.map(p => p.totalContributed),
    };

    if (this.hasRangeData) {
      data.pessimisticValues = sampledProjections.map(p => p.pessimisticValue!);
      data.optimisticValues = sampledProjections.map(p => p.optimisticValue!);
    }

    if (this.compareSeries) {
      const sampledCompare = this.sampleProjections(this.compareSeries.projections);
      const len = Math.min(sampledProjections.length, sampledCompare.length);
      data.labels = data.labels.slice(0, len);
      data.portfolioValues = data.portfolioValues.slice(0, len);
      data.contributions = data.contributions.slice(0, len);
      data.compareValues = sampledCompare.slice(0, len).map(p => p.portfolioValue);
    }

    return data;
  }

  /**
   * Down-sample monthly projections for cleaner long-window charts.
   *
   * Both endpoints (index 0 and index length-1) are always included, and the
   * remaining samples are spaced evenly between them. The previous "every Nth
   * index, plus the last" strategy left an irregular FINAL gap (e.g. for a
   * 240-month sim with N=6, sampled indices ended …, 234, 239 — a 5-month
   * gap rendered at the same X-distance as every prior 6-month gap, which
   * visually looked like the curve "went flat" in the last segment).
   * Even-spacing eliminates the artifact.
   */
  private sampleProjections(projections: MonthProjection[]): MonthProjection[] {
    const total = projections.length;
    if (total <= 24) return projections;

    const step = total <= 60 ? 3 : 6;
    const targetCount = Math.max(2, Math.floor((total - 1) / step) + 1);
    const last = total - 1;
    const indices = new Set<number>();
    for (let k = 0; k < targetCount; k++) {
      indices.add(Math.round((k * last) / (targetCount - 1)));
    }
    return projections.filter((_, i) => indices.has(i));
  }

  private formatMonthLabel(year: number, month: number): string {
    const monthNames = [
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
    return `${monthNames[month - 1]} ${year}`;
  }

  /**
   * Format a "YYYY-MM-DD" date string for the daily X-axis. We show the day
   * in the tooltip (Chart.js renders the full label string on hover) but
   * autoSkip + maxTicksLimit keeps the visible axis sparse — only every Nth
   * label is drawn, so daily granularity reads as a smooth time axis without
   * clutter.
   */
  private formatDailyLabel(date: string): string {
    const monthNames = [
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
    const [y, m, d] = date.split('-');
    return `${monthNames[Number(m) - 1]} ${Number(d)}, ${y}`;
  }

  private createGradient(
    ctx: CanvasRenderingContext2D,
    color: string,
    opacity: number
  ): CanvasGradient {
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, this.hexToRgba(color, opacity));
    gradient.addColorStop(1, this.hexToRgba(color, 0));
    return gradient;
  }

  private hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
}

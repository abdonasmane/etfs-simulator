import {
  Component,
  Input,
  OnChanges,
  SimpleChanges,
  ElementRef,
  ViewChild,
  AfterViewInit,
  inject,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, registerables } from 'chart.js';

import { MonthProjection } from '../../../../core/models';
import { ThemeService } from '../../../../core/services';

// Register Chart.js components
Chart.register(...registerables);

/**
 * Interactive area chart showing portfolio growth over time.
 * Similar to iShares savings calculator visualization.
 */
@Component({
  selector: 'app-growth-chart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="chart-container">
      <canvas #chartCanvas></canvas>
    </div>
  `,
  styles: [
    `
      .chart-container {
        position: relative;
        width: 100%;
        height: 300px;
        background: var(--color-bg-secondary);
        border-radius: 12px;
        padding: 1rem;
        box-shadow: 0 2px 4px var(--color-card-shadow);
        transition: background-color 0.3s ease;
      }
    `,
  ],
})
export class GrowthChartComponent implements AfterViewInit, OnChanges {
  @Input({ required: true }) projections!: MonthProjection[];

  @ViewChild('chartCanvas') chartCanvas!: ElementRef<HTMLCanvasElement>;

  private readonly themeService = inject(ThemeService);
  private chart: Chart | null = null;

  constructor() {
    // Recreate chart when theme changes
    effect(() => {
      // Access the signal to subscribe to changes
      this.themeService.theme();
      if (this.chart && this.chartCanvas?.nativeElement) {
        this.chart.destroy();
        this.chart = null;
        this.createChart();
      }
    });
  }

  ngAfterViewInit(): void {
    this.createChart();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['projections'] && this.chart) {
      this.updateChart();
    }
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
  } {
    const isDark = this.themeService.isDark();
    return isDark
      ? {
          text: '#f1f5f9',
          textMuted: '#94a3b8',
          grid: '#334155',
          accent: '#818cf8',
          accentLight: 'rgba(129, 140, 248, 0.2)',
          contributed: '#64748b',
          optimistic: 'rgba(52, 211, 153, 0.6)',
          pessimistic: 'rgba(248, 113, 113, 0.6)',
          tooltipBg: '#1e293b',
        }
      : {
          text: '#1a1a2e',
          textMuted: '#94a3b8',
          grid: '#f1f5f9',
          accent: '#4361ee',
          accentLight: 'rgba(67, 97, 238, 0.15)',
          contributed: '#94a3b8',
          optimistic: 'rgba(34, 197, 94, 0.5)',
          pessimistic: 'rgba(239, 68, 68, 0.5)',
          tooltipBg: '#1a1a2e',
        };
  }

  private createChart(): void {
    if (!this.chartCanvas?.nativeElement || !this.projections?.length) {
      return;
    }

    const ctx = this.chartCanvas.nativeElement.getContext('2d');
    if (!ctx) return;

    const data = this.getChartData();
    const datasets = this.buildDatasets(ctx, data);

    const colors = this.colors;

    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.labels,
        datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        devicePixelRatio: Math.max(window.devicePixelRatio || 1, 2),
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
              padding: 20,
              color: colors.text,
              font: {
                size: 12,
                family: '-apple-system, BlinkMacSystemFont, sans-serif',
              },
            },
          },
          tooltip: {
            backgroundColor: colors.tooltipBg,
            titleColor: '#ffffff',
            bodyColor: '#e2e8f0',
            titleFont: {
              size: 14,
              weight: 'bold',
            },
            bodyFont: {
              size: 13,
            },
            padding: 12,
            cornerRadius: 8,
            callbacks: {
              label: (context): string => {
                const value = context.parsed.y ?? 0;
                return `${context.dataset.label}: €${value.toLocaleString('de-DE', { maximumFractionDigits: 0 })}`;
              },
            },
          },
        },
        scales: {
          x: {
            display: true,
            grid: {
              display: false,
            },
            ticks: {
              maxTicksLimit: 8,
              font: {
                size: 11,
              },
              color: colors.textMuted,
            },
          },
          y: {
            display: true,
            grid: {
              color: colors.grid,
            },
            ticks: {
              callback: (value): string => `€${Number(value).toLocaleString('de-DE', { notation: 'compact' })}`,
              font: {
                size: 11,
              },
              color: colors.textMuted,
            },
          },
        },
      },
    });
  }

  private updateChart(): void {
    if (!this.chart) {
      this.createChart();
      return;
    }

    const ctx = this.chartCanvas.nativeElement.getContext('2d');
    if (!ctx) return;

    const data = this.getChartData();
    const datasets = this.buildDatasets(ctx, data);

    this.chart.data.labels = data.labels;
    this.chart.data.datasets = datasets;
    this.chart.update('none');
  }

  /**
   * Build chart datasets, including range area if available.
   */
  private buildDatasets(
    ctx: CanvasRenderingContext2D,
    data: ReturnType<typeof this.getChartData>
  ): Chart['data']['datasets'] {
    const datasets: Chart['data']['datasets'] = [];
    const colors = this.colors;

    // If we have range data, add the confidence area first (so it's behind)
    if (data.optimisticValues && data.pessimisticValues) {
      // Optimistic line (upper bound) - will be filled down to pessimistic
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

      // Pessimistic line (lower bound)
      datasets.push({
        label: 'Pessimistic',
        data: data.pessimisticValues,
        borderColor: colors.pessimistic,
        backgroundColor: colors.accentLight,
        fill: '-1', // Fill to previous dataset (optimistic)
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 2,
        borderDash: [4, 4],
      });
    }

    // Main portfolio value line (median)
    datasets.push({
      label: this.hasRangeData ? 'Expected (Median)' : 'Portfolio Value',
      data: data.portfolioValues,
      borderColor: colors.accent,
      backgroundColor: this.hasRangeData ? 'transparent' : this.createGradient(ctx, colors.accent, 0.3),
      fill: !this.hasRangeData,
      tension: 0.4,
      pointRadius: 0,
      pointHoverRadius: 6,
      pointHoverBackgroundColor: colors.accent,
      pointHoverBorderColor: this.themeService.isDark() ? '#1e293b' : '#ffffff',
      pointHoverBorderWidth: 2,
      borderWidth: 2.5,
    });

    // Total contributed line
    datasets.push({
      label: 'Total Contributed',
      data: data.contributions,
      borderColor: colors.contributed,
      backgroundColor: this.createGradient(ctx, colors.contributed, 0.15),
      fill: true,
      tension: 0.4,
      pointRadius: 0,
      pointHoverRadius: 6,
      pointHoverBackgroundColor: colors.contributed,
      pointHoverBorderColor: this.themeService.isDark() ? '#1e293b' : '#ffffff',
      pointHoverBorderWidth: 2,
      borderDash: [5, 5],
    });

    return datasets;
  }

  /**
   * Check if projections have range data (pessimistic/optimistic values).
   */
  private get hasRangeData(): boolean {
    return this.projections?.length > 0 && this.projections[0].pessimisticValue !== undefined;
  }

  private getChartData(): {
    labels: string[];
    portfolioValues: number[];
    contributions: number[];
    pessimisticValues?: number[];
    optimisticValues?: number[];
  } {
    // Sample data points for cleaner chart (show yearly or every 6 months)
    const sampledProjections = this.sampleProjections();

    const data: ReturnType<typeof this.getChartData> = {
      labels: sampledProjections.map(p => this.formatDate(p.year, p.month)),
      portfolioValues: sampledProjections.map(p => p.portfolioValue),
      contributions: sampledProjections.map(p => p.totalContributed),
    };

    // Add range data if available
    if (this.hasRangeData) {
      data.pessimisticValues = sampledProjections.map(p => p.pessimisticValue!);
      data.optimisticValues = sampledProjections.map(p => p.optimisticValue!);
    }

    return data;
  }

  private sampleProjections(): MonthProjection[] {
    if (this.projections.length <= 24) {
      // Less than 2 years - show all months
      return this.projections;
    } else if (this.projections.length <= 60) {
      // 2-5 years - show every 3 months
      return this.projections.filter((_, i) => i % 3 === 0 || i === this.projections.length - 1);
    } else {
      // More than 5 years - show every 6 months
      return this.projections.filter((_, i) => i % 6 === 0 || i === this.projections.length - 1);
    }
  }

  private formatDate(year: number, month: number): string {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${monthNames[month - 1]} ${year}`;
  }

  private createGradient(ctx: CanvasRenderingContext2D, color: string, opacity: number): CanvasGradient {
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

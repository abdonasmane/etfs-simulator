import {
  Component,
  Input,
  OnChanges,
  SimpleChanges,
  ElementRef,
  ViewChild,
  AfterViewInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, registerables } from 'chart.js';

import { MonthProjection } from '../../../../core/models';

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
        background: #ffffff;
        border-radius: 12px;
        padding: 1rem;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
      }
    `,
  ],
})
export class GrowthChartComponent implements AfterViewInit, OnChanges {
  @Input({ required: true }) projections!: MonthProjection[];
  @ViewChild('chartCanvas') chartCanvas!: ElementRef<HTMLCanvasElement>;

  private chart: Chart | null = null;

  ngAfterViewInit(): void {
    this.createChart();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['projections'] && this.chart) {
      this.updateChart();
    }
  }

  private createChart(): void {
    if (!this.chartCanvas?.nativeElement || !this.projections?.length) {
      return;
    }

    const ctx = this.chartCanvas.nativeElement.getContext('2d');
    if (!ctx) return;

    const data = this.getChartData();

    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.labels,
        datasets: [
          {
            label: 'Portfolio Value',
            data: data.portfolioValues,
            borderColor: '#4361ee',
            backgroundColor: this.createGradient(ctx, '#4361ee', 0.3),
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 6,
            pointHoverBackgroundColor: '#4361ee',
            pointHoverBorderColor: '#ffffff',
            pointHoverBorderWidth: 2,
          },
          {
            label: 'Total Contributed',
            data: data.contributions,
            borderColor: '#94a3b8',
            backgroundColor: this.createGradient(ctx, '#94a3b8', 0.1),
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 6,
            pointHoverBackgroundColor: '#94a3b8',
            pointHoverBorderColor: '#ffffff',
            pointHoverBorderWidth: 2,
            borderDash: [5, 5],
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
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
              font: {
                size: 12,
                family: '-apple-system, BlinkMacSystemFont, sans-serif',
              },
            },
          },
          tooltip: {
            backgroundColor: '#1a1a2e',
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
              color: '#94a3b8',
            },
          },
          y: {
            display: true,
            grid: {
              color: '#f1f5f9',
            },
            ticks: {
              callback: (value): string => `€${Number(value).toLocaleString('de-DE', { notation: 'compact' })}`,
              font: {
                size: 11,
              },
              color: '#94a3b8',
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

    const data = this.getChartData();
    this.chart.data.labels = data.labels;
    this.chart.data.datasets[0].data = data.portfolioValues;
    this.chart.data.datasets[1].data = data.contributions;
    this.chart.update('none');
  }

  private getChartData(): {
    labels: string[];
    portfolioValues: number[];
    contributions: number[];
  } {
    // Sample data points for cleaner chart (show yearly or every 6 months)
    const sampledProjections = this.sampleProjections();

    return {
      labels: sampledProjections.map(p => this.formatDate(p.year, p.month)),
      portfolioValues: sampledProjections.map(p => p.portfolioValue),
      contributions: sampledProjections.map(p => p.totalContributed),
    };
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

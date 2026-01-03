import { Component, Input } from '@angular/core';
import { CommonModule, CurrencyPipe, DecimalPipe } from '@angular/common';

import { SimulateSummary, MonthProjection } from '../../../../core/models';
import { GrowthChartComponent } from '../growth-chart/growth-chart.component';

/**
 * Component displaying simulation results with chart and summary.
 */
@Component({
  selector: 'app-simulation-results',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, DecimalPipe, GrowthChartComponent],
  templateUrl: './simulation-results.component.html',
  styleUrl: './simulation-results.component.scss',
})
export class SimulationResultsComponent {
  @Input({ required: true }) summary!: SimulateSummary;
  @Input({ required: true }) projections!: MonthProjection[];

  /** View mode for projections table */
  showMonthly = false;

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
   * Format month number to short name.
   */
  getMonthName(month: number): string {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[month - 1] || '';
  }

  /**
   * Calculate gain for a projection.
   */
  getGain(projection: MonthProjection): number {
    return projection.portfolioValue - projection.totalContributed;
  }
}

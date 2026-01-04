import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { trigger, transition, style, animate, query } from '@angular/animations';

import { ApiService } from '../../../../core/services';
import { SimulateSummary, MonthProjection } from '../../../../core/models';
import {
  SimulationFormComponent,
  SimulationFormData,
} from '../../components/simulation-form/simulation-form.component';
import { SimulationResultsComponent } from '../../components/simulation-results/simulation-results.component';

/**
 * Main page for investment simulation.
 * Coordinates between form input and results display.
 */
@Component({
  selector: 'app-simulation-page',
  standalone: true,
  imports: [CommonModule, SimulationFormComponent, SimulationResultsComponent],
  templateUrl: './simulation-page.component.html',
  styleUrl: './simulation-page.component.scss',
  animations: [
    trigger('resultChange', [
      transition('* => *', [
        query('.results-content', [
          style({ opacity: 0.5, transform: 'scale(0.98)' }),
          animate('300ms ease-out', style({ opacity: 1, transform: 'scale(1)' })),
        ], { optional: true }),
      ]),
    ]),
  ],
})
export class SimulationPageComponent {
  private readonly apiService = inject(ApiService);

  /** State using signals for better reactivity */
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly summary = signal<SimulateSummary | null>(null);
  readonly projections = signal<MonthProjection[]>([]);

  /** Key that changes on each update to trigger animation */
  readonly resultKey = signal(0);

  /**
   * Handle form submission and call API.
   */
  onSimulate(data: SimulationFormData): void {
    this.loading.set(true);
    this.error.set(null);

    if (data.mode === 'years' && data.years) {
      this.apiService
        .simulateByYears({
          initialInvestment: data.initialInvestment,
          monthlyContribution: data.monthlyContribution,
          years: data.years,
          indexSymbol: data.indexSymbol,
          annualReturnRate: data.annualReturnRate,
          contributionGrowthRate: data.contributionGrowthRate,
        })
        .subscribe({
          next: response => {
            this.updateResults(response.summary, response.projections);
          },
          error: err => {
            this.error.set(err.message);
            this.loading.set(false);
          },
        });
    } else if (data.mode === 'target' && data.targetYear) {
      this.apiService
        .simulateByTarget({
          initialInvestment: data.initialInvestment,
          monthlyContribution: data.monthlyContribution,
          targetYear: data.targetYear,
          targetMonth: data.targetMonth,
          indexSymbol: data.indexSymbol,
          annualReturnRate: data.annualReturnRate,
          contributionGrowthRate: data.contributionGrowthRate,
        })
        .subscribe({
          next: response => {
            this.updateResults(response.summary, response.projections);
          },
          error: err => {
            this.error.set(err.message);
            this.loading.set(false);
          },
        });
    }
  }

  /**
   * Update results with animation trigger.
   */
  private updateResults(summary: SimulateSummary, projections: MonthProjection[]): void {
    this.summary.set(summary);
    this.projections.set(projections);
    this.resultKey.update(k => (k + 1) % 10000000);
    this.loading.set(false);
  }
}

import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { trigger, transition, style, animate, query } from '@angular/animations';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { ApiService } from '../../../../core/services';
import {
  ComparisonResult,
  ComparisonSide,
  DailyPoint,
  MonthProjection,
  SimulateHistoricalResponse,
  SimulateSummary,
} from '../../../../core/models';
import {
  SimulationFormComponent,
  SimulationFormData,
} from '../../components/simulation-form/simulation-form.component';
import { SimulationResultsComponent } from '../../components/simulation-results/simulation-results.component';
import { ThemeToggleComponent } from '../../../../shared/components/theme-toggle/theme-toggle.component';
import { decodeSimulationParams, encodeSimulationParams } from '../../share-url.helper';

/**
 * Main page for investment simulation.
 * Coordinates between form input and results display.
 */
@Component({
  selector: 'app-simulation-page',
  standalone: true,
  imports: [
    CommonModule,
    SimulationFormComponent,
    SimulationResultsComponent,
    ThemeToggleComponent,
  ],
  templateUrl: './simulation-page.component.html',
  styleUrl: './simulation-page.component.scss',
  animations: [
    trigger('resultChange', [
      transition('* => *', [
        query(
          '.results-content',
          [
            style({ opacity: 0.5, transform: 'scale(0.98)' }),
            animate('300ms ease-out', style({ opacity: 1, transform: 'scale(1)' })),
          ],
          { optional: true }
        ),
      ]),
    ]),
  ],
})
export class SimulationPageComponent implements OnInit {
  private readonly apiService = inject(ApiService);

  /** State using signals for better reactivity */
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly summary = signal<SimulateSummary | null>(null);
  readonly projections = signal<MonthProjection[]>([]);
  /**
   * Pre-filled form values decoded from the URL on page load. Passed down to
   * the form so it can mirror the shared simulation while the page also
   * auto-submits in parallel — recipient lands directly on the result.
   */
  readonly prefill = signal<SimulationFormData | null>(null);
  /**
   * Daily portfolio snapshots from the historical endpoint, used to render
   * the chart at full daily resolution. Empty for years/target modes (which
   * don't fetch real prices) — chart falls back to monthly projections in
   * those cases.
   */
  readonly dailyPoints = signal<DailyPoint[]>([]);

  /**
   * Side-by-side ETF-vs-ETF comparison result, set only when the user enabled
   * comparison in What If mode. When non-null, results render in compare layout
   * and `summary`/`projections` mirror the primary side for legacy display.
   */
  readonly comparison = signal<ComparisonResult | null>(null);

  /** Key that changes on each update to trigger animation */
  readonly resultKey = signal(0);

  /**
   * On page load, hydrate from URL params if present and auto-run the
   * simulation so the recipient of a shared link lands directly on the
   * result. Malformed/missing params are silently ignored — defaults stand.
   */
  ngOnInit(): void {
    const params = new URLSearchParams(window.location.search);
    if (params.toString() === '') return;
    const decoded = decodeSimulationParams(params);
    if (!decoded) return;
    this.prefill.set(decoded);
    this.onSimulate(decoded);
  }

  /**
   * Handle form submission and call the appropriate API based on mode.
   */
  onSimulate(data: SimulationFormData): void {
    this.loading.set(true);
    this.error.set(null);
    this.syncUrl(data);

    if (data.mode === 'years' && data.years) {
      this.apiService
        .simulateByYears({
          initialInvestment: data.initialInvestment,
          monthlyContribution: data.monthlyContribution,
          years: data.years,
          portfolio: data.portfolio,
          indexSymbol: data.indexSymbol,
          annualReturnRate: data.annualReturnRate,
          contributionGrowthRate: data.contributionGrowthRate,
          contributionGrowthAmount: data.contributionGrowthAmount,
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
          portfolio: data.portfolio,
          indexSymbol: data.indexSymbol,
          annualReturnRate: data.annualReturnRate,
          contributionGrowthRate: data.contributionGrowthRate,
          contributionGrowthAmount: data.contributionGrowthAmount,
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
    } else if (data.mode === 'whatif' && data.startYear && data.startMonth) {
      if (data.compareIndexSymbol && data.indexSymbol) {
        this.runComparison(data, data.indexSymbol, data.compareIndexSymbol);
        return;
      }
      this.apiService
        .simulateHistorical({
          initialInvestment: data.initialInvestment,
          monthlyContribution: data.monthlyContribution,
          startYear: data.startYear,
          startMonth: data.startMonth,
          portfolio: data.portfolio,
          indexSymbol: data.indexSymbol,
          contributionGrowthRate: data.contributionGrowthRate,
          contributionGrowthAmount: data.contributionGrowthAmount,
        })
        .subscribe({
          next: response => {
            this.updateResults(
              this.toHistoricalSummary(response),
              response.projections,
              response.dailyPoints
            );
          },
          error: err => {
            this.error.set(err.message);
            this.loading.set(false);
          },
        });
    }
  }

  /**
   * Fire two parallel historical simulations for an ETF-vs-ETF comparison.
   *
   * `forkJoin` waits for both to settle before pushing one update — that
   * keeps the chart from flicker-redrawing once per side. We swallow per-side
   * errors into `ComparisonSide.error` so a single broken ETF doesn't blank
   * the page; the surviving side still renders, marked accordingly. Only when
   * BOTH sides fail do we surface a top-level error.
   */
  private runComparison(
    data: SimulationFormData,
    primarySymbol: string,
    secondarySymbol: string
  ): void {
    const buildRequest = (symbol: string): Parameters<ApiService['simulateHistorical']>[0] => ({
      initialInvestment: data.initialInvestment,
      monthlyContribution: data.monthlyContribution,
      startYear: data.startYear!,
      startMonth: data.startMonth!,
      indexSymbol: symbol,
      contributionGrowthRate: data.contributionGrowthRate,
      contributionGrowthAmount: data.contributionGrowthAmount,
    });

    const sideOf = (symbol: string): Observable<ComparisonSide> =>
      this.apiService.simulateHistorical(buildRequest(symbol)).pipe(
        map(
          (response): ComparisonSide => ({
            symbol,
            name: symbol,
            summary: this.toHistoricalSummary(response),
            projections: response.projections,
            dailyPoints: response.dailyPoints,
          })
        ),
        catchError((err: Error) =>
          of<ComparisonSide>({
            symbol,
            name: symbol,
            error: err.message,
          })
        )
      );

    forkJoin({
      primary: sideOf(primarySymbol),
      secondary: sideOf(secondarySymbol),
    }).subscribe(result => {
      if (!result.primary.summary && !result.secondary.summary) {
        this.error.set(
          `Couldn't fetch data for ${primarySymbol} or ${secondarySymbol}. ` +
            (result.primary.error ?? result.secondary.error ?? 'Try a different start date.')
        );
        this.comparison.set(null);
        this.loading.set(false);
        return;
      }
      this.comparison.set(result);
      // Mirror the primary side into legacy summary/projections so existing
      // UI sections (table, milestones) keep working when only the primary
      // succeeded; the comparison-aware view reads `comparison` directly.
      const winning = result.primary.summary ? result.primary : result.secondary;
      if (winning.summary && winning.projections) {
        this.summary.set(winning.summary);
        this.projections.set(winning.projections);
        this.dailyPoints.set(winning.dailyPoints ?? []);
      }
      this.error.set(null);
      this.resultKey.update(k => (k + 1) % 10000000);
      this.loading.set(false);
    });
  }

  /** Map a backend historical response into the unified `SimulateSummary`. */
  private toHistoricalSummary(response: SimulateHistoricalResponse): SimulateSummary {
    return {
      targetDate: response.summary.endDate,
      finalValue: response.summary.finalValue,
      totalContributed: response.summary.totalContributed,
      totalGain: response.summary.totalGain,
      percentageGain: response.summary.percentageGain,
      totalMonths: response.summary.totalMonths,
      finalMonthlyContribution: response.summary.finalMonthlyContribution,
      contributionMilestones: response.summary.contributionMilestones,
      hasRange: false,
      portfolio: response.summary.portfolio,
      isHistorical: true,
      historicalStartDate: response.summary.startDate,
      annualizedReturn: response.summary.annualizedReturn,
    };
  }

  /**
   * Update results with animation trigger. Clears any previous comparison
   * state so toggling compare off and re-running doesn't leave stale dual
   * cards on screen. dailyPoints is optional — only present for What If runs.
   */
  private updateResults(
    summary: SimulateSummary,
    projections: MonthProjection[],
    dailyPoints: DailyPoint[] = []
  ): void {
    this.comparison.set(null);
    this.summary.set(summary);
    this.projections.set(projections);
    this.dailyPoints.set(dailyPoints);
    this.resultKey.update(k => (k + 1) % 10000000);
    this.loading.set(false);
  }

  /**
   * Reflect the submitted simulation in the URL using replaceState so a copy
   * of the address bar is a shareable link. We use replaceState rather than
   * pushState because each submit isn't a separate "page" — the back button
   * shouldn't unwind individual parameter tweaks.
   */
  private syncUrl(data: SimulationFormData): void {
    const params = encodeSimulationParams(data);
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState(null, '', newUrl);
  }
}

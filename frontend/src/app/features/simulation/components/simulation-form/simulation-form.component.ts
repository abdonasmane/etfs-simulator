import { Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
  FormsModule,
} from '@angular/forms';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../../../shared/components/custom-select/custom-select.component';
import { TooltipComponent } from '../../../../shared/components/tooltip/tooltip.component';
import {
  PortfolioAllocatorComponent,
  AllocationOutput,
} from '../../../../shared/components/portfolio-allocator/portfolio-allocator.component';
import { ApiService } from '../../../../core/services';
import { IndexInfo } from '../../../../core/models';

/**
 * Form data emitted when user submits a simulation request.
 */
export interface SimulationFormData {
  initialInvestment: number;
  monthlyContribution: number;
  /** Annual % increase in monthly contribution. 0 when user picked the fixed-amount mode. */
  contributionGrowthRate: number;
  /** Fixed annual € increase added to monthly contribution. 0 when user picked the percentage mode. */
  contributionGrowthAmount: number;
  mode: 'years' | 'target' | 'whatif';
  years?: number;
  targetYear?: number;
  targetMonth?: number;
  /** Start year for historical simulation */
  startYear?: number;
  /** Start month for historical simulation (1-12) */
  startMonth?: number;
  /** Portfolio allocations - if provided, returns blended range projections */
  portfolio?: AllocationOutput[];
  /** Index symbol (e.g., "SPY", "QQQ") - if provided, returns range projections */
  indexSymbol?: string;
  /** Annual return rate - only used when no indexSymbol or portfolio is provided */
  annualReturnRate?: number;
  /**
   * Second ETF symbol for side-by-side comparison. Only set in What If mode.
   * The page runs a parallel simulation and renders both on the same chart.
   */
  compareIndexSymbol?: string;
}

/**
 * Index option with symbol for API and display value.
 */
interface IndexOption extends SelectOption {
  symbol?: string;
}

/**
 * Form component for entering simulation parameters.
 * Supports "by years", "by target date", and "what if historical" modes.
 */
@Component({
  selector: 'app-simulation-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    CustomSelectComponent,
    TooltipComponent,
    PortfolioAllocatorComponent,
  ],
  templateUrl: './simulation-form.component.html',
  styleUrl: './simulation-form.component.scss',
})
export class SimulationFormComponent implements OnInit {
  @Output() simulate = new EventEmitter<SimulationFormData>();

  /**
   * Form values pre-filled from the URL on page load. When non-null, the
   * form mirrors the loaded simulation in all visible fields (mode, ETF,
   * dates, allocations, growth choice). The page also auto-submits in
   * parallel — we don't re-emit from the form to avoid double-firing.
   */
  @Input() prefill: SimulationFormData | null = null;

  form: FormGroup;
  mode: 'years' | 'target' | 'whatif' = 'years';
  currentYear = new Date().getFullYear();
  currentMonth = new Date().getMonth() + 1; // 1-12

  /**
   * Options for the contribution-growth dropdown. Sentinel values:
   *   -1 → custom percentage (user types a % rate)
   *   -2 → custom fixed €/year (user types an annual euro amount)
   * Positive values are the percent literal (0, 2.5, 4) for one-click presets.
   */
  growthOptions: SelectOption[] = [
    { label: 'None — fixed contribution', value: 0 },
    { label: '+2.5%/year (typical inflation)', value: 2.5 },
    { label: '+4%/year (typical salary growth)', value: 4 },
    { label: 'Custom % per year...', value: -1 },
    { label: 'Custom +€/year (fixed amount)...', value: -2 },
  ];

  /** Options for expected annual return based on historical index performance */
  returnOptions: IndexOption[] = [
    // US-listed
    { label: 'S&P 500 (SPY)', value: 1, hint: '~8.7% median (20yr rolling)', symbol: 'SPY' },
    { label: 'NASDAQ 100 (QQQ)', value: 2, hint: '~13.6% median (20yr rolling)', symbol: 'QQQ' },
    { label: 'MSCI EAFE (EFA)', value: 3, hint: '~5.7% median (20yr rolling)', symbol: 'EFA' },
    { label: 'US Total Market (VTI)', value: 4, symbol: 'VTI' },
    { label: 'Emerging Markets (IEMG)', value: 5, symbol: 'IEMG' },
    { label: 'Gold (GLD)', value: 6, symbol: 'GLD' },
    { label: 'US Bonds 20yr+ (TLT)', value: 7, symbol: 'TLT' },
    // Europe-listed UCITS
    { label: 'S&P 500 UCITS (CSPX.L)', value: 8, symbol: 'CSPX.L' },
    { label: 'FTSE All-World UCITS (VWCE.DE)', value: 9, symbol: 'VWCE.DE' },
    // Shariah
    { label: 'MSCI USA Islamic (ISDU.L)', value: 10, symbol: 'ISDU.L' },
    { label: 'Global Developed Islamic (IGDA.L)', value: 11, symbol: 'IGDA.L' },
    // Other
    { label: 'Custom Portfolio', value: -2, hint: 'Mix multiple ETFs' },
    { label: 'Custom rate...', value: -1 },
  ];

  /** Available months for target date and historical start selection */
  monthOptions: SelectOption[] = [
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' },
  ];

  /** Selected growth option value (-1 = custom %, -2 = custom € amount, else literal preset). */
  selectedGrowthOption = 0;

  /** Selected return option value (-1 means custom, positive values are index IDs) */
  selectedReturnOption = 1; // Default to S&P 500

  /**
   * Selected second ETF for comparison mode (What If only). Null when comparison
   * is off. Holds the same `value` as `selectedReturnOption` (an index into
   * `returnOptions`), not a symbol — so we can reuse the same dropdown options
   * and detect "same ETF picked twice" without string-matching.
   */
  selectedCompareReturnOption: number | null = null;

  /** Selected historical start year */
  selectedHistoricalYear = 2010;

  /** Selected historical start month */
  selectedHistoricalMonth = 1;

  /** Current portfolio allocations (for custom portfolio mode) */
  portfolioAllocations: AllocationOutput[] = [
    { symbol: 'SPY', weight: 50 },
    { symbol: 'QQQ', weight: 30 },
    { symbol: 'EFA', weight: 20 },
  ];

  /**
   * Earliest available month per ETF symbol, populated from /api/v1/indexes.
   * Drives the historical date picker so users can't ask for a date that
   * predates the ETF's first Yahoo data point — which the backend would
   * otherwise reject (and pre-fix used to silently clip the simulation).
   */
  private indexInfoBySymbol = new Map<string, IndexInfo>();

  private readonly fb = inject(FormBuilder);
  private readonly apiService = inject(ApiService);

  constructor() {
    this.form = this.fb.group({
      initialInvestment: [1000, [Validators.required, Validators.min(0)]],
      monthlyContribution: [500, [Validators.required, Validators.min(0)]],
      annualReturnRate: [7, [Validators.required, Validators.min(0), Validators.max(100)]],
      contributionGrowthRate: [0, [Validators.required, Validators.min(0), Validators.max(20)]],
      contributionGrowthAmount: [
        600,
        [Validators.required, Validators.min(0), Validators.max(10000)],
      ],
      years: [10, [Validators.required, Validators.min(1), Validators.max(49)]],
      targetYearsFromNow: [10, [Validators.required, Validators.min(1), Validators.max(49)]],
      targetMonth: [12, [Validators.required, Validators.min(1), Validators.max(12)]],
    });

    this.apiService.getIndexes().subscribe({
      next: response => {
        for (const info of response.indexes) {
          this.indexInfoBySymbol.set(info.symbol, info);
        }
      },
      error: () => {
        // Silent fallback — picker stays unconstrained, backend validates.
      },
    });
  }

  ngOnInit(): void {
    if (this.prefill) {
      this.applyPrefill(this.prefill);
    }
  }

  /**
   * Mirror a previously-shared simulation in the form. Sets mode, primary
   * fields, growth-mode selection, return-source selection (ETF / portfolio
   * / custom rate), historical date, and comparison ETF. Does NOT re-emit
   * `simulate` — the page already auto-runs in parallel from `ngOnInit`.
   */
  private applyPrefill(data: SimulationFormData): void {
    this.mode = data.mode;

    const targetYearsFromNow =
      data.targetYear !== undefined ? Math.max(1, data.targetYear - this.currentYear) : 10;

    this.form.patchValue({
      initialInvestment: data.initialInvestment,
      monthlyContribution: data.monthlyContribution,
      contributionGrowthRate: data.contributionGrowthRate,
      contributionGrowthAmount:
        data.contributionGrowthAmount > 0 ? data.contributionGrowthAmount : 600,
      annualReturnRate: data.annualReturnRate ?? 7,
      years: data.years ?? 10,
      targetMonth: data.targetMonth ?? 12,
      targetYearsFromNow,
    });

    // Growth mode: -2 fixed €/yr, -1 custom %, else preset percent literal.
    if (data.contributionGrowthAmount > 0) {
      this.selectedGrowthOption = -2;
    } else if (data.contributionGrowthRate > 0) {
      const preset = this.growthOptions.find(o => o.value === data.contributionGrowthRate);
      this.selectedGrowthOption = preset ? Number(preset.value) : -1;
    } else {
      this.selectedGrowthOption = 0;
    }

    // Return source.
    if (data.portfolio && data.portfolio.length > 0) {
      this.selectedReturnOption = -2; // Custom Portfolio
      this.portfolioAllocations = data.portfolio.map(a => ({
        symbol: a.symbol,
        weight: a.weight,
      }));
    } else if (data.indexSymbol) {
      const opt = this.returnOptions.find(o => o.symbol === data.indexSymbol);
      if (opt) this.selectedReturnOption = Number(opt.value);
    } else if (data.annualReturnRate !== undefined) {
      this.selectedReturnOption = -1; // Custom rate
    }

    // Historical date.
    if (data.startYear !== undefined) this.selectedHistoricalYear = data.startYear;
    if (data.startMonth !== undefined) this.selectedHistoricalMonth = data.startMonth;

    // Comparison ETF.
    if (data.compareIndexSymbol) {
      const opt = this.returnOptions.find(o => o.symbol === data.compareIndexSymbol);
      if (opt) this.selectedCompareReturnOption = Number(opt.value);
    } else {
      this.selectedCompareReturnOption = null;
    }
  }

  /** Get the currently selected index symbol (if any). */
  get selectedIndexSymbol(): string | undefined {
    const option = this.returnOptions.find(o => o.value === this.selectedReturnOption);
    return option?.symbol;
  }

  /**
   * Return options shown to the user, mode-filtered. In years/target modes
   * we hide symbols whose backend `rollingPeriodYears === 0` (no statistical
   * stats available — backend would reject them) and tag any with
   * `limitedHistory: true` (5y rolling) with a "(limited history)" hint so
   * the user knows the percentile band is wider/less reliable. In What If
   * mode we show everything since the simulation uses live prices.
   */
  get displayReturnOptions(): IndexOption[] {
    const isStatistical = this.mode !== 'whatif';
    return this.returnOptions
      .filter(opt => {
        if (!opt.symbol) return true; // Custom Portfolio / Custom rate sentinels
        const info = this.indexInfoBySymbol.get(opt.symbol);
        if (!info) return true; // metadata not yet loaded — keep it visible
        if (isStatistical && info.rollingPeriodYears === 0) return false;
        return true;
      })
      .map(opt => {
        if (!opt.symbol) return opt;
        const info = this.indexInfoBySymbol.get(opt.symbol);
        if (!info) return opt;
        if (isStatistical && info.limitedHistory && info.rollingPeriodYears > 0) {
          return {
            ...opt,
            hint: `${info.medianReturn}% median · ${info.rollingPeriodYears}yr (limited)`,
          };
        }
        if (info.medianReturn > 0 && !opt.hint) {
          return {
            ...opt,
            hint: `~${info.medianReturn}% median (${info.rollingPeriodYears}yr rolling)`,
          };
        }
        return opt;
      });
  }

  /** Symbol of the second ETF picked for comparison, or undefined if off. */
  get selectedCompareIndexSymbol(): string | undefined {
    if (this.selectedCompareReturnOption === null) return undefined;
    const option = this.returnOptions.find(o => o.value === this.selectedCompareReturnOption);
    return option?.symbol;
  }

  /** True when comparison is on (a second ETF has been selected). */
  get isComparing(): boolean {
    return this.selectedCompareReturnOption !== null;
  }

  /**
   * Comparison is only meaningful with two real ETFs. Disabled when the primary
   * is a custom rate (no real data) or a custom portfolio (multi-ETF vs ETF
   * comparison is its own feature — keep this iteration scoped to ETF-vs-ETF).
   */
  get canCompare(): boolean {
    return this.mode === 'whatif' && !this.isCustomReturn && !this.isCustomPortfolio;
  }

  /**
   * Dropdown options for the comparison ETF. Excludes the primary selection
   * (no point comparing SPY vs SPY) and the special "Custom Portfolio" /
   * "Custom rate" entries (those don't yield real-data lines).
   *
   * Derives from `displayReturnOptions` (not the raw `returnOptions`) so the
   * dynamically-injected hints — `~8.7% median (20yr rolling)` etc. computed
   * from cached `IndexInfo` — show consistently for every ETF, not just the
   * three that happen to have hardcoded hint strings.
   */
  get compareReturnOptions(): IndexOption[] {
    return this.displayReturnOptions.filter(
      o => o.value !== this.selectedReturnOption && o.value !== -1 && o.value !== -2
    );
  }

  /** Toggle the comparison row on/off. Defaults the picker to a sensible peer. */
  toggleCompare(): void {
    if (this.isComparing) {
      this.selectedCompareReturnOption = null;
      return;
    }
    const firstOther = this.compareReturnOptions[0];
    if (firstOther) {
      this.selectedCompareReturnOption = Number(firstOther.value);
    }
  }

  /** Handle comparison ETF selection. */
  onCompareReturnOptionChange(value: number): void {
    this.selectedCompareReturnOption = value;
  }

  /** Switch between simulation modes. Comparison only lives in What If. */
  setMode(mode: 'years' | 'target' | 'whatif'): void {
    this.mode = mode;
    if (mode !== 'whatif') {
      this.selectedCompareReturnOption = null;
      // If the currently picked ETF lacks statistical history, snap to S&P 500
      // (value 1). Years/target modes can't render that ETF.
      const sym = this.selectedIndexSymbol;
      const info = sym ? this.indexInfoBySymbol.get(sym) : undefined;
      if (info && info.rollingPeriodYears === 0) {
        this.selectedReturnOption = 1;
      }
    }
  }

  /**
   * Handle growth option selection. Presets (>=0) populate the % field
   * directly. Sentinels surface a custom-input row: -1 for percentage, -2 for
   * a fixed €/year amount. We seed sensible defaults so the input doesn't
   * appear empty when the user first reveals it.
   */
  onGrowthOptionChange(value: number): void {
    this.selectedGrowthOption = value;
    if (value >= 0) {
      this.form.patchValue({ contributionGrowthRate: value });
      return;
    }
    if (value === -1) {
      // Custom %, default to a low non-zero value so the input has visible content.
      this.form.patchValue({ contributionGrowthRate: 3 });
    } else if (value === -2) {
      this.form.patchValue({ contributionGrowthAmount: 600 });
    }
  }

  /**
   * Handle return option selection. Switching to Custom Portfolio or Custom
   * Rate clears the comparison row (those modes can't be compared in the MVP).
   * Picking the same symbol that was the comparison clears comparison too.
   */
  onReturnOptionChange(value: number): void {
    this.selectedReturnOption = value;
    if (value === -1) {
      this.form.patchValue({ annualReturnRate: 7 });
    }
    if (value === -1 || value === -2) {
      this.selectedCompareReturnOption = null;
      return;
    }
    if (this.selectedCompareReturnOption === value) {
      this.selectedCompareReturnOption = null;
    }
  }

  /** Check if custom growth-percentage input should be shown. */
  get isCustomGrowth(): boolean {
    return this.selectedGrowthOption === -1;
  }

  /** Check if the fixed-amount €/year input should be shown. */
  get isCustomGrowthAmount(): boolean {
    return this.selectedGrowthOption === -2;
  }

  /**
   * Preview of the first three years of monthly contributions under the
   * stepwise fixed-amount growth model: contribution stays flat for 12 months,
   * then jumps by `contributionGrowthAmount` at each anniversary. Helps users
   * see immediately what their plan looks like.
   */
  get growthAmountPreview(): { year: number; monthly: number }[] {
    const base = Number(this.form.value.monthlyContribution) || 0;
    const step = Number(this.form.value.contributionGrowthAmount) || 0;
    return [
      { year: 1, monthly: base },
      { year: 2, monthly: base + step },
      { year: 3, monthly: base + 2 * step },
    ];
  }

  /** Check if custom return rate input should be shown. */
  get isCustomReturn(): boolean {
    return this.selectedReturnOption === -1;
  }

  /** Check if custom portfolio mode is active. */
  get isCustomPortfolio(): boolean {
    return this.selectedReturnOption === -2;
  }

  /** Check if portfolio allocations are valid (sum to 100). */
  get isPortfolioValid(): boolean {
    const total = this.portfolioAllocations.reduce((sum, a) => sum + a.weight, 0);
    return total === 100;
  }

  /** Get the target year based on years from now. */
  get targetYear(): number {
    return this.currentYear + (this.form.value.targetYearsFromNow || 10);
  }

  /**
   * Human-readable description of the historical period.
   * e.g. "January 2010 → Today (15 yrs)"
   */
  get historicalPeriodDescription(): string {
    const months =
      this.monthOptions.find(m => m.value === this.selectedHistoricalMonth)?.label ?? '';
    const years = this.currentYear - this.selectedHistoricalYear;
    const yearsLabel = years >= 1 ? ` (~${years} yr${years !== 1 ? 's' : ''})` : '';
    return `${months} ${this.selectedHistoricalYear} → Today${yearsLabel}`;
  }

  /** True when the selected historical date is at least one month in the past. */
  get isHistoricalDateInPast(): boolean {
    if (this.selectedHistoricalYear < this.currentYear) return true;
    if (this.selectedHistoricalYear === this.currentYear) {
      return this.selectedHistoricalMonth < this.currentMonth;
    }
    return false;
  }

  /**
   * Validation error for the historical date, or null if the picker is valid.
   *
   * Two failure modes:
   * - Date isn't in the past (can't replay the future).
   * - Date predates the active ETF's first available data point (Yahoo has
   *   no prices to replay). We surface this explicitly rather than silently
   *   clamping the date forward, otherwise switching ETFs would change the
   *   simulation duration without the user noticing — exactly the bug that
   *   prompted this validation.
   */
  get historicalDateValidationError(): string | null {
    if (!this.isHistoricalDateInPast) {
      return 'Start date must be at least 1 month in the past';
    }
    const { year: minYear, month: minMonth } = this.effectiveMinHistoricalDate;
    const beforeMin =
      this.selectedHistoricalYear < minYear ||
      (this.selectedHistoricalYear === minYear && this.selectedHistoricalMonth < minMonth);
    if (beforeMin) {
      const monthName = this.monthOptions.find(m => m.value === minMonth)?.label ?? '';
      const symbols = this.activeHistoricalSymbols();
      const subject =
        symbols.length === 1 ? `${symbols[0]}'s` : "this portfolio's earliest member's";
      return `Start date is before ${subject} earliest data (${monthName} ${minYear}). Please pick ${monthName} ${minYear} or later.`;
    }
    return null;
  }

  /** True when the historical picker has no validation error. */
  get isHistoricalDateValid(): boolean {
    return this.historicalDateValidationError === null;
  }

  /** Handle portfolio allocations change. */
  onPortfolioChange(allocations: AllocationOutput[]): void {
    this.portfolioAllocations = allocations;
  }

  /** Submit the form and emit simulation data. */
  onSubmit(): void {
    if (this.form.invalid) return;
    if (this.isCustomPortfolio && !this.isPortfolioValid) return;
    if (this.mode === 'whatif' && !this.isHistoricalDateValid) return;

    const formValue = this.form.value;
    // Only one growth dimension is meaningful per submission (the backend
    // rejects requests where both are non-zero). We zero out whichever the
    // user didn't pick — that way the request stays unambiguous regardless of
    // stale form state from previous selections.
    const growthRate = this.isCustomGrowthAmount ? 0 : formValue.contributionGrowthRate;
    const growthAmount = this.isCustomGrowthAmount ? formValue.contributionGrowthAmount : 0;
    const data: SimulationFormData = {
      initialInvestment: formValue.initialInvestment,
      monthlyContribution: formValue.monthlyContribution,
      contributionGrowthRate: growthRate,
      contributionGrowthAmount: growthAmount,
      mode: this.mode,
    };

    // Determine return source: portfolio > index symbol > custom rate
    if (this.isCustomPortfolio) {
      data.portfolio = this.portfolioAllocations;
    } else if (this.selectedIndexSymbol) {
      data.indexSymbol = this.selectedIndexSymbol;
    } else {
      data.annualReturnRate = formValue.annualReturnRate;
    }

    if (this.mode === 'years') {
      data.years = formValue.years;
    } else if (this.mode === 'target') {
      data.targetYear = this.targetYear;
      data.targetMonth = formValue.targetMonth;
    } else if (this.mode === 'whatif') {
      data.startYear = this.selectedHistoricalYear;
      data.startMonth = this.selectedHistoricalMonth;
      if (this.canCompare && this.selectedCompareIndexSymbol) {
        data.compareIndexSymbol = this.selectedCompareIndexSymbol;
      }
    }

    this.simulate.emit(data);
  }

  /**
   * Earliest start date that's valid for the currently selected ETF (or the
   * latest of all symbols in a custom portfolio). Falls back to Jan 1993 when
   * the index metadata hasn't loaded yet so the picker stays unconstrained.
   */
  get effectiveMinHistoricalDate(): { year: number; month: number } {
    const symbols = this.activeHistoricalSymbols();
    let year = 1993;
    let month = 1;
    for (const symbol of symbols) {
      const info = this.indexInfoBySymbol.get(symbol);
      if (!info) continue;
      if (
        info.dataStartYear > year ||
        (info.dataStartYear === year && info.dataStartMonth > month)
      ) {
        year = info.dataStartYear;
        month = info.dataStartMonth;
      }
    }
    return { year, month };
  }

  /**
   * Human-readable label for the effective minimum (e.g. "August 2012") when
   * any selected ETF actually constrains the picker; empty otherwise.
   */
  get effectiveMinHistoricalLabel(): string {
    const { year, month } = this.effectiveMinHistoricalDate;
    if (year <= 1993 && month <= 1) return '';
    const monthName = this.monthOptions.find(m => m.value === month)?.label ?? '';
    return `${monthName} ${year}`;
  }

  /** Years selectable for the historical start, constrained by the active ETF(s). */
  get historicalYearOptions(): SelectOption[] {
    const minYear = this.effectiveMinHistoricalDate.year;
    const options: SelectOption[] = [];
    for (let y = this.currentYear; y >= minYear; y--) {
      options.push({ value: y, label: String(y) });
    }
    return options;
  }

  /**
   * Months selectable for the historical start. Filters out months before the
   * effective minimum (when the year matches) and months in the current year
   * that haven't elapsed yet (so the user can't pick "the future").
   */
  get historicalMonthOptions(): SelectOption[] {
    const { year: minYear, month: minMonth } = this.effectiveMinHistoricalDate;
    if (this.selectedHistoricalYear === minYear) {
      return this.monthOptions.filter(m => Number(m.value) >= minMonth);
    }
    if (this.selectedHistoricalYear === this.currentYear) {
      return this.monthOptions.filter(m => Number(m.value) < this.currentMonth);
    }
    return this.monthOptions;
  }

  /**
   * Symbols that should constrain the historical picker right now: the
   * portfolio members in custom-portfolio mode; the primary ETF (plus the
   * comparison ETF when comparison is on) otherwise. The picker uses the
   * latest start date among these so neither simulation will fail backend
   * coverage validation.
   */
  private activeHistoricalSymbols(): string[] {
    if (this.isCustomPortfolio) {
      return this.portfolioAllocations.filter(a => a.weight > 0).map(a => a.symbol);
    }
    const symbols: string[] = [];
    if (this.selectedIndexSymbol) symbols.push(this.selectedIndexSymbol);
    if (this.selectedCompareIndexSymbol) symbols.push(this.selectedCompareIndexSymbol);
    return symbols;
  }
}

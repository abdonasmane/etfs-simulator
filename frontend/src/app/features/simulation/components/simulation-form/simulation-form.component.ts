import { Component, EventEmitter, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, FormsModule } from '@angular/forms';
import { CustomSelectComponent, SelectOption } from '../../../../shared/components/custom-select/custom-select.component';
import { TooltipComponent } from '../../../../shared/components/tooltip/tooltip.component';
import {
  PortfolioAllocatorComponent,
  AllocationOutput,
} from '../../../../shared/components/portfolio-allocator/portfolio-allocator.component';

/**
 * Form data emitted when user submits a simulation request.
 */
export interface SimulationFormData {
  initialInvestment: number;
  monthlyContribution: number;
  contributionGrowthRate: number;
  mode: 'years' | 'target';
  years?: number;
  targetYear?: number;
  targetMonth?: number;
  /** Portfolio allocations - if provided, returns blended range projections */
  portfolio?: AllocationOutput[];
  /** Index symbol (e.g., "SPY", "QQQ") - if provided, returns range projections */
  indexSymbol?: string;
  /** Annual return rate - only used when no indexSymbol or portfolio is provided */
  annualReturnRate?: number;
}

/**
 * Index option with symbol for API and display value.
 */
interface IndexOption extends SelectOption {
  symbol?: string;
}

/**
 * Form component for entering simulation parameters.
 * Supports both "by years" and "by target date" modes.
 */
@Component({
  selector: 'app-simulation-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, CustomSelectComponent, TooltipComponent, PortfolioAllocatorComponent],
  templateUrl: './simulation-form.component.html',
  styleUrl: './simulation-form.component.scss',
})
export class SimulationFormComponent {
  @Output() simulate = new EventEmitter<SimulationFormData>();

  form: FormGroup;
  mode: 'years' | 'target' = 'years';
  currentYear = new Date().getFullYear();

  /** Options for contribution growth rate dropdown */
  growthOptions: SelectOption[] = [
    { label: 'None - fixed contribution', value: 0 },
    { label: '+2.5%/year (typical inflation)', value: 2.5 },
    { label: '+4%/year (typical salary growth)', value: 4 },
    { label: 'Custom...', value: -1 },
  ];

  /** Options for expected annual return based on historical index performance */
  returnOptions: IndexOption[] = [
    { label: 'S&P 500', value: 1, hint: '~8.7% median (20yr rolling)', symbol: 'SPY' },
    { label: 'NASDAQ 100', value: 2, hint: '~13.6% median (20yr rolling)', symbol: 'QQQ' },
    { label: 'MSCI EAFE', value: 3, hint: '~5.7% median (20yr rolling)', symbol: 'EFA' },
    { label: 'Custom Portfolio', value: -2, hint: 'Mix multiple ETFs' },
    { label: 'Custom rate...', value: -1 },
  ];

  /** Selected growth option value (-1 means custom) */
  selectedGrowthOption = 0;

  /** Selected return option value (-1 means custom, positive values are index IDs) */
  selectedReturnOption = 1; // Default to S&P 500

  /** Available months for target date selection */
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

  /** Current portfolio allocations (for custom portfolio mode) */
  portfolioAllocations: AllocationOutput[] = [
    { symbol: 'SPY', weight: 60 },
    { symbol: 'QQQ', weight: 30 },
    { symbol: 'EFA', weight: 10 },
  ];

  private readonly fb = inject(FormBuilder);

  constructor() {
    this.form = this.fb.group({
      initialInvestment: [1000, [Validators.required, Validators.min(0)]],
      monthlyContribution: [500, [Validators.required, Validators.min(0)]],
      annualReturnRate: [7, [Validators.required, Validators.min(0), Validators.max(100)]], // Only used for custom
      contributionGrowthRate: [0, [Validators.required, Validators.min(0), Validators.max(20)]],
      years: [10, [Validators.required, Validators.min(1), Validators.max(49)]],
      targetYearsFromNow: [10, [Validators.required, Validators.min(1), Validators.max(49)]],
      targetMonth: [12, [Validators.required, Validators.min(1), Validators.max(12)]],
    });
  }

  /**
   * Get the currently selected index symbol (if any).
   */
  get selectedIndexSymbol(): string | undefined {
    const option = this.returnOptions.find(o => o.value === this.selectedReturnOption);
    return option?.symbol;
  }

  /**
   * Switch between 'years' and 'target' modes.
   */
  setMode(mode: 'years' | 'target'): void {
    this.mode = mode;
  }

  /**
   * Handle growth option selection from dropdown.
   */
  onGrowthOptionChange(value: number): void {
    this.selectedGrowthOption = value;
    if (value >= 0) {
      this.form.patchValue({ contributionGrowthRate: value });
    }
  }

  /**
   * Handle return option selection from dropdown.
   */
  onReturnOptionChange(value: number): void {
    this.selectedReturnOption = value;
    // When custom is selected, set default to 7%
    if (value === -1) {
      this.form.patchValue({ annualReturnRate: 7 });
    }
  }

  /**
   * Check if custom growth rate input should be shown.
   */
  get isCustomGrowth(): boolean {
    return this.selectedGrowthOption === -1;
  }

  /**
   * Check if custom return rate input should be shown.
   */
  get isCustomReturn(): boolean {
    return this.selectedReturnOption === -1;
  }

  /**
   * Check if custom portfolio mode is active.
   */
  get isCustomPortfolio(): boolean {
    return this.selectedReturnOption === -2;
  }

  /**
   * Check if portfolio allocations are valid (sum to 100).
   */
  get isPortfolioValid(): boolean {
    const total = this.portfolioAllocations.reduce((sum, a) => sum + a.weight, 0);
    return total === 100;
  }

  /**
   * Get the target year based on years from now.
   */
  get targetYear(): number {
    return this.currentYear + (this.form.value.targetYearsFromNow || 10);
  }

  /**
   * Handle portfolio allocations change.
   */
  onPortfolioChange(allocations: AllocationOutput[]): void {
    this.portfolioAllocations = allocations;
  }

  /**
   * Submit the form and emit simulation data.
   */
  onSubmit(): void {
    if (this.form.invalid) {
      return;
    }

    // Validate portfolio if in portfolio mode
    if (this.isCustomPortfolio && !this.isPortfolioValid) {
      return;
    }

    const formValue = this.form.value;
    const data: SimulationFormData = {
      initialInvestment: formValue.initialInvestment,
      monthlyContribution: formValue.monthlyContribution,
      contributionGrowthRate: formValue.contributionGrowthRate,
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
    } else {
      data.targetYear = this.targetYear;
      data.targetMonth = formValue.targetMonth;
    }

    this.simulate.emit(data);
  }
}

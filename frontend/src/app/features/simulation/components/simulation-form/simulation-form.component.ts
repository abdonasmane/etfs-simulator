import { Component, EventEmitter, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, FormsModule } from '@angular/forms';

/**
 * Form data emitted when user submits a simulation request.
 */
export interface SimulationFormData {
  initialInvestment: number;
  monthlyContribution: number;
  annualReturnRate: number;
  contributionGrowthRate: number;
  mode: 'years' | 'target';
  years?: number;
  targetYear?: number;
  targetMonth?: number;
}

/**
 * Option for contribution growth rate dropdown.
 * Use value = -1 for "Custom" option.
 */
interface GrowthOption {
  label: string;
  value: number;
}

/**
 * Form component for entering simulation parameters.
 * Supports both "by years" and "by target date" modes.
 */
@Component({
  selector: 'app-simulation-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './simulation-form.component.html',
  styleUrl: './simulation-form.component.scss',
})
export class SimulationFormComponent {
  @Output() simulate = new EventEmitter<SimulationFormData>();

  form: FormGroup;
  mode: 'years' | 'target' = 'years';
  currentYear = new Date().getFullYear();

  /** Options for contribution growth rate dropdown */
  growthOptions: GrowthOption[] = [
    { label: 'None - fixed contribution', value: 0 },
    { label: '+2.5%/year (typical inflation)', value: 2.5 },
    { label: '+4%/year (typical salary growth)', value: 4 },
    { label: 'Custom...', value: -1 },
  ];

  /** Selected growth option value (-1 means custom) */
  selectedGrowthOption = 0;

  /** Available months for target date selection */
  months = [
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

  private readonly fb = inject(FormBuilder);

  constructor() {
    this.form = this.fb.group({
      initialInvestment: [1000, [Validators.required, Validators.min(0)]],
      monthlyContribution: [500, [Validators.required, Validators.min(0)]],
      annualReturnRate: [7, [Validators.required, Validators.min(0), Validators.max(100)]],
      contributionGrowthRate: [0, [Validators.required, Validators.min(0), Validators.max(20)]],
      years: [10, [Validators.required, Validators.min(1), Validators.max(50)]],
      targetYear: [this.currentYear + 10, [Validators.required, Validators.min(this.currentYear + 1)]],
      targetMonth: [12, [Validators.required, Validators.min(1), Validators.max(12)]],
    });
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
      // Preset selected - apply the value
      this.form.patchValue({ contributionGrowthRate: value });
    }
    // If custom (-1), keep the current form value and show input
  }

  /**
   * Check if custom growth rate input should be shown.
   */
  get isCustomGrowth(): boolean {
    return this.selectedGrowthOption === -1;
  }

  /**
   * Submit the form and emit simulation data.
   */
  onSubmit(): void {
    if (this.form.invalid) {
      return;
    }

    const formValue = this.form.value;
    const data: SimulationFormData = {
      initialInvestment: formValue.initialInvestment,
      monthlyContribution: formValue.monthlyContribution,
      annualReturnRate: formValue.annualReturnRate,
      contributionGrowthRate: formValue.contributionGrowthRate,
      mode: this.mode,
    };

    if (this.mode === 'years') {
      data.years = formValue.years;
    } else {
      data.targetYear = formValue.targetYear;
      data.targetMonth = formValue.targetMonth;
    }

    this.simulate.emit(data);
  }
}

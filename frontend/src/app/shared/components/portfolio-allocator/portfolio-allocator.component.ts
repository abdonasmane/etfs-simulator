import { Component, EventEmitter, Output, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

/**
 * ETF definition for portfolio allocation.
 */
export interface PortfolioETF {
  symbol: string;
  name: string;
  hint: string;
  color: string;
}

/**
 * Allocation output for an ETF.
 */
export interface AllocationOutput {
  symbol: string;
  weight: number;
}

/**
 * Available ETFs for portfolio allocation.
 */
export const AVAILABLE_ETFS: PortfolioETF[] = [
  { symbol: 'SPY', name: 'S&P 500', hint: '~8.7% median', color: '#4361ee' },
  { symbol: 'QQQ', name: 'NASDAQ 100', hint: '~13.6% median', color: '#7c3aed' },
  { symbol: 'EFA', name: 'MSCI EAFE', hint: '~5.7% median', color: '#0891b2' },
];

/**
 * Portfolio allocator component with interactive sliders.
 * Ensures allocations always sum to 100%.
 */
@Component({
  selector: 'app-portfolio-allocator',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="portfolio-allocator">
      <div class="portfolio-header">
        <span class="portfolio-title">Portfolio Allocation</span>
        <span class="portfolio-total" [class.valid]="isValid" [class.invalid]="!isValid">
          {{ totalAllocation }}%
        </span>
      </div>

      <div class="allocations">
        @for (etf of etfs; track etf.symbol; let i = $index) {
          <div class="allocation-row">
            <div class="etf-info">
              <span class="etf-color" [style.background]="etf.color"></span>
              <span class="etf-name">{{ etf.name }}</span>
              <span class="etf-hint">{{ etf.hint }}</span>
            </div>
            <div class="allocation-control">
              <input
                type="range"
                [id]="'alloc-' + etf.symbol"
                [(ngModel)]="allocations[i]"
                (ngModelChange)="onAllocationChange(i)"
                min="0"
                max="100"
                step="5"
                class="allocation-slider"
                [style.--slider-color]="etf.color"
              />
              <div class="allocation-value">
                <input
                  type="number"
                  [(ngModel)]="allocations[i]"
                  (ngModelChange)="onAllocationChange(i)"
                  min="0"
                  max="100"
                  class="allocation-input"
                />
                <span class="percent">%</span>
              </div>
            </div>
          </div>
        }
      </div>

      <div class="portfolio-bar">
        @for (etf of etfs; track etf.symbol; let i = $index) {
          @if (allocations[i] > 0) {
            <div
              class="bar-segment"
              [style.width.%]="allocations[i]"
              [style.background]="etf.color"
              [title]="etf.name + ': ' + allocations[i] + '%'"
            ></div>
          }
        }
      </div>

      <div class="quick-presets">
        <button type="button" class="preset-btn" (click)="applyPreset('balanced')">
          Balanced
        </button>
        <button type="button" class="preset-btn" (click)="applyPreset('aggressive')">
          Aggressive
        </button>
        <button type="button" class="preset-btn" (click)="applyPreset('conservative')">
          Conservative
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      .portfolio-allocator {
        background: var(--color-bg-tertiary);
        border-radius: 12px;
        padding: 1rem;
        margin-top: 0.5rem;
      }

      .portfolio-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1rem;
      }

      .portfolio-title {
        font-weight: 600;
        font-size: 0.875rem;
        color: var(--color-text-primary);
      }

      .portfolio-total {
        font-weight: 700;
        font-size: 0.875rem;
        padding: 0.25rem 0.5rem;
        border-radius: 6px;
        transition: all 0.2s ease;

        &.valid {
          background: rgba(34, 197, 94, 0.2);
          color: #4ade80;
        }

        &.invalid {
          background: rgba(239, 68, 68, 0.2);
          color: #f87171;
        }
      }

      .allocations {
        display: flex;
        flex-direction: column;
        gap: 0.875rem;
      }

      .allocation-row {
        display: flex;
        flex-direction: column;
        gap: 0.375rem;
      }

      .etf-info {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }

      .etf-color {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        flex-shrink: 0;
        box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.15);
      }

      .etf-name {
        font-weight: 600;
        font-size: 0.8rem;
        color: var(--color-text-primary);
      }

      .etf-hint {
        font-size: 0.7rem;
        color: var(--color-text-muted);
      }

      .allocation-control {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }

      .allocation-slider {
        flex: 1;
        height: 6px;
        -webkit-appearance: none;
        appearance: none;
        background: rgba(148, 163, 184, 0.4);
        border-radius: 3px;
        outline: none;
        cursor: pointer;

        &::-webkit-slider-runnable-track {
          height: 6px;
          border-radius: 3px;
          background: rgba(148, 163, 184, 0.4);
        }

        &::-moz-range-track {
          height: 6px;
          border-radius: 3px;
          background: rgba(148, 163, 184, 0.4);
        }

        &::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: var(--slider-color, var(--color-accent));
          cursor: pointer;
          border: 3px solid var(--color-bg-secondary);
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
          transition: transform 0.15s ease;
          margin-top: -6px;

          &:hover {
            transform: scale(1.1);
          }
        }

        &::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: var(--slider-color, var(--color-accent));
          cursor: pointer;
          border: 3px solid var(--color-bg-secondary);
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
        }
      }

      .allocation-value {
        display: flex;
        align-items: center;
        gap: 0.125rem;
        min-width: 55px;
      }

      .allocation-input {
        width: 40px;
        padding: 0.25rem 0.375rem;
        border: 1px solid var(--color-border);
        border-radius: 6px;
        font-size: 0.8rem;
        font-weight: 600;
        text-align: center;
        color: var(--color-text-primary);
        background: var(--color-bg-secondary);

        &:focus {
          outline: none;
          border-color: var(--color-accent);
        }

        /* Hide number input spinners */
        -moz-appearance: textfield;
        &::-webkit-outer-spin-button,
        &::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
      }

      .percent {
        font-size: 0.75rem;
        color: var(--color-text-muted);
        font-weight: 600;
      }

      .portfolio-bar {
        display: flex;
        height: 8px;
        border-radius: 4px;
        overflow: hidden;
        margin-top: 1rem;
        background: var(--color-border);
      }

      .bar-segment {
        height: 100%;
        transition: width 0.2s ease;
      }

      .quick-presets {
        display: flex;
        gap: 0.5rem;
        margin-top: 0.875rem;
      }

      .preset-btn {
        flex: 1;
        padding: 0.5rem 0.75rem;
        border: 1px solid var(--color-border);
        border-radius: 8px;
        background: var(--color-bg-secondary);
        color: var(--color-text-secondary);
        font-size: 0.75rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;

        &:hover {
          border-color: var(--color-accent);
          color: var(--color-accent);
        }
      }
    `,
  ],
})
export class PortfolioAllocatorComponent implements OnInit {
  @Input() initialAllocations: number[] = [60, 30, 10];
  @Output() allocationsChange = new EventEmitter<AllocationOutput[]>();

  readonly etfs = AVAILABLE_ETFS;
  allocations: number[] = [60, 30, 10];

  ngOnInit(): void {
    if (this.initialAllocations?.length === this.etfs.length) {
      this.allocations = [...this.initialAllocations];
    }
    this.emitAllocations();
  }

  get totalAllocation(): number {
    return this.allocations.reduce((sum, val) => sum + val, 0);
  }

  get isValid(): boolean {
    return this.totalAllocation === 100;
  }

  onAllocationChange(changedIndex: number): void {
    // Clamp value between 0 and 100
    this.allocations[changedIndex] = Math.max(0, Math.min(100, this.allocations[changedIndex] || 0));
    this.emitAllocations();
  }

  applyPreset(preset: 'balanced' | 'aggressive' | 'conservative'): void {
    switch (preset) {
      case 'balanced':
        this.allocations = [50, 30, 20];
        break;
      case 'aggressive':
        this.allocations = [40, 50, 10];
        break;
      case 'conservative':
        this.allocations = [60, 15, 25];
        break;
    }
    this.emitAllocations();
  }

  private emitAllocations(): void {
    const output: AllocationOutput[] = this.etfs
      .map((etf, i) => ({
        symbol: etf.symbol,
        weight: this.allocations[i],
      }))
      .filter(a => a.weight > 0);

    this.allocationsChange.emit(output);
  }
}

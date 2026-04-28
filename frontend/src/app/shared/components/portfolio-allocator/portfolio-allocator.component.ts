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
  { symbol: 'VTI', name: 'US Total Market', hint: 'Vanguard', color: '#059669' },
  { symbol: 'IEMG', name: 'Emerging Markets', hint: 'iShares', color: '#dc2626' },
  { symbol: 'VWCE.DE', name: 'FTSE All-World', hint: 'UCITS', color: '#6366f1' },
  { symbol: 'ISDU.L', name: 'MSCI USA Islamic', hint: 'Shariah', color: '#0d9488' },
  { symbol: 'IGDA.L', name: 'Global Dev. Islamic', hint: 'Shariah', color: '#b45309' },
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
        <button type="button" class="preset-btn" (click)="applyPreset('balanced')">Balanced</button>
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
        border: 1px solid var(--color-border);
        border-radius: 8px;
        padding: 0.875rem;
        margin-top: 0.5rem;
      }

      .portfolio-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.875rem;
      }

      .portfolio-title {
        font-weight: 600;
        font-size: 0.75rem;
        color: var(--color-text-primary);
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }

      .portfolio-total {
        font-weight: 600;
        font-size: 0.8125rem;
        padding: 0.2rem 0.5rem;
        border-radius: 4px;
        transition: all 0.15s ease;
        font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
        font-variant-numeric: tabular-nums;

        &.valid {
          background: var(--color-success-light);
          color: var(--color-success);
        }

        &.invalid {
          background: var(--color-error-light);
          color: var(--color-error);
        }
      }

      .allocations {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }

      .allocation-row {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
      }

      .etf-info {
        display: flex;
        align-items: center;
        gap: 0.45rem;
      }

      .etf-color {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
      }

      .etf-name {
        font-weight: 600;
        font-size: 0.75rem;
        color: var(--color-text-primary);
      }

      .etf-hint {
        font-size: 0.6875rem;
        color: var(--color-text-muted);
      }

      .allocation-control {
        display: flex;
        align-items: center;
        gap: 0.625rem;
      }

      .allocation-slider {
        flex: 1;
        height: 4px;
        -webkit-appearance: none;
        appearance: none;
        background: var(--color-border);
        border-radius: 2px;
        outline: none;
        cursor: pointer;

        &::-webkit-slider-runnable-track {
          height: 4px;
          border-radius: 2px;
          background: var(--color-border);
        }

        &::-moz-range-track {
          height: 4px;
          border-radius: 2px;
          background: var(--color-border);
        }

        &::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: var(--slider-color, var(--color-accent));
          cursor: pointer;
          border: 2px solid var(--color-bg-secondary);
          transition: transform 0.15s ease;
          margin-top: -5px;
          box-shadow: 0 0 0 1px var(--color-border);

          &:hover {
            transform: scale(1.15);
          }
        }

        &::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: var(--slider-color, var(--color-accent));
          cursor: pointer;
          border: 2px solid var(--color-bg-secondary);
          box-shadow: 0 0 0 1px var(--color-border);
        }
      }

      .allocation-value {
        display: flex;
        align-items: center;
        gap: 0.125rem;
        min-width: 52px;
      }

      .allocation-input {
        width: 38px;
        padding: 0.2rem 0.3rem;
        border: 1px solid var(--color-border);
        border-radius: 4px;
        font-size: 0.75rem;
        font-weight: 600;
        text-align: center;
        color: var(--color-text-primary);
        background: var(--color-bg-secondary);
        font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
        font-variant-numeric: tabular-nums;

        &:focus {
          outline: none;
          border-color: var(--color-accent);
          box-shadow: 0 0 0 2px var(--color-accent-light);
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
        font-size: 0.6875rem;
        color: var(--color-text-muted);
        font-weight: 500;
      }

      .portfolio-bar {
        display: flex;
        height: 6px;
        border-radius: 3px;
        overflow: hidden;
        margin-top: 0.875rem;
        background: var(--color-border);
      }

      .bar-segment {
        height: 100%;
        transition: width 0.2s ease;
      }

      .quick-presets {
        display: flex;
        gap: 0.4rem;
        margin-top: 0.75rem;
      }

      .preset-btn {
        flex: 1;
        padding: 0.4rem 0.6rem;
        border: 1px solid var(--color-border);
        border-radius: 4px;
        background: var(--color-bg-secondary);
        color: var(--color-text-secondary);
        font-size: 0.6875rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s ease;
        text-transform: uppercase;
        letter-spacing: 0.04em;

        &:hover {
          border-color: var(--color-accent);
          color: var(--color-accent);
          background: var(--color-accent-light);
        }
      }
    `,
  ],
})
export class PortfolioAllocatorComponent implements OnInit {
  @Input() initialAllocations: number[] = [50, 30, 20, 0, 0, 0, 0, 0];
  @Output() allocationsChange = new EventEmitter<AllocationOutput[]>();

  readonly etfs = AVAILABLE_ETFS;
  allocations: number[] = [50, 30, 20, 0, 0, 0, 0, 0];

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
    this.allocations[changedIndex] = Math.max(
      0,
      Math.min(100, this.allocations[changedIndex] || 0)
    );
    this.emitAllocations();
  }

  applyPreset(preset: 'balanced' | 'aggressive' | 'conservative'): void {
    // Allocations match AVAILABLE_ETFS order: SPY, QQQ, EFA, VTI, IEMG, VWCE.DE, ISDU.L, IGDA.L
    switch (preset) {
      case 'balanced':
        this.allocations = [40, 20, 15, 15, 10, 0, 0, 0];
        break;
      case 'aggressive':
        this.allocations = [25, 40, 5, 10, 20, 0, 0, 0];
        break;
      case 'conservative':
        this.allocations = [50, 10, 20, 15, 5, 0, 0, 0];
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

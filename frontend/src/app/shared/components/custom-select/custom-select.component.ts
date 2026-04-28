import {
  Component,
  Input,
  Output,
  EventEmitter,
  HostListener,
  ElementRef,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { trigger, transition, style, animate } from '@angular/animations';

/**
 * Option for the custom select dropdown.
 */
export interface SelectOption {
  label: string;
  value: number;
  hint?: string;
}

/**
 * Custom styled dropdown that matches the app's design.
 * Replaces native <select> for better UX.
 */
@Component({
  selector: 'app-custom-select',
  standalone: true,
  imports: [CommonModule],
  animations: [
    trigger('dropdown', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-8px)' }),
        animate('150ms ease-out', style({ opacity: 1, transform: 'translateY(0)' })),
      ]),
      transition(':leave', [
        animate('100ms ease-in', style({ opacity: 0, transform: 'translateY(-8px)' })),
      ]),
    ]),
  ],
  template: `
    <div class="custom-select" [class.open]="isOpen">
      <button
        type="button"
        class="select-trigger"
        (click)="toggle()"
        [attr.aria-expanded]="isOpen"
        aria-haspopup="listbox"
      >
        <span class="selected-label">{{ selectedLabel }}</span>
        <span class="arrow">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
          >
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </span>
      </button>

      @if (isOpen) {
        <div class="dropdown" role="listbox" @dropdown>
          @for (option of options; track option.value) {
            <button
              type="button"
              class="option"
              [class.selected]="option.value === value"
              (click)="selectOption(option)"
              role="option"
              [attr.aria-selected]="option.value === value"
            >
              <span class="option-label">{{ option.label }}</span>
              @if (option.hint) {
                <span class="option-hint">{{ option.hint }}</span>
              }
              @if (option.value === value) {
                <span class="check">✓</span>
              }
            </button>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      .custom-select {
        position: relative;
        width: 100%;
      }

      .select-trigger {
        width: 100%;
        padding: 0.625rem 0.75rem;
        padding-right: 2rem;
        border: 1px solid var(--color-border);
        border-radius: 6px;
        background: var(--color-bg-secondary);
        font-size: 0.875rem;
        color: var(--color-text-primary);
        text-align: left;
        cursor: pointer;
        transition: all 0.15s ease;
        display: flex;
        align-items: center;
        justify-content: space-between;
        letter-spacing: -0.005em;

        &:hover {
          border-color: var(--color-border-strong);
        }

        &:focus {
          outline: none;
          border-color: var(--color-accent);
          box-shadow: 0 0 0 3px var(--color-accent-light);
        }
      }

      .custom-select.open .select-trigger {
        border-color: var(--color-accent);
        box-shadow: 0 0 0 3px var(--color-accent-light);
      }

      .selected-label {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .arrow {
        display: flex;
        align-items: center;
        color: var(--color-text-muted);
        transition: transform 0.2s ease;
      }

      .custom-select.open .arrow {
        transform: rotate(180deg);
        color: var(--color-accent);
      }

      .dropdown {
        position: absolute;
        top: calc(100% + 4px);
        left: 0;
        right: 0;
        background: var(--color-bg-secondary);
        border: 1px solid var(--color-border);
        border-radius: 8px;
        box-shadow: var(--shadow-lg);
        z-index: 100;
        max-height: 280px;
        overflow-y: auto;
        padding: 4px;
      }

      .option {
        width: 100%;
        padding: 0.5rem 0.625rem;
        border: none;
        background: transparent;
        font-size: 0.8125rem;
        color: var(--color-text-primary);
        text-align: left;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        transition: background 0.1s ease;
        border-radius: 4px;
        letter-spacing: -0.005em;

        &:hover {
          background: var(--color-bg-tertiary);
        }

        &.selected {
          background: var(--color-accent-light);
          color: var(--color-accent);
          font-weight: 600;
        }
      }

      .option-label {
        flex: 1;
      }

      .option-hint {
        font-size: 0.75rem;
        color: var(--color-text-muted);
        font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
        font-variant-numeric: tabular-nums;
      }

      .check {
        color: var(--color-accent);
        font-weight: 700;
      }
    `,
  ],
})
export class CustomSelectComponent {
  @Input() options: SelectOption[] = [];
  @Input() value = 0;
  @Input() placeholder = 'Select...';
  @Output() valueChange = new EventEmitter<number>();

  isOpen = false;

  private readonly elementRef = inject(ElementRef);

  /**
   * Get the label for the currently selected value.
   */
  get selectedLabel(): string {
    const selected = this.options.find(o => o.value === this.value);
    return selected?.label || this.placeholder;
  }

  /**
   * Toggle dropdown open/closed.
   */
  toggle(): void {
    this.isOpen = !this.isOpen;
  }

  /**
   * Select an option and close dropdown.
   */
  selectOption(option: SelectOption): void {
    this.value = option.value;
    this.valueChange.emit(option.value);
    this.isOpen = false;
  }

  /**
   * Close dropdown when clicking outside.
   */
  @HostListener('document:click', ['$event'])
  onClickOutside(event: Event): void {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.isOpen = false;
    }
  }

  /**
   * Close dropdown on Escape key.
   */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.isOpen = false;
  }
}

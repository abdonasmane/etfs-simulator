import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Tooltip component with a help icon that shows explanatory text on hover.
 * Provides contextual help for form fields.
 */
@Component({
  selector: 'app-tooltip',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="tooltip-wrapper">
      <button
        type="button"
        class="tooltip-trigger"
        [attr.aria-label]="'Help: ' + text"
        (mouseenter)="show = true"
        (mouseleave)="show = false"
        (focus)="show = true"
        (blur)="show = false"
      >
        <svg
          class="help-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
      </button>
      @if (show) {
        <div class="tooltip-content" [class.position-left]="position === 'left'">
          <div class="tooltip-arrow"></div>
          {{ text }}
        </div>
      }
    </span>
  `,
  styles: [
    `
      .tooltip-wrapper {
        position: relative;
        display: inline-flex;
        align-items: center;
        margin-left: 0.375rem;
        transform: translateY(1px);
      }

      .tooltip-trigger {
        background: none;
        border: none;
        padding: 0;
        cursor: help;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--color-text-muted);
        transition: color 0.2s ease;
        line-height: 1;

        &:hover,
        &:focus {
          color: var(--color-accent);
          outline: none;
        }
      }

      .help-icon {
        width: 14px;
        height: 14px;
        display: block;
      }

      .tooltip-content {
        position: absolute;
        bottom: calc(100% + 8px);
        left: 50%;
        transform: translateX(-50%);
        background: var(--color-text-primary);
        color: var(--color-bg-primary);
        padding: 0.625rem 0.875rem;
        border-radius: 8px;
        font-size: 0.8rem;
        font-weight: 500;
        line-height: 1.4;
        white-space: normal;
        width: max-content;
        max-width: 260px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 1000;
        animation: tooltipFadeIn 0.15s ease-out;

        &.position-left {
          left: auto;
          right: 0;
          transform: none;

          .tooltip-arrow {
            left: auto;
            right: 8px;
            transform: none;
          }
        }
      }

      .tooltip-arrow {
        position: absolute;
        bottom: -6px;
        left: 50%;
        transform: translateX(-50%);
        width: 0;
        height: 0;
        border-left: 6px solid transparent;
        border-right: 6px solid transparent;
        border-top: 6px solid var(--color-text-primary);
      }

      @keyframes tooltipFadeIn {
        from {
          opacity: 0;
          transform: translateX(-50%) translateY(4px);
        }
        to {
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }
      }
    `,
  ],
})
export class TooltipComponent {
  @Input({ required: true }) text = '';
  @Input() position: 'center' | 'left' = 'center';

  show = false;
}

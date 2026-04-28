import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThemeService } from '../../../core/services';

/**
 * Animated theme toggle switch with sun/moon icons.
 * Provides a polished way to switch between light and dark modes.
 */
@Component({
  selector: 'app-theme-toggle',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button
      class="theme-toggle"
      [class.dark]="themeService.isDark()"
      (click)="themeService.toggle()"
      [attr.aria-label]="themeService.isDark() ? 'Switch to light mode' : 'Switch to dark mode'"
      title="Toggle theme"
    >
      <div class="toggle-track">
        <div class="toggle-thumb">
          <!-- Sun icon -->
          <svg
            class="icon sun"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="5"></circle>
            <line x1="12" y1="1" x2="12" y2="3"></line>
            <line x1="12" y1="21" x2="12" y2="23"></line>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
            <line x1="1" y1="12" x2="3" y2="12"></line>
            <line x1="21" y1="12" x2="23" y2="12"></line>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
          </svg>
          <!-- Moon icon -->
          <svg
            class="icon moon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
          </svg>
        </div>
      </div>
    </button>
  `,
  styles: [
    `
      .theme-toggle {
        background: transparent;
        border: none;
        padding: 4px;
        cursor: pointer;
        border-radius: 20px;
        transition: transform 0.2s ease;

        &:hover {
          transform: scale(1.05);
        }

        &:active {
          transform: scale(0.95);
        }

        &:focus {
          outline: 2px solid var(--color-accent);
          outline-offset: 2px;
        }
      }

      .toggle-track {
        width: 44px;
        height: 24px;
        background: var(--color-bg-tertiary);
        border: 1px solid var(--color-border);
        border-radius: 12px;
        padding: 2px;
        transition:
          background 0.25s ease,
          border-color 0.25s ease;
        position: relative;
      }

      .dark .toggle-track {
        background: var(--color-bg-tertiary);
        border-color: var(--color-border-strong);
      }

      .toggle-thumb {
        width: 18px;
        height: 18px;
        background: var(--color-bg-secondary);
        border: 1px solid var(--color-border-strong);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
      }

      .dark .toggle-thumb {
        transform: translateX(20px);
      }

      .icon {
        width: 12px;
        height: 12px;
        position: absolute;
        transition: all 0.25s ease;
      }

      .sun {
        color: var(--color-warning);
        opacity: 1;
        transform: rotate(0deg) scale(1);
      }

      .moon {
        color: var(--color-accent);
        opacity: 0;
        transform: rotate(-90deg) scale(0.5);
      }

      .dark .sun {
        opacity: 0;
        transform: rotate(90deg) scale(0.5);
      }

      .dark .moon {
        opacity: 1;
        transform: rotate(0deg) scale(1);
      }
    `,
  ],
})
export class ThemeToggleComponent {
  readonly themeService = inject(ThemeService);
}

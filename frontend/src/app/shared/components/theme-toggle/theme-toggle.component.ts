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
        width: 52px;
        height: 28px;
        background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
        border-radius: 14px;
        padding: 3px;
        transition: background 0.3s ease;
        position: relative;
        overflow: hidden;

        &::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
          opacity: 0;
          transition: opacity 0.3s ease;
          border-radius: 14px;
        }
      }

      .dark .toggle-track::before {
        opacity: 1;
      }

      .toggle-thumb {
        width: 22px;
        height: 22px;
        background: white;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        position: relative;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
      }

      .dark .toggle-thumb {
        transform: translateX(24px);
      }

      .icon {
        width: 14px;
        height: 14px;
        position: absolute;
        transition: all 0.3s ease;
      }

      .sun {
        color: #f59e0b;
        opacity: 1;
        transform: rotate(0deg) scale(1);
      }

      .moon {
        color: #3b82f6;
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

import { Injectable, signal, effect } from '@angular/core';

export type Theme = 'light' | 'dark';

const THEME_KEY = 'etf-simulator-theme';

/**
 * Service for managing application theme (light/dark mode).
 * Persists preference to localStorage and syncs with system preference.
 */
@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  /** Current theme signal */
  readonly theme = signal<Theme>(this.getInitialTheme());

  /** Whether dark mode is active */
  readonly isDark = (): boolean => this.theme() === 'dark';

  constructor() {
    // Apply theme changes to DOM
    effect(() => {
      const theme = this.theme();
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem(THEME_KEY, theme);
    });

    // Listen for system preference changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
      if (!localStorage.getItem(THEME_KEY)) {
        this.theme.set(e.matches ? 'dark' : 'light');
      }
    });
  }

  /**
   * Toggle between light and dark themes.
   */
  toggle(): void {
    this.theme.set(this.isDark() ? 'light' : 'dark');
  }

  /**
   * Set a specific theme.
   */
  setTheme(theme: Theme): void {
    this.theme.set(theme);
  }

  /**
   * Get initial theme from localStorage or system preference.
   */
  private getInitialTheme(): Theme {
    const stored = localStorage.getItem(THEME_KEY) as Theme | null;
    if (stored) {
      return stored;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
}

import { Injectable } from '@angular/core';

/**
 * Runtime configuration loaded from config.json.
 * This allows environment variables to be injected at container startup.
 */
export interface AppConfig {
  apiUrl: string;
}

/**
 * Service for loading and accessing runtime configuration.
 * Configuration is loaded from /assets/config.json at app startup.
 */
@Injectable({
  providedIn: 'root',
})
export class ConfigService {
  private config: AppConfig | null = null;

  /**
   * Load configuration from config.json.
   * This should be called during app initialization.
   */
  async load(): Promise<void> {
    try {
      const response = await fetch('/assets/config.json');
      const config = await response.json();

      // Handle unsubstituted placeholders (local dev without envsubst)
      this.config = {
        apiUrl: this.resolveValue(config.apiUrl, 'http://localhost:8080'),
      };
    } catch (error) {
      console.warn('Failed to load config.json, using defaults:', error);
      this.config = {
        apiUrl: 'http://localhost:8080',
      };
    }
  }

  /**
   * Get the API URL for backend requests.
   */
  get apiUrl(): string {
    return this.config?.apiUrl ?? 'http://localhost:8080';
  }

  /**
   * Resolve a config value, replacing unsubstituted placeholders with defaults.
   */
  private resolveValue(value: string, defaultValue: string): string {
    // If value looks like an unsubstituted placeholder ${...}, use default
    if (!value || value.startsWith('${')) {
      return defaultValue;
    }
    return value;
  }
}

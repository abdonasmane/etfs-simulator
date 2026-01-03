/**
 * Models for the health check endpoint.
 * GET /health
 */

export interface HealthResponse {
  /** Health status (e.g., "healthy") */
  status: string;

  /** Timestamp of the health check */
  timestamp: string;
}

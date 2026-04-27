import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { ConfigService } from './config.service';
import {
  HealthResponse,
  SimulateByYearsRequest,
  SimulateByYearsResponse,
  SimulateByTargetRequest,
  SimulateByTargetResponse,
  SimulateHistoricalRequest,
  SimulateHistoricalResponse,
  ApiError,
} from '../models';

/**
 * Service for communicating with the ETFs Simulator backend API.
 *
 * Provides typed methods for all API endpoints with proper error handling.
 */
@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly configService = inject(ConfigService);

  private get baseUrl(): string {
    return this.configService.apiUrl;
  }

  /**
   * Check API health status.
   * GET /health
   */
  getHealth(): Observable<HealthResponse> {
    return this.http.get<HealthResponse>(`${this.baseUrl}/health`).pipe(catchError(this.handleError));
  }

  /**
   * Run simulation for a specified number of years.
   * POST /api/v1/simulate/years
   *
   * @param request - Simulation parameters including years
   * @returns Observable with projections and summary
   */
  simulateByYears(request: SimulateByYearsRequest): Observable<SimulateByYearsResponse> {
    return this.http
      .post<SimulateByYearsResponse>(`${this.baseUrl}/api/v1/simulate/years`, request)
      .pipe(catchError(this.handleError));
  }

  /**
   * Run simulation until a target date.
   * POST /api/v1/simulate/target
   *
   * @param request - Simulation parameters including target year/month
   * @returns Observable with projections and summary
   */
  simulateByTarget(request: SimulateByTargetRequest): Observable<SimulateByTargetResponse> {
    return this.http
      .post<SimulateByTargetResponse>(`${this.baseUrl}/api/v1/simulate/target`, request)
      .pipe(catchError(this.handleError));
  }

  /**
   * Run a "what if" simulation using real historical price data.
   * POST /api/v1/simulate/historical
   *
   * @param request - Simulation parameters including start date and ETF selection
   * @returns Observable with actual historical projections and summary
   */
  simulateHistorical(request: SimulateHistoricalRequest): Observable<SimulateHistoricalResponse> {
    return this.http
      .post<SimulateHistoricalResponse>(`${this.baseUrl}/api/v1/simulate/historical`, request)
      .pipe(catchError(this.handleError));
  }

  /**
   * Handle HTTP errors consistently.
   */
  private handleError(error: HttpErrorResponse): Observable<never> {
    let message = 'An unexpected error occurred';

    if (error.error instanceof ErrorEvent) {
      // Client-side error
      message = error.error.message;
    } else if (error.error && (error.error as ApiError).error) {
      // Server returned an error response
      message = (error.error as ApiError).error;
    } else if (error.status === 0) {
      message = 'Unable to connect to the server';
    } else {
      message = `Server error: ${error.status}`;
    }

    console.error('API Error:', message, error);
    return throwError(() => new Error(message));
  }
}

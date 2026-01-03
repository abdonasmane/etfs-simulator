import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { environment } from '../../../environments/environment';
import {
  HealthResponse,
  SimulateByYearsRequest,
  SimulateByYearsResponse,
  SimulateByTargetRequest,
  SimulateByTargetResponse,
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
  private readonly baseUrl = environment.apiUrl;

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

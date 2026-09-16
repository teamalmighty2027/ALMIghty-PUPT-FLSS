import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, EMPTY } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Router } from '@angular/router';
import { environment } from '../../../../../environments/environment.dev';

export interface SystemNotice {
  id: number;
  type: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  source: 'frontend' | 'backend';
  title: string;
  message: string;
  context?: any;
  user_id?: number;
  resolved_at?: string;
  resolved_by?: number;
  created_at: string;
  updated_at: string;
}

export interface PaginatedSystemNoticeResponse {
  data: SystemNotice[];
  total: number;
  current_page: number;
  per_page: number;
}

@Injectable({
  providedIn: 'root',
})
export class SystemNoticeService {
  private baseUrl = environment.apiUrl;
  private router = inject(Router);

  constructor(private http: HttpClient) {}

  /**
   * Report a caught error (severity = 'error').
   */
  error(title: string, error: any, extra?: Record<string, any>): void {
    const message = error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : JSON.stringify(error);

    const stack = error instanceof Error ? error.stack : undefined;

    this.report('error', title, message, {
      ...extra,
      stack,
    });
  }

  /**
   * Report a warning (severity = 'warning').
   */
  warn(title: string, message: string, extra?: Record<string, any>): void {
    this.report('warning', title, message, extra);
  }

  /**
   * Report an informational event (severity = 'info').
   */
  info(title: string, message: string, extra?: Record<string, any>): void {
    this.report('info', title, message, extra);
  }

  /**
   * Submit a notice report to the backend API.
   */
  report(
    severity: 'info' | 'warning' | 'error' | 'critical',
    title: string,
    message: string,
    context: Record<string, any> = {}
  ): void {
    const payload = {
      type: 'frontend_error',
      severity,
      title,
      message,
      context: {
        ...context,
        route: this.router?.url || 'unknown',
        timestamp: new Date().toISOString(),
      },
    };

    // Fire-and-forget: ignore success and swallow failures silently
    this.http.post(`${this.baseUrl}/system-notices/report`, payload)
      .pipe(
        catchError(() => EMPTY)
      )
      .subscribe();
  }

  /**
   * Fetches paginated system notices with optional filters.
   */
  getNotices(
    page: number,
    perPage: number,
    filters: {
      type?: string;
      severity?: string;
      resolved?: boolean;
    } = {}
  ): Observable<PaginatedSystemNoticeResponse> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('per_page', perPage.toString());

    if (filters.type) {
      params = params.set('type', filters.type);
    }
    if (filters.severity) {
      params = params.set('severity', filters.severity);
    }
    if (filters.resolved !== undefined) {
      params = params.set('resolved', filters.resolved.toString());
    }

    return this.http.get<PaginatedSystemNoticeResponse>(
      `${this.baseUrl}/system-notices`,
      { params }
    );
  }

  /**
   * Marks a system notice as resolved.
   */
  resolveNotice(id: number): Observable<any> {
    return this.http.patch<any>(
      `${this.baseUrl}/system-notices/${id}/resolve`,
      {}
    );
  }

  /**
   * Bulk-resolves multiple notices by ID in a single request.
   */
  bulkResolve(
    ids: number[]
  ): Observable<{ message: string; updated: number }> {
    return this.http.patch<{ message: string; updated: number }>(
      `${this.baseUrl}/system-notices/bulk-resolve`,
      { ids }
    );
  }

  /**
   * Gets count of unresolved error/critical notices.
   */
  getUnresolvedCount(): Observable<{ count: number }> {
    return this.http.get<{ count: number }>(
      `${this.baseUrl}/system-notices/unresolved-count`
    );
  }
}

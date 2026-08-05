import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
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

  constructor(private http: HttpClient) {}

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
   * Gets count of unresolved error/critical notices.
   */
  getUnresolvedCount(): Observable<{ count: number }> {
    return this.http.get<{ count: number }>(
      `${this.baseUrl}/system-notices/unresolved-count`
    );
  }
}

import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../../environments/environment.dev';

export type EmailPurpose =
  | 'preference_toggle'
  | 'schedule_published'
  | 'first_login_password'
  | 'deadline_warning'
  | 'reschedule_notification';

export interface EmailLog {
  id: number;
  faculty_id: number | null;
  recipient_email: string;
  recipient_name: string | null;
  purpose: EmailPurpose;
  status: 'queued' | 'sent' | 'failed';
  error_message: string | null;
  dispatched_at: string;
  processed_at: string | null;
  faculty?: {
    id: number;
    user?: {
      name: string;
      email: string;
    };
  };
}

export interface EmailLogParams {
  status?: string;
  purpose?: string;
  date?: string;
  search?: string;
  page?: number;
  per_page?: number;
}

export interface PaginatedEmailLogs {
  data: EmailLog[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}

export interface EmailMetrics {
  queued: number;
  sent: number;
  failed: number;
}

@Injectable({
  providedIn: 'root',
})
export class EmailsService {
  private apiUrl = `${environment.apiUrl}/emails`;

  constructor(private http: HttpClient) {}

  /**
   * Fetches paginated email dispatch logs with optional filters.
   *
   * @param params Optional filter and pagination parameters
   */
  getEmailLogs(params?: EmailLogParams): Observable<PaginatedEmailLogs> {
    let httpParams = new HttpParams();

    if (params) {
      if (params.status && params.status !== 'all') {
        httpParams = httpParams.set('status', params.status);
      }
      if (params.purpose && params.purpose !== 'all') {
        httpParams = httpParams.set('purpose', params.purpose);
      }
      if (params.date) {
        httpParams = httpParams.set('date', params.date);
      }
      if (params.search) {
        httpParams = httpParams.set('search', params.search);
      }
      if (params.page) {
        httpParams = httpParams.set('page', params.page.toString());
      }
      if (params.per_page) {
        httpParams = httpParams.set('per_page', params.per_page.toString());
      }
    }

    return this.http.get<PaginatedEmailLogs>(`${this.apiUrl}/email-logs`, {
      params: httpParams,
    });
  }

  /**
   * Fetches aggregate metrics for email dispatches (queued, sent, failed).
   */
  getEmailMetrics(): Observable<EmailMetrics> {
    return this.http.get<EmailMetrics>(`${this.apiUrl}/email-metrics`);
  }
}

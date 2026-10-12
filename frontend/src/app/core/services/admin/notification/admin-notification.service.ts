import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { environment } from '../../../../../environments/environment.dev';

export interface AppNotification {
  id: string;
  data: {
    title: string;
    message: string;
    action_url: string;
    icon: string;
    faculty_id: number;
    type: string;
  };
  read_at: string | null;
  created_at: string;
}

export interface NotificationQueryParams {
  page?: number;
  per_page?: number;
  filter?: 'all' | 'unread' | 'read' | string;
  search?: string;
  compact?: boolean;
}

export interface NotificationResponse {
  unread_count: number;
  read_count?: number;
  total_count?: number;
  notifications: AppNotification[];
  total?: number;
  current_page?: number;
  last_page?: number;
  per_page?: number;
}

@Injectable({ providedIn: 'root' })
export class AdminNotificationService {
  private apiUrl = `${environment.apiUrl}/admin/notifications`;

  private unreadCountSub = new BehaviorSubject<number>(0);
  unreadCount$ = this.unreadCountSub.asObservable();

  constructor(private http: HttpClient) {}

  /**
   * Fetch notifications with optional pagination, search, and filters.
   */
  getNotifications(
    params?: NotificationQueryParams
  ): Observable<NotificationResponse> {
    let httpParams = new HttpParams();

    if (params) {
      if (params.page !== undefined) {
        httpParams = httpParams.set('page', params.page.toString());
      }
      if (params.per_page !== undefined) {
        httpParams = httpParams.set('per_page', params.per_page.toString());
      }
      if (params.filter && params.filter !== 'all') {
        httpParams = httpParams.set('filter', params.filter);
      }
      if (params.search && params.search.trim()) {
        httpParams = httpParams.set('search', params.search.trim());
      }
      if (params.compact !== undefined) {
        httpParams = httpParams.set('compact', params.compact.toString());
      }
    }

    return this.http.get<NotificationResponse>(this.apiUrl, {
      params: httpParams,
    }).pipe(
      tap((res) => {
        if (typeof res.unread_count === 'number') {
          this.unreadCountSub.next(res.unread_count);
        }
      })
    );
  }

  /**
   * Mark a single notification as read.
   */
  markAsRead(id: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/${id}/read`, {}).pipe(
      tap(() => {
        const currentCount = this.unreadCountSub.value;
        if (currentCount > 0) {
          this.unreadCountSub.next(currentCount - 1);
        }
      })
    );
  }

  /**
   * Mark all unread notifications as read.
   */
  markAllAsRead(): Observable<any> {
    return this.http.post(`${this.apiUrl}/read-all`, {}).pipe(
      tap(() => this.unreadCountSub.next(0))
    );
  }

  /**
   * Delete an individual notification.
   */
  deleteNotification(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }

  /**
   * Mark multiple selected notifications as read.
   */
  bulkRead(ids: string[]): Observable<any> {
    return this.http.post(`${this.apiUrl}/bulk-read`, { ids });
  }

  /**
   * Delete multiple selected notifications.
   */
  bulkDelete(ids: string[]): Observable<any> {
    return this.http.post(`${this.apiUrl}/bulk-delete`, { ids });
  }

  /**
   * Clear all read notifications for current admin.
   */
  clearRead(): Observable<any> {
    return this.http.delete(`${this.apiUrl}/clear-read`);
  }

  /**
   * Clear all notifications for current admin.
   */
  clearAll(): Observable<any> {
    return this.http.delete(`${this.apiUrl}/clear-all`).pipe(
      tap(() => this.unreadCountSub.next(0))
    );
  }
}
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
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

@Injectable({ providedIn: 'root' })
export class AdminNotificationService {
  private apiUrl = `${environment.apiUrl}/admin/notifications`;
  
  private unreadCountSub = new BehaviorSubject<number>(0);
  unreadCount$ = this.unreadCountSub.asObservable();

  constructor(private http: HttpClient) {}

  getNotifications(): Observable<{ unread_count: number; notifications: AppNotification[] }> {
    return this.http.get<any>(this.apiUrl).pipe(
      tap(res => this.unreadCountSub.next(res.unread_count))
    );
  }

  markAsRead(id: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/${id}/read`, {}).pipe(
      tap(() => {
        const currentCount = this.unreadCountSub.value;
        if (currentCount > 0) this.unreadCountSub.next(currentCount - 1);
      })
    );
  }

  markAllAsRead(): Observable<any> {
    return this.http.post(`${this.apiUrl}/read-all`, {}).pipe(
      tap(() => this.unreadCountSub.next(0))
    );
  }

  clearAll(): Observable<any> {
    return this.http.delete(`${this.apiUrl}/clear-all`).pipe(
      tap(() => this.unreadCountSub.next(0))
    );
  }
}
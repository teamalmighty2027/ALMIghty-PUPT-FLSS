import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { environment } from '../../../../../environments/environment.dev';

export interface AuditEntry {
  id: number;
  date_time: string;
  faculty_name: string;
  action_type: 'UPDATED' | 'ADDED' | 'DELETED';
  component: string;
  changes_summary: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuditLogService {
  private baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getAuditLogs(): Observable<AuditEntry[]> {
    const mockData: AuditEntry[] = [
      { id: 1, date_time: 'Jan 03, 09:15 AM', faculty_name: 'Marissa Ferrer', action_type: 'UPDATED', component: 'Room 302', changes_summary: 'Changed capacity from 30 -> 45' },
      { id: 2, date_time: 'Jan 03, 08:30 AM', faculty_name: 'Harper Diaz', action_type: 'ADDED', component: 'Faculty', changes_summary: 'Added "Something" to her preference.' },
      { id: 3, date_time: 'Jan 02, 04:00 PM', faculty_name: 'Marissa Ferrer', action_type: 'DELETED', component: 'Schedule', changes_summary: 'Removed "Math 101" from Monday.' }
    ];
    // Switch to this.http.get<AuditEntry[]>(`${this.baseUrl}/audit-logs`) when the API is ready
    return of(mockData);
  }
}
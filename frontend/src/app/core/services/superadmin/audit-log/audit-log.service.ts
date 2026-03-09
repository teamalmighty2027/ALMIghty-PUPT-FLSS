import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../../environments/environment.dev';

export interface AuditEntry {
  id: number;
  date_time: string;
  role: string;
  user: string;
  action_type: 'login' | 'logout' | 'create' | 'update' | 'delete' | 'view';
  changes_summary: string;
  faculty_name?: string;
  model?: string;
  model_id?: number;
  old_values?: any;
  new_values?: any;
  metadata?: any;
  ip_address?: string;
  user_agent?: string;
  url?: string;
  description?: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuditLogService {
  private baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getAuditLogs(): Observable<AuditEntry[]> {
    return this.http.get<any[]>(`${this.baseUrl}/audit-logs`).pipe(
      map(logs => logs.map(log => this.transformLog(log)))
    );
  }

  private transformLog(log: any): AuditEntry {
    return {
      id: log.id,
      date_time: this.formatDateTime(log.created_at),
      role: this.formatRole(log.user_type),
      user: log.user_name || log.user_email || 'System',
      action_type: log.action,
      changes_summary: log.description || `${log.action.toUpperCase()} ${log.model || 'record'}`,
      model: log.model,
      model_id: log.model_id,
      old_values: log.old_values,
      new_values: log.new_values,
      metadata: log.metadata,
      ip_address: log.ip_address,
      user_agent: log.user_agent,
      url: log.url,
      description: log.description,
    };
  }

  private formatDateTime(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true 
    });
  }

  private formatRole(userType: string | null): string {
    if (!userType) return 'System';
    const roleMap: { [key: string]: string } = {
      'super_admin': 'Super Admin',
      'superadmin': 'Super Admin',
      'admin': 'Admin',
      'faculty': 'Faculty',
      'user': 'Super Admin'
    };
    return roleMap[userType.toLowerCase()] || userType;
  }
}
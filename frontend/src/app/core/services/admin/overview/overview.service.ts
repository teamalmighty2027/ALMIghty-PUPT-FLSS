import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../../environments/environment.dev';

export interface RequestNotification {
  faculty_id: number;
  faculty_name: string;
  request_type?: 'preference' | 'appeal';
  appeal_start_date?: string | null;
  appeal_end_date?: string | null;
}

export interface OverviewDetails {
  global_start_date: null;
  activeAcademicYear: string;
  activeSemester: string;
  isMismatchedSemester?: boolean;
  activeFacultyCount: number;
  activeProgramsCount: number;
  activeCurricula: Array<{
    curriculum_id: number;
    curriculum_year: string;
  }>;
  preferencesProgress: number;
  schedulingProgress: number;
  roomUtilization: number;
  publishProgress: number;
  preferencesSubmissionEnabled: boolean;
  facultyWithSchedulesCount: number;
  global_deadline: string | null;
}

@Injectable({
  providedIn: 'root',
})
export class OverviewService {
  private baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getOverviewDetails(): Observable<OverviewDetails> {
    return this.http.get<OverviewDetails>(
      `${this.baseUrl}/reports/overview`
    );
  }

  getRequestNotifications(): Observable<RequestNotification[]> {
    return this.http.get<RequestNotification[]>(
      `${this.baseUrl}/notifications/requests`
    );
  }
}

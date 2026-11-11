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
  active_semester_id?: number;
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
  facultyWithPreferencesCount?: number;
  global_deadline: string | null;
}

export interface BreakdownCourse {
  course_id: number;
  course_code: string;
  course_title: string;
}

export interface GeneralEducationBreakdown {
  category_name: string;
  category_code: string;
  total_subjects_offered: number;
  subjects_with_preferences: number;
  subject_coverage_percentage: number;
  preference_submissions_count: number;
  preference_share_percentage: number;
  unassigned_courses: BreakdownCourse[];
  assigned_courses: BreakdownCourse[];
}

export interface ProgramBreakdown {
  program_id: number;
  program_code: string;
  program_title: string;
  total_subjects_offered: number;
  subjects_with_preferences: number;
  subject_coverage_percentage: number;
  preference_submissions_count: number;
  preference_share_percentage: number;
  unassigned_courses: BreakdownCourse[];
  assigned_courses: BreakdownCourse[];
}

export interface PreferencesBreakdownResponse {
  academic_year: string;
  semester: string;
  total_active_faculty?: number;
  total_faculty_submitted?: number;
  faculty_submission_percentage?: number;
  total_preferences_submitted: number;
  total_subjects_offered: number;
  total_subjects_with_preferences: number;
  overall_subject_coverage_percentage: number;
  general_education: GeneralEducationBreakdown;
  programs: ProgramBreakdown[];
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

  /**
   * Fetches preferences breakdown by degree program and General Education.
   * @param activeSemesterId Optional semester identifier
   */
  getPreferencesBreakdown(
    activeSemesterId?: number | null
  ): Observable<PreferencesBreakdownResponse> {
    const hasSemester =
      typeof activeSemesterId === 'number' && activeSemesterId > 0;
    const params = hasSemester
      ? `?active_semester_id=${activeSemesterId}`
      : '';
    return this.http.get<PreferencesBreakdownResponse>(
      `${this.baseUrl}/reports/overview/preferences-breakdown${params}`
    );
  }
}

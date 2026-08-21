import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';

import { Observable, throwError } from 'rxjs';
import { catchError, shareReplay } from 'rxjs/operators';

import { environment } from '../../../../../environments/environment.dev';

export interface FacultyNotificationResponse {
  academic_year: string;
  semester: string;
  faculty_status: {
    preferences_enabled: boolean;
    schedule_published: boolean;
    preferences_deadline: string | null;
    preferences_start: string | null;
    appeal_enabled: boolean;
    appeal_end_date: string | null;
  };
}

@Injectable({
  providedIn: 'root',
})
export class FacultyNotificationService {
  private baseUrl = environment.apiUrl;
  private notificationsCache: {
    [facultyId: number]: Observable<FacultyNotificationResponse>;
  } = {};

  constructor(private http: HttpClient) {}

  /**
   * Fetch notifications and status for the faculty.
   * @param facultyId - The ID of the faculty member
   */
  getFacultyNotifications(
    facultyId: number,
  ): Observable<FacultyNotificationResponse> {
    // Fetch notifications fresh from the database without local caching
    return this.http
      .get<FacultyNotificationResponse>(
        `${this.baseUrl}/faculty/notifications`,
        { params: { faculty_id: facultyId.toString() } },
      )
      .pipe(catchError(this.handleError));
  }

  /**
   * Clears the notifications cache for a specific faculty or all faculties
   * @param facultyId - Optional faculty ID to clear specific cache
   */
  clearCache(facultyId?: number): void {
    if (facultyId) {
      delete this.notificationsCache[facultyId];
    } else {
      this.notificationsCache = {};
    }
  }

  /**
   * Handle HTTP errors.
   * @param error - The HTTP error response.
   */
  private handleError(error: HttpErrorResponse) {
    let errorMessage = 'Unknown error!';
    if (error.error instanceof ErrorEvent) {
      errorMessage = `Error: ${error.error.message}`;
    } else {
      errorMessage = `Error Code: ${error.status}\nMessage: ${error.message}`;
    }
    return throwError(() => new Error(errorMessage));
  }
}

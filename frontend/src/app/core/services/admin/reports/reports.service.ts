import { Injectable } from '@angular/core';
import { 
  HttpClient, 
  HttpErrorResponse, 
  HttpParams 
} from '@angular/common/http';

import { Observable, throwError, BehaviorSubject } from 'rxjs';
import { catchError, shareReplay } from 'rxjs/operators';

import { environment } from '../../../../../environments/environment.dev';

@Injectable({
  providedIn: 'root',
})
export class ReportsService {
  private baseUrl = environment.apiUrl;

  // State management for the selected term
  private selectedTermSource = new BehaviorSubject<number | null>(null);
  selectedTerm$ = this.selectedTermSource.asObservable();

  // Cache structure uses dictionaries to cache data per term
  private cache: {
    facultySchedulesReport: { [termId: string]: Observable<any> };
    roomSchedulesReport: { [termId: string]: Observable<any> };
    programSchedulesReport: { [termId: string]: Observable<any> };
    singleFacultySchedule: { [facultyId: number]: Observable<any> };
    academicYearsHistory$: Observable<any[]> | null;
    facultyAcademicYearsHistory: { [facultyId: number]: Observable<any[]> };
  } = {
    facultySchedulesReport: {},
    roomSchedulesReport: {},
    programSchedulesReport: {},
    singleFacultySchedule: {},
    academicYearsHistory$: null,
    facultyAcademicYearsHistory: {},
  };

  /**
   * Creates the ReportsService.
   * @param http - Angular HttpClient used for HTTP requests.
   */
  constructor(private http: HttpClient) {}

  /**
   * Set the currently selected term id in the service state.
   * @param termId - The id of the selected term, or null to unset.
   */
  setSelectedTerm(termId: number | null) {
    this.selectedTermSource.next(termId);
  }

  /**
   * Get the currently selected term id from the service state.
   * @returns The selected term id or null if none is selected.
   */
  getSelectedTerm(): number | null {
    return this.selectedTermSource.value;
  }

  /**
   * Fetch all academic terms for populating dropdowns.
   * @returns An observable resolving to an array of term objects.
   */
  getAllTermsForDropdown(): Observable<any[]> {
    return this.http
      .get<any[]>(`${this.baseUrl}/reports/terms`)
      .pipe(catchError(this.handleError));
  }

  /**
   * Get the faculty schedules report for a given term, with caching.
   * @param termId - Optional term id to filter by; use null for default.
   * @returns An observable resolving to the faculty schedules report.
   */
  getFacultySchedulesReport(termId: number | null = null): Observable<any> {
    const cacheKey = termId ? termId.toString() : 'default';

    if (!this.cache.facultySchedulesReport[cacheKey]) {
      const url = `${this.baseUrl}/faculty-schedules-report`;
      let params = new HttpParams();
      if (termId) params = params.set('active_semester_id', termId.toString());

      this.cache.facultySchedulesReport[cacheKey] = this.http
        .get(url, { params })
        .pipe(shareReplay(1), catchError(this.handleError));
    }
    return this.cache.facultySchedulesReport[cacheKey];
  }

  /**
   * Get the room schedules report for a given term, with caching.
   * @param termId - Optional term id to filter by; use null for default.
   * @returns An observable resolving to the room schedules report.
   */
  getRoomSchedulesReport(termId: number | null = null): Observable<any> {
    const cacheKey = termId ? termId.toString() : 'default';

    if (!this.cache.roomSchedulesReport[cacheKey]) {
      const url = `${this.baseUrl}/room-schedules-report`;
      let params = new HttpParams();
      if (termId) params = params.set('active_semester_id', termId.toString());

      this.cache.roomSchedulesReport[cacheKey] = this.http
        .get(url, { params })
        .pipe(shareReplay(1), catchError(this.handleError));
    }
    return this.cache.roomSchedulesReport[cacheKey];
  }

  /**
   * Get the program schedules report for a given term, with caching.
   * @param termId - Optional term id to filter by; use null for default.
   * @returns An observable resolving to the program schedules report.
   */
  getProgramSchedulesReport(termId: number | null = null): Observable<any> {
    const cacheKey = termId ? termId.toString() : 'default';

    if (!this.cache.programSchedulesReport[cacheKey]) {
      const url = `${this.baseUrl}/program-schedules-report`;
      let params = new HttpParams();
      if (termId) params = params.set('active_semester_id', termId.toString());

      this.cache.programSchedulesReport[cacheKey] = this.http
        .get(url, { params })
        .pipe(shareReplay(1), catchError(this.handleError));
    }
    return this.cache.programSchedulesReport[cacheKey];
  }

  /**
   * Get the schedule for a single faculty member, cached by faculty id.
   * @param faculty_id - The id of the faculty whose schedule to fetch.
   * @returns An observable resolving to the faculty's schedule.
   */
  getSingleFacultySchedule(faculty_id: number): Observable<any> {
    if (!this.cache.singleFacultySchedule[faculty_id]) {
      const url = `${this.baseUrl}/single-faculty-schedule/${faculty_id}`;
      this.cache.singleFacultySchedule[faculty_id] = this.http
        .get(url)
        .pipe(shareReplay(1), catchError(this.handleError));
    }
    return this.cache.singleFacultySchedule[faculty_id];
  }

  /**
   * Fetch the schedule history for a faculty for a specific semester.
   * @param facultyId - The id of the faculty member.
   * @param activeSemesterId - The semester id to filter history by.
   * @returns An observable resolving to the schedule history data.
   */
  getFacultyScheduleHistory(
    facultyId: number, 
    activeSemesterId: number
  ): Observable<any> {
    const url = `${this.baseUrl}/faculty-schedule-history/${facultyId}`;
    const params = { active_semester_id: activeSemesterId.toString() };
    return this.http.get(url, { params }).pipe(catchError(this.handleError));
  }

  /**
   * Get the academic years history for a faculty, cached by faculty id.
   * @param faculty_id - The id of the faculty whose years history to fetch.
   * @returns An observable resolving to an array of academic years.
   */
  getFacultyAcademicYearsHistory(faculty_id: number): Observable<any[]> {
    if (!this.cache.facultyAcademicYearsHistory[faculty_id]) {
      const url = `${this.baseUrl}/faculty-academic-years-history/${faculty_id}`;
      this.cache.facultyAcademicYearsHistory[faculty_id] = this.http
        .get<any[]>(url)
        .pipe(shareReplay(1), catchError(this.handleError));
    }
    return this.cache.facultyAcademicYearsHistory[faculty_id];
  }

  /**
   * Toggle the published state for all schedules.
   * @param is_published - Numeric flag indicating published (1) or not (0).
   * @returns An observable resolving to the toggle result.
   */
  togglePublishAllSchedules(is_published: number): Observable<any> {
    return this.http
      .post(`${this.baseUrl}/toggle-all-schedule`, { is_published })
      .pipe(catchError(this.handleError));
  }

  /**
   * Trigger sending schedule emails to all faculty.
   * @returns An observable resolving when the email job is queued/sent.
   */
  sendAllSchedulesEmail(): Observable<any> {
    return this.http
      .post(`${this.baseUrl}/email-all-faculty-schedule`, {})
      .pipe(catchError(this.handleError));
  }

  /**
   * Toggle the published state for a single faculty's schedule.
   * @param faculty_id - The id of the faculty to update.
   * @param is_published - Numeric flag indicating published (1) or not (0).
   * @returns An observable resolving to the toggle result.
   */
  togglePublishSingleSchedule(
    faculty_id: number, 
    is_published: number
  ): Observable<any> {
    return this.http
      .post(`${this.baseUrl}/toggle-single-schedule`, { faculty_id, is_published })
      .pipe(catchError(this.handleError));
  }

  /**
   * Send the schedule email to a single faculty member.
   * @param faculty_id - The id of the faculty to email.
   * @returns An observable resolving when the email job is queued/sent.
   */
  sendSingleFacultyScheduleEmail(faculty_id: number): Observable<any> {
    return this.http
      .post(`${this.baseUrl}/email-single-faculty-schedule`, { faculty_id })
      .pipe(catchError(this.handleError));
  }

  /**
   * Clear specific cached report data.
   * @param cacheType - Which cache to clear ('faculty'|'room'|'program'|'singleFaculty'|
   *                    'academicYears'|'facultyAcademicYears').
   * @param faculty_id - Optional faculty id used when clearing per-faculty caches.
   */
  clearCache(
    cacheType: 'faculty' | 
        'room' | 
        'program' | 
        'singleFaculty' | 
        'academicYears' | 
        'facultyAcademicYears',
    faculty_id?: number
  ): void {
    switch (cacheType) {
      case 'faculty': this.cache.facultySchedulesReport = {}; break;
      case 'room': this.cache.roomSchedulesReport = {}; break;
      case 'program': this.cache.programSchedulesReport = {}; break;
      case 'singleFaculty': if (faculty_id) delete this.cache.singleFacultySchedule[faculty_id]; break;
      case 'academicYears': this.cache.academicYearsHistory$ = null; break;
      case 'facultyAcademicYears': if (faculty_id) delete this.cache.facultyAcademicYearsHistory[faculty_id]; break;
    }
  }

  /**
   * Clear all caches maintained by the service.
   */
  clearAllCaches(): void {
    this.cache.facultySchedulesReport = {};
    this.cache.roomSchedulesReport = {};
    this.cache.programSchedulesReport = {};
    this.cache.singleFacultySchedule = {};
    this.cache.academicYearsHistory$ = null;
    this.cache.facultyAcademicYearsHistory = {};
  }

  /**
   * Centralized HTTP error handler that logs and returns a user-friendly error.
   * @param error - The HttpErrorResponse received from HttpClient.
   * @returns An observable that errors with a generic Error object.
   */
  private handleError(error: HttpErrorResponse) {
    console.error('An error occurred:', error);
    return throwError(() => new Error(
      'Something went wrong. Please try again later.'
    ));
  }
}
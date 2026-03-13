import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';

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

  constructor(private http: HttpClient) {}

  setSelectedTerm(termId: number | null) {
    this.selectedTermSource.next(termId);
  }

  getAllTermsForDropdown(): Observable<any[]> {
    return this.http
      .get<any[]>(`${this.baseUrl}/reports/terms`)
      .pipe(catchError(this.handleError));
  }

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

  getSingleFacultySchedule(faculty_id: number): Observable<any> {
    if (!this.cache.singleFacultySchedule[faculty_id]) {
      const url = `${this.baseUrl}/single-faculty-schedule/${faculty_id}`;
      this.cache.singleFacultySchedule[faculty_id] = this.http
        .get(url)
        .pipe(shareReplay(1), catchError(this.handleError));
    }
    return this.cache.singleFacultySchedule[faculty_id];
  }

  getFacultyScheduleHistory(facultyId: number, activeSemesterId: number): Observable<any> {
    const url = `${this.baseUrl}/faculty-schedule-history/${facultyId}`;
    const params = { active_semester_id: activeSemesterId.toString() };
    return this.http.get(url, { params }).pipe(catchError(this.handleError));
  }

  getFacultyAcademicYearsHistory(faculty_id: number): Observable<any[]> {
    if (!this.cache.facultyAcademicYearsHistory[faculty_id]) {
      const url = `${this.baseUrl}/faculty-academic-years-history/${faculty_id}`;
      this.cache.facultyAcademicYearsHistory[faculty_id] = this.http
        .get<any[]>(url)
        .pipe(shareReplay(1), catchError(this.handleError));
    }
    return this.cache.facultyAcademicYearsHistory[faculty_id];
  }

  togglePublishAllSchedules(is_published: number): Observable<any> {
    return this.http
      .post(`${this.baseUrl}/toggle-all-schedule`, { is_published })
      .pipe(catchError(this.handleError));
  }

  sendAllSchedulesEmail(): Observable<any> {
    return this.http
      .post(`${this.baseUrl}/email-all-faculty-schedule`, {})
      .pipe(catchError(this.handleError));
  }

  togglePublishSingleSchedule(faculty_id: number, is_published: number): Observable<any> {
    return this.http
      .post(`${this.baseUrl}/toggle-single-schedule`, { faculty_id, is_published })
      .pipe(catchError(this.handleError));
  }

  sendSingleFacultyScheduleEmail(faculty_id: number): Observable<any> {
    return this.http
      .post(`${this.baseUrl}/email-single-faculty-schedule`, { faculty_id })
      .pipe(catchError(this.handleError));
  }

  clearCache(
    cacheType: 'faculty' | 'room' | 'program' | 'singleFaculty' | 'academicYears' | 'facultyAcademicYears',
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

  clearAllCaches(): void {
    this.cache.facultySchedulesReport = {};
    this.cache.roomSchedulesReport = {};
    this.cache.programSchedulesReport = {};
    this.cache.singleFacultySchedule = {};
    this.cache.academicYearsHistory$ = null;
    this.cache.facultyAcademicYearsHistory = {};
  }

  private handleError(error: HttpErrorResponse) {
    console.error('An error occurred:', error);
    return throwError(() => new Error('Something went wrong. Please try again later.'));
  }
}
import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';

import { Observable, throwError, forkJoin } from 'rxjs';
import { catchError, map, shareReplay, tap } from 'rxjs/operators';

import { ScheduleValidationService } from './schedule-validation.service';
import {
  Schedule,
  PopulateSchedulesResponse,
  Room,
  Faculty,
  SubmittedPrefResponse,
  CourseCatalogItem,
  TemporaryCourseOfferingPayload,
} from '../../../models/scheduling.model';

import { environment } from '../../../../../environments/environment.dev';

export enum CacheType {
  Rooms = 'rooms',
  Faculty = 'faculty',
  Schedules = 'schedules',
  Preferences = 'preferences',
  SelectedProgram = 'selectedProgram',
}

@Injectable({
  providedIn: 'root',
})
export class SchedulingService {
  private baseUrl = environment.apiUrl;

  private roomsCache$?: Observable<{ rooms: Room[] }>;
  private facultyCache$?: Observable<{ faculty: Faculty[] }>;
  private schedulesCache$?: Observable<PopulateSchedulesResponse>;
  private submittedPreferences$?: Observable<SubmittedPrefResponse>;

  constructor(
    private http: HttpClient,
    private scheduleValidationService: ScheduleValidationService
  ) {}

  /**
   * Saves the selected program to localStorage.
   */
  setSelectedProgram(program: { display: string; id: number }): void {
    localStorage.setItem('scheduling_selected_program', JSON.stringify(program));
  }

  /**
   * Retrieves the cached selected program from localStorage.
   */
  getSelectedProgram(): { display: string; id: number } | null {
    const cached = localStorage.getItem('scheduling_selected_program');
    return cached ? JSON.parse(cached) : null;
  }

  /**
   * Clears the selected program from localStorage.
   */
  clearSelectedProgram(): void {
    localStorage.removeItem('scheduling_selected_program');
  }

  /**
   * Retrieves the sections for a given program and year.
   */
  getSections(program: string, year: number): Observable<string[]> {
    return this.http
      .get<string[]>(
        `${this.baseUrl}/programs/${program}/year/${year}/sections`
      )
      .pipe(catchError(this.handleError));
  }

  /**
   * Retrieves the active year levels and their associated curricula.
   */
  getActiveYearLevelsCurricula(): Observable<any[]> {
    return this.http
      .get<any[]>(`${this.baseUrl}/active-year-levels-curricula`)
      .pipe(catchError(this.handleError));
  }

  /**
   * Retrieves and caches all schedules. 
   * Subsequent calls return the cached data unless reset.
   */
  populateSchedules(): Observable<PopulateSchedulesResponse> {
    if (!this.schedulesCache$) {
      this.schedulesCache$ = this.http
        .get<PopulateSchedulesResponse>(`${this.baseUrl}/populate-schedules`)
        .pipe(shareReplay(1), catchError(this.handleError));
    }
    return this.schedulesCache$;
  }

  /**
   * Retrieves the full course catalog for selection.
   */
  getCourses(): Observable<CourseCatalogItem[]> {
    return this.http
      .get<CourseCatalogItem[]>(`${this.baseUrl}/courses`)
      .pipe(catchError(this.handleError));
  }

  /**
   * Retrieves courses for a program across all semesters in the active academic year.
   */
  getProgramCourses(programId: number): Observable<CourseCatalogItem[]> {
    const params = new HttpParams().set('program_id', programId.toString());
    return this.http
      .get<CourseCatalogItem[]>(`${this.baseUrl}/program-courses`, { params })
      .pipe(catchError(this.handleError));
  }

  /**
   * Creates a temporary course offering for the active term.
   */
  createTemporaryCourseOffering(
    payload: TemporaryCourseOfferingPayload
  ): Observable<any> {
    const formData = new FormData();
    formData.append('course_id', payload.course_id.toString());
    formData.append('academic_year_id', payload.academic_year_id.toString());
    formData.append('semester_id', payload.semester_id.toString());
    formData.append('program_id', payload.program_id.toString());
    formData.append('year_level', payload.year_level.toString());
    formData.append(
      'applies_to_all_sections',
      payload.applies_to_all_sections ? '1' : '0'
    );
    formData.append('type', payload.type);

    if (
      payload.section_per_program_year_id !== undefined &&
      payload.section_per_program_year_id !== null
    ) {
      formData.append(
        'section_per_program_year_id',
        payload.section_per_program_year_id.toString()
      );
    }

    if (payload.min_petitioners !== undefined && payload.min_petitioners !== null) {
      formData.append('min_petitioners', payload.min_petitioners.toString());
    }

    if (
      payload.petitioners_count !== undefined &&
      payload.petitioners_count !== null
    ) {
      formData.append('petitioners_count', payload.petitioners_count.toString());
    }

    if (payload.petition_file) {
      formData.append('petition_file', payload.petition_file);
    }

    return this.http
      .post(`${this.baseUrl}/temporary-course-offerings`, formData)
      .pipe(
        tap(() => this.resetCaches([CacheType.Schedules])),
        catchError(this.handleError)
      );
  }

  /**
   * Archives a temporary course offering.
   */
  archiveTemporaryCourseOffering(
    offeringId: number,
    isArchived: boolean = true
  ): Observable<any> {
    return this.http
      .patch(`${this.baseUrl}/temporary-course-offerings/${offeringId}/archive`, {
        is_archived: isArchived,
      })
      .pipe(
        tap(() => this.resetCaches([CacheType.Schedules])),
        catchError(this.handleError)
      );
  }

  /**
   * Retrieves and caches all available rooms. 
   * Subsequent calls return the cached data unless reset.
   */
  getAllRooms(): Observable<{ rooms: Room[] }> {
    if (!this.roomsCache$) {
      this.roomsCache$ = this.http
        .get<{ rooms: Room[] }>(`${this.baseUrl}/get-available-rooms`)
        .pipe(shareReplay(1), catchError(this.handleError));
    }
    return this.roomsCache$;
  }

  /**
   * Retrieves and caches details of all active faculty members.
   * Subsequent calls return the cached data unless reset.
   */
  getFacultyDetails(): Observable<{ faculty: Faculty[] }> {
    if (!this.facultyCache$) {
      this.facultyCache$ = this.http
        .get<{ faculty: Faculty[] }>(`${this.baseUrl}/get-active-faculty`)
        .pipe(shareReplay(1), catchError(this.handleError));
    }
    return this.facultyCache$;
  }

  /**
   * Retrieves and caches submitted preferences for the active semester.
   * Subsequent calls return the cached data unless forced to refresh.
   * @param forceRefresh A boolean indicating whether to 
   * force a refresh of the cached data. Defaults to false.
   */
  getSubmittedPreferencesForActiveSemester(
    forceRefresh: boolean = false
  ): Observable<SubmittedPrefResponse> {
    if (forceRefresh || !this.submittedPreferences$) {
      this.submittedPreferences$ = this.http
        .get<SubmittedPrefResponse>(`${this.baseUrl}/get-all-preferences`)
        .pipe(
          shareReplay(1),
          catchError((error) => {
            this.submittedPreferences$ = undefined;
            return this.handleError(error);
          })
        );
    }
    return this.submittedPreferences$;
  }

  /**
   * Assigns a schedule to a faculty, room, day, and time.
   */
  assignSchedule(
    schedule_id: number,
    faculty_id: number | null,
    room_id: number | null,
    day: string | null,
    start_time: string | null,
    end_time: string | null,
    program_id: number,
    year_level: number,
    section_id: number
  ): Observable<any> {
    const payload = {
      schedule_id,
      faculty_id,
      room_id,
      day,
      start_time,
      end_time,
    };
    return this.http.post<any>(`${this.baseUrl}/assign-schedule`, payload).pipe(
      tap(() => this.resetCaches([CacheType.Schedules])),
      catchError(this.handleError)
    );
  }

  /**
   * Duplicates a course.
   */
  duplicateCourse(element: Schedule): Observable<{ course: Schedule }> {
    return this.http
      .post<{ course: Schedule }>(`${this.baseUrl}/duplicate-course`, {
        section_course_id: element.section_course_id,
      })
      .pipe(
        tap(() => this.resetCaches([CacheType.Schedules])),
        catchError(this.handleError)
      );
  }

  /**
   * Removes a duplicated course.
   */
  removeDuplicateCourse(section_course_id: number): Observable<any> {
    return this.http
      .delete(`${this.baseUrl}/remove-duplicate-course`, {
        body: { section_course_id },
      })
      .pipe(catchError(this.handleError));
  }

  /**
   * Checks for schedule conflicts based on provided parameters.
   */
  checkForScheduleConflicts(
    schedule_id: number,
    program_id: number,
    year_level: number,
    day: string,
    start_time: string,
    end_time: string,
    section_id: number,
    faculty_id: number | null,
    room_id: number | null
  ): Observable<{ hasConflicts: boolean; messages: string[] }> {
    return forkJoin([this.populateSchedules(), this.getAllRooms()]).pipe(
      map(([schedules, rooms]) => {
        return this.scheduleValidationService.validateScheduleConflicts(
          schedules,
          rooms,
          {
            schedule_id,
            program_id,
            year_level,
            day,
            start_time,
            end_time,
            section_id,
            faculty_id,
            room_id,
          }
        );
      }),
      catchError(() => {
        return throwError(
          () => new Error('An error occurred during conflict detection.')
        );
      })
    );
  }

  /**
   * Handles HTTP errors; returns an observable that emits an error notif.
   */
  private handleError(error: HttpErrorResponse): Observable<never> {
    const errorMessage =
      error.error?.message || error.message || 'An unknown error occurred!';
    return throwError(() => new Error(errorMessage));
  }

  /**
   * Resets specified caches to force data refresh on the next request.
   */
  public resetCaches(cacheTypes: CacheType[] = []): void {
    cacheTypes.forEach((type) => {
      switch (type) {
        case CacheType.Rooms:
          this.roomsCache$ = undefined;
          break;
        case CacheType.Faculty:
          this.facultyCache$ = undefined;
          break;
        case CacheType.Schedules:
          this.schedulesCache$ = undefined;
          break;
        case CacheType.Preferences:
          this.submittedPreferences$ = undefined;
          break;
        case CacheType.SelectedProgram:
          this.clearSelectedProgram();
          break;
        default:
          console.warn(`Unknown CacheType: ${type}`);
      }
    });
  }

  /*
  * Creates an Observable that, when subscribed, sends a POST request
  * to fetch AI scheduling suggestions for the given parameters.
  **/
  public getAISuggestion(
    program_id: number,
    year_level: number,
    section_id: number,
    course_id: number
  ): Observable<any> {
    return this.http
      .post<any>(`${this.baseUrl}/ai-suggestion`, { 
        program_id, 
        year_level, 
        section_id,
        course_id
      })
      .pipe(
        // Map backend response to front-end SuggestedFaculty shape
        map(response => {
          if (!response) return null;

          if (response.success === false) {
            return { success: false, message: response.message};
          }

          const facultyId = response.faculty_id ?? null;
          const name = response.faculty_name ?? null;
          const facultyType = response.faculty_type ?? 'Unknown';

          const prefs: { day: string; time: string }[] = [];
          const start = response.preferred_start_time;
          const end = response.preferred_end_time;
          const day = response.preference_day;

          if (day && start && end) {
            const displayStart = this.scheduleValidationService.formatTimeForDisplay(start);
            const displayEnd = this.scheduleValidationService.formatTimeForDisplay(end);
            prefs.push({ day, time: `${displayStart} - ${displayEnd}` });
          }

          return {
            faculty_id: facultyId,
            success: response.success,
            name,
            type: facultyType,
            preferences: prefs,
            prefIndex: 0,
            animating: false
          };
        }),
        catchError(this.handleError)
      );
  }
}

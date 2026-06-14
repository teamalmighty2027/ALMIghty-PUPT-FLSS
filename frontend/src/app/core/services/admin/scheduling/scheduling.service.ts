import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';

import { 
  Observable, throwError, forkJoin, from, of 
} from 'rxjs';

import { 
  catchError, map, shareReplay, tap, switchMap, mergeMap, concatMap, toArray, reduce 
} from 'rxjs/operators';

import { ScheduleSuggestionService } from './schedule-suggestion.service';

import { ScheduleValidationService } from './schedule-validation.service';
import {
  Schedule,
  PopulateSchedulesResponse,
  Room,
  Faculty,
  SubmittedPrefResponse,
  CourseCatalogItem,
  BridgingCourseOption,
  TemporaryCourseOfferingPayload,
  SmartSuggestion,
  Elective,
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
    private scheduleValidationService: ScheduleValidationService,
    private mlService: ScheduleSuggestionService
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
   * Saves the selected year to localStorage.
   */
  setSelectedYear(year: number): void {
    localStorage.setItem('scheduling_selected_year', String(year));
  }

  /**
   * Retrieves the cached selected year from localStorage.
   */
  getSelectedYear(): number | null {
    const cached = localStorage.getItem('scheduling_selected_year');
    return cached ? Number(cached) : null;
  }

  /**
   * Clears the selected year from localStorage.
   */
  clearSelectedYear(): void {
    localStorage.removeItem('scheduling_selected_year');
  }

  /**
   * Saves the selected section to localStorage.
   */
  setSelectedSection(section: string): void {
    localStorage.setItem('scheduling_selected_section', section);
  }

  /**
   * Retrieves the cached selected section from localStorage.
   */
  getSelectedSection(): string | null {
    return localStorage.getItem('scheduling_selected_section');
  }

  /**
   * Clears the selected section from localStorage.
   */
  clearSelectedSection(): void {
    localStorage.removeItem('scheduling_selected_section');
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
  populateSchedules(forceRefresh: boolean = false): Observable<PopulateSchedulesResponse> {
    if (forceRefresh) {
      this.schedulesCache$ = undefined;
    }

    if (!this.schedulesCache$) {
      this.schedulesCache$ = this.http
        .get<PopulateSchedulesResponse>(`${this.baseUrl}/populate-schedules`)
        .pipe(shareReplay(1), catchError(this.handleError));
    }
    return this.schedulesCache$;
  }

  /**
   * Fetch elective variants grouped by slot name.
   */
  getElectives(
    includeInactive: boolean = false
  ): Observable<Record<string, Elective[]>> {
    let params = new HttpParams();

    if (includeInactive) {
      params = params.set('include_inactive', 'true');
    }

    return this.http
      .get<Record<string, Elective[]>>(`${this.baseUrl}/electives`, {
        params,
      })
      .pipe(catchError(this.handleError));
  }

  /**
   * Fetches schedules for a historical (non-active) academic year and semester.
   */
  getHistoricalSchedules(
    academic_year_id: number,
    semester_id: number
  ): Observable<PopulateSchedulesResponse> {
    const params = new HttpParams()
      .set('academic_year_id', academic_year_id.toString())
      .set('semester_id', semester_id.toString());

    return this.http
      .get<PopulateSchedulesResponse>(
        `${this.baseUrl}/schedules/historical`,
        { params }
      )
      .pipe(catchError(this.handleError));
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
   * Retrieves bridging courses for a curriculum/program/year level scope.
   */
  getBridgingCourses(
    curriculumId: number,
    programId: number,
    yearLevelId: number,
    semesterId: number
  ): Observable<BridgingCourseOption[]> {
    const params = new HttpParams()
      .set('curriculum_id', curriculumId.toString())
      .set('program_id', programId.toString())
      .set('year_level_id', yearLevelId.toString())
      .set('semester_id', semesterId.toString());

    return this.http
      .get<BridgingCourseOption[]>(`${this.baseUrl}/bridging-courses`, { params })
      .pipe(catchError(this.handleError));
  }

  /**
   * Combines or un-combines a bridging course with another program.
   * @param bridgingCourseId The ID of the bridging course to combine
   * @param combinedWithProgramId The program ID to combine with, or null
   *                              to un-combine
   * @returns Observable response from the server
   */
  combineBridgingCourses(
    bridgingCourseId: number,
    combinedWithProgramId: number | null
  ): Observable<any> {
    const payload = { combined_with_program_id: combinedWithProgramId };
    return this.http
      .patch(
        `${this.baseUrl}/bridging-courses/${bridgingCourseId}/combine`,
        payload
      )
      .pipe(
        tap(() => this.resetCaches([CacheType.Schedules])),
        catchError(this.handleError)
      );
  }

  /**
   * Creates a temporary course offering for the active term.
   */
  createTemporaryCourseOffering(
    payload: TemporaryCourseOfferingPayload
  ): Observable<any> {
    const formData = new FormData();
    formData.append('course_id', payload.course_id.toString());
    if (payload.bridging_course_id !== undefined && payload.bridging_course_id !== null) {
      formData.append('bridging_course_id', payload.bridging_course_id.toString());
    }
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
    section_id: number,
    elective_id: number | null = null
  ): Observable<any> {
    const payload = {
      schedule_id,
      faculty_id,
      room_id,
      day,
      start_time,
      end_time,
      elective_id,
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
          this.clearSelectedYear();
          this.clearSelectedSection();
          break;
        default:
          console.warn(`Unknown CacheType: ${type}`);
      }
    });
  }

  /*
  * Creates an Observable that, when subscribed, sends a POST request
  * to fetch heuristic scheduling suggestions for the given parameters.
  **/
  public getHeuristicSuggestion(
    program_id: number,
    year_level: number,
    section_id: number,
    course_id: number
  ): Observable<any> {
    return this.http
      .post<any>(`${this.baseUrl}/suggestion-heuristic`, { 
        program_id, 
        year_level, 
        section_id,
        course_id
      })
      .pipe(
        catchError(this.handleError)
      );
  }
  /**
   * Orchestrates the suggestion process: ML first, then backend fallback.
   * @param courseId The ID of the course to find a suggestion for.
   * @param academicYearId The academic year ID.
   * @param semesterId The semester ID.
   * @param activeSemesterId The active semester record ID.
   */
  public getSmartSuggestion(
    courseId: number,
    academicYearId: number,
    semesterId: number,
    activeSemesterId: number,
    programId: number,
    yearLevel: number,
    sectionId: number
  ): Observable<SmartSuggestion> {
    return this.getSubmittedPreferencesForActiveSemester().pipe(
      switchMap(response => {
        const preferences = response.preferences || [];
        const candidates: any[] = [];
        
        preferences.forEach(pref => {
          const activeSem = pref.active_semesters.find(s => 
            s.academic_year_id === academicYearId && 
            s.semester_id === semesterId
          );

          if (activeSem) {
            const coursePref = activeSem.courses.find(c => 
              c.course_details.course_id === courseId
            );

            if (coursePref) {
              coursePref.preferred_days.forEach(dayPref => {
                candidates.push({
                  faculty_id: pref.faculty_id,
                  faculty_name: pref.faculty_name,
                  course_assignment_id: coursePref.course_assignment_id,
                  is_ignored: !!coursePref.is_ignored,
                  day: dayPref.day,
                  start_time: dayPref.start_time,
                  end_time: dayPref.end_time
                });
              });
            }
          }
        });

        if (candidates.length === 0) {
          return this.runBackendFallback(
            programId, 
            yearLevel, 
            sectionId, 
            courseId
          );
        }

        return from(candidates).pipe(
          mergeMap(c => {
            const startMin = this.timeToMinutes(c.start_time);
            const endMin = this.timeToMinutes(c.end_time);

            return this.mlService.predict(
              c.faculty_id,
              academicYearId,
              semesterId,
              activeSemesterId,
              c.course_assignment_id,
              0,
              c.is_ignored,
              c.day,
              startMin,
              endMin
            ).pipe(
              map(ml => ({ ...c, ml }))
            );
          }, 4), // Run up to 4 predictions in parallel
          reduce((best: any, current: any) => {
            const currentConfidence = current.ml?.confidence || 0;
            const bestConfidence = best?.ml?.confidence || 0;
            return currentConfidence > bestConfidence ? current : best;
          }, null),
          map(bestMatch => {
            if (bestMatch && bestMatch.ml!.confidence >= 0.6) {
              return {
                faculty_id: bestMatch.faculty_id,
                faculty_name: bestMatch.faculty_name,
                day: bestMatch.day,
                start_time: bestMatch.start_time,
                end_time: bestMatch.end_time,
                confidence: bestMatch.ml!.confidence,
                isMl: true,
                success: true
              } as SmartSuggestion;
            }

            return null;
          }),
          switchMap(mlSuggestion => {
            if (mlSuggestion) return of(mlSuggestion);
            return this.runBackendFallback(
              programId, 
              yearLevel, 
              sectionId, 
              courseId
            );
          })
        );
      }),
      catchError(() => this.runBackendFallback(
        programId, 
        yearLevel, 
        sectionId, 
        courseId
      ))
    );
  }

  private runBackendFallback(
    programId: number, 
    yearLevel: number, 
    sectionId: number, 
    courseId: number
  ): Observable<SmartSuggestion> {
    return this.getHeuristicSuggestion(
      programId, 
      yearLevel, 
      sectionId, 
      courseId
    ).pipe(
      map(res => {
        if (!res || !res.success || !res.faculty_id) {
          return { success: false } as SmartSuggestion;
        }

        return {
          faculty_id: res.faculty_id,
          faculty_name: res.faculty_name,
          day: res.preference_day,
          start_time: res.preferred_start_time,
          end_time: res.preferred_end_time,
          isMl: false,
          success: true
        } as SmartSuggestion;
      })
    );
  }

  /**
   * Converts a 12-hour format time string to total minutes from midnight.
   * @param time The time string (e.g., "08:00 AM").
   * @returns The total minutes as a number.
   */
  private timeToMinutes(time: string): number {
    if (!time) return 0;
    
    const [timeStr, modifier] = time.split(' ');
    let [hours, minutes] = timeStr.split(':').map(Number);
    
    if (modifier === 'PM' && hours < 12) hours += 12;
    if (modifier === 'AM' && hours === 12) hours = 0;
    
    return (hours * 60) + minutes;
  }
}

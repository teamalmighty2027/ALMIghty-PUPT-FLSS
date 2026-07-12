import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';

import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { AcademicYear, YearLevel } from '../../../models/scheduling.model';

import { environment } from '../../../../../environments/environment.dev';

@Injectable({
  providedIn: 'root',
})
export class AcademicYearService {
  private baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  /**
   * Fetches all academic years from the backend.
   */
  getAcademicYears(): Observable<AcademicYear[]> {
    return this.http
      .get<AcademicYear[]>(`${this.baseUrl}/academic-years`)
      .pipe(catchError(this.handleError));
  }

  addAcademicYear(yearStart: string, yearEnd: string): Observable<any> {
    return this.http
      .post<any>(`${this.baseUrl}/academic-years`, {
        year_start: yearStart,
        year_end: yearEnd,
      })
      .pipe(
        catchError((error: HttpErrorResponse) => {
          let errorMessage = 'An unexpected error occurred.';

          if (error.error && error.error.message) {
            errorMessage = error.error.message;
          }

          if (error.status === 422) {
            errorMessage = error.error.message;
          }

          return throwError(() => new Error(errorMessage));
        })
      );
  }

  deleteAcademicYear(academicYearId: number): Observable<any> {
    return this.http
      .delete<any>(`${this.baseUrl}/academic-years/${academicYearId}`)
      .pipe(
        catchError((error: HttpErrorResponse) => {
          if (error.error?.status === 'error') {
            return throwError(() => new Error(error.error.message));
          }
          return this.handleError(error);
        })
      );
  }

  updateAcademicYear(academicYearId: number): Observable<any> {
    return this.http
      .put<any>(`${this.baseUrl}/academic-years/${academicYearId}`, {})
      .pipe(
        catchError((error: HttpErrorResponse) => {
          if (error.error?.status === 'error') {
            return throwError(() => new Error(error.error.message));
          }
          return this.handleError(error);
        })
      );
  }

  getActiveYearAndSemester(): Observable<{
    activeYear: string;
    activeSemester: number;
    startDate: string;
    endDate: string;
    facultyViewYear: string;
    facultyViewSemester: number;
  }> {
    return this.http
      .get<{
        activeYear: string;
        activeSemester: number;
        startDate: string;
        endDate: string;
        facultyViewYear: string;
        facultyViewSemester: number;
      }>(`${this.baseUrl}/academic-years/active-semester`)
      .pipe(catchError(this.handleError));
  }

  setFacultyViewSemester(
    academicYearId: number,
    semesterId: number
  ): Observable<void> {
    return this.http
      .post<void>(`${this.baseUrl}/academic-years/faculty-view-semester`, {
        academic_year_id: academicYearId,
        semester_id: semesterId,
      })
      .pipe(catchError(this.handleError));
  }

  setActiveYearAndSemester(
    academicYearId: number,
    semesterId: number,
    startDate: string,
    endDate: string
  ): Observable<void> {
    return this.http
      .post<void>(`${this.baseUrl}/academic-years/active-semester`, {
        academic_year_id: academicYearId,
        semester_id: semesterId,
        start_date: startDate,
        end_date: endDate,
      })
      .pipe(catchError(this.handleError));
  }

  /**
   * Fetches program details, including year levels and curriculum versions, for a specific academic year.
   */
  fetchProgramDetailsByAcademicYear(payload: {
    academic_year_id: number;
  }): Observable<any> {
    return this.http
      .post<any>(
        `${this.baseUrl}/academic-years/${payload.academic_year_id}/program-details`,
        {}
      )
      .pipe(catchError(this.handleError));
  }

  updateYearLevelsCurricula(
    academicYearId: number,
    programId: number,
    yearLevels: YearLevel[]
  ): Observable<any> {
    const payload = {
      program_id: programId,
      year_levels: yearLevels.map((yl) => ({
        year_level: yl.year_level,
        curriculum_id: yl.curriculum_id,
      })),
    };
    return this.http
      .post<any>(
        `${this.baseUrl}/academic-years/${academicYearId}/year-level-curricula`,
        payload
      )
      .pipe(catchError(this.handleError));
  }

  updateSections(
    academicYearId: number,
    programId: number,
    yearLevel: number,
    numberOfSections: number
  ): Observable<any> {
    return this.http
      .post<any>(
        `${this.baseUrl}/academic-years/${academicYearId}/sections`,
        {
          program_id: programId,
          year_level: yearLevel,
          number_of_sections: numberOfSections,
        }
      )
      .pipe(
        catchError((error: HttpErrorResponse) => {
          if (error.error?.status === 'error') {
            return throwError(() => new Error(error.error.message));
          }
          return this.handleError(error);
        })
      );
  }

  removeProgramFromAcademicYear(
    academicYearId: number,
    programId: number
  ): Observable<any> {
    return this.http
      .delete<any>(
        `${this.baseUrl}/academic-years/${academicYearId}/programs/${programId}`
      )
      .pipe(catchError(this.handleError));
  }

  /**
   * Handle HTTP errors.
   * @param error - The HTTP error response.
   */
  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMessage = 'Something went wrong; please try again later.';

    if (error.error?.message) {
      errorMessage = error.error.message;
    } else if (error.message) {
      errorMessage = error.message;
    }
    return throwError(() => new Error(errorMessage));
  }
}

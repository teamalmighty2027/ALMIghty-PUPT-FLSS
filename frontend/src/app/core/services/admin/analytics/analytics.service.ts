import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, throwError, BehaviorSubject } from 'rxjs';
import { catchError, shareReplay } from 'rxjs/operators';
import { environment } from '../../../../../environments/environment.dev';

@Injectable({
  providedIn: 'root',
})
export class AnalyticsService {
  private baseUrl = environment.apiUrl;

  // State management for the selected term (matches Reports pattern)
  private selectedTermSource = new BehaviorSubject<number | null>(null);
  selectedTerm$ = this.selectedTermSource.asObservable();

  // Cache structure to avoid redundant HTTP requests
  private cache: { [endpoint: string]: { [termId: string]: Observable<any> } } = {};

  constructor(private http: HttpClient) {}

  /**
   * Set the selected term ID globally for analytics widgets
   */
  setSelectedTerm(termId: number | null): void {
    this.selectedTermSource.next(termId);
  }

  /**
   * Get the currently selected term ID
   */
  getSelectedTerm(): number | null {
    return this.selectedTermSource.value;
  }

  /**
   * Generic method to fetch analytics data with caching
   */
  private getAnalyticsData(endpoint: string, termId: number | null): Observable<any> {
    const cacheKey = termId ? termId.toString() : 'default';
    
    if (!this.cache[endpoint]) {
      this.cache[endpoint] = {};
    }

    if (!this.cache[endpoint][cacheKey]) {
      const url = `${this.baseUrl}/analytics/${endpoint}`;
      let params = new HttpParams();
      if (termId) {
        params = params.set('active_semester_id', termId.toString());
      }

      this.cache[endpoint][cacheKey] = this.http
        .get(url, { params })
        .pipe(
          shareReplay(1),
          catchError(this.handleError)
        );
    }
    
    return this.cache[endpoint][cacheKey];
  }

  getScheduleHeatmap(termId: number | null): Observable<any> {
    return this.getAnalyticsData('heatmap', termId);
  }

  getRoomUtilization(termId: number | null): Observable<any> {
    return this.getAnalyticsData('room-utilization', termId);
  }

  getFacultyLoadDistribution(termId: number | null): Observable<any> {
    return this.getAnalyticsData('faculty-load', termId);
  }

  getFacultyTypeComposition(): Observable<any> {
    // This one is likely static across terms or global
    return this.getAnalyticsData('faculty-type-composition', null);
  }

  getAppealActivity(termId: number | null): Observable<any> {
    return this.getAnalyticsData('appeal-activity', termId);
  }

  getProgramCoverage(termId: number | null): Observable<any> {
    return this.getAnalyticsData('program-coverage', termId);
  }

  getSemesterTrends(): Observable<any> {
    return this.getAnalyticsData('semester-trends', null);
  }

  getOptimalSlots(termId: number | null): Observable<any> {
    return this.getAnalyticsData('optimal-slots', termId);
  }

  getPreferenceInsights(termId: number | null): Observable<any> {
    return this.getAnalyticsData('preference-insights', termId);
  }

  /**
   * Clear all cached analytics data
   */
  clearAllCaches(): void {
    this.cache = {};
  }

  private handleError(error: HttpErrorResponse) {
    console.error('An error occurred:', error);
    return throwError(() => new Error('Failed to fetch analytics data.'));
  }
}

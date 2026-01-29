import { Injectable } from '@angular/core';
import { environment } from '../../../../../environments/environment.prod';
import { HttpClient } from '@angular/common/http';
import { catchError } from 'rxjs/internal/operators/catchError';
import { throwError } from 'rxjs/internal/observable/throwError';

@Injectable({
  providedIn: 'root'
})
export class ReschedulingService {
  private baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  /** * Submits a rescheduling appeal to the backend API.
   * @param appealData The data related to the rescheduling appeal.
   */
  submitReschedulingAppeal(appealData: any) {
    const url = `${this.baseUrl}/submit-rescheduling-appeal`;

    return this.http.post(url, appealData).pipe(
      catchError((error) => {
        console.error('Error submitting rescheduling appeal:', error);
        return throwError(() => error);
      })
    );
  }
}

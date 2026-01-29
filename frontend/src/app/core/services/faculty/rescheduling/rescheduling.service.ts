import { Injectable } from '@angular/core';
import { environment } from '../../../../../environments/environment.dev';
import { HttpClient } from '@angular/common/http';
import { catchError } from 'rxjs/internal/operators/catchError';
import { throwError } from 'rxjs/internal/observable/throwError';
import { Observable } from 'rxjs/internal/Observable';

@Injectable({
  providedIn: 'root'
})
export class ReschedulingService {
  private baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  /** * Submits a rescheduling appeal to the backend API.
   * @param scheduleId - The ID of the schedule to be rescheduled.
   * @param appealFile - The file containing the appeal document.
   * @param reason - The reason for the rescheduling appeal.
   * @param appealDetails - An object containing the proposed
   *  new schedule details (day, start time, end time, room).
   * @return An Observable representing the HTTP response from the API.
   */
  submitReschedulingAppeal(
    scheduleId: number,
    appealFile: File | null, // TODO: Change to required when file upload is implemented
    reason: string,
    appealDetails: {
      day: string,
      startTime: string,
      endTime: string,
      room: string
    }
  ): Observable<any> {
    const url = `${this.baseUrl}/submit-rescheduling-appeal`;

    // TODO: Create checks for the payload data
    const payload = {
      scheduleId,
      appealFile,
      reason,
      appealDetails
    }

    return this.http.post(url, payload).pipe(
      catchError((error) => {
        console.error('Error submitting rescheduling appeal:', error);
        return throwError(() => error);
      })
    );
  }
}

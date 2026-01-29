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
    appealFile: File | null,
    reason: string,
    appealDetails: {
      day: string,
      startTime: string,
      endTime: string,
      roomCode: string
    }
  ): Observable<any> {
    const url = `${this.baseUrl}/submit-rescheduling-appeal`;

    // TODO: Create checks for the payload data
    const form = new FormData();
    form.append('scheduleId', String(scheduleId));
    if (appealFile) {
      form.append('appealFile', appealFile, appealFile.name);
    }
    form.append('reason', reason);
    form.append('day', appealDetails.day ?? '');
    form.append('startTime', appealDetails.startTime ?? '');
    form.append('endTime', appealDetails.endTime ?? '');
    form.append('roomCode', String(appealDetails.roomCode ?? ''));

    return this.http.post(url, form).pipe(
      catchError((error: any) => {
        return throwError(() => new Error(error));
      })
    );
  }
}

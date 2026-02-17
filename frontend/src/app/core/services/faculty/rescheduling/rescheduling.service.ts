import { Injectable } from '@angular/core';
import { environment } from '../../../../../environments/environment.dev';
import { HttpClient } from '@angular/common/http';
import { catchError } from 'rxjs/internal/operators/catchError';
import { throwError } from 'rxjs/internal/observable/throwError';
import { Observable } from 'rxjs/internal/Observable';

export interface AppealResponse {
  appeal_id: number;
  schedule_id: number;
  faculty_name: string;
  program_code: string;
  course_title: string;
  original_day: string;
  original_start_time: string;
  original_end_time: string;
  original_room: string;
  appeal_day: string;
  appeal_start_time: string;
  appeal_end_time: string;
  appeal_room: string | null;
  file_path: string | null;
  reasoning: string | null;
  is_approved: boolean | null; // null = pending, true = approved, false = denied
  created_at: string;
}

@Injectable({
  providedIn: 'root'
})
export class ReschedulingService {
  private baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  /**
   * Converts "7:00 AM" / "2:30 PM" → "07:00" / "14:30"
   * Laravel validation requires H:i (24-hour, zero-padded).
   */
  private to24Hour(time: string): string {
    if (!time) return '';
    // Already H:i — no conversion needed
    if (!time.includes('AM') && !time.includes('PM')) return time;

    const [timePart, period] = time.trim().split(' ');
    let [hours, minutes] = timePart.split(':').map(Number);

    if (period === 'AM') {
      if (hours === 12) hours = 0;       // 12:xx AM → 00:xx
    } else {
      if (hours !== 12) hours += 12;     // x:xx PM → (x+12):xx, but 12 PM stays 12
    }

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  // ─────────────────────────────────────────────
  //  FACULTY SIDE (existing — unchanged except time conversion)
  // ─────────────────────────────────────────────

  /**
   * Submits a rescheduling appeal to the backend API.
   */
  submitReschedulingAppeal(
    scheduleId: number,
    appealFile: File | null,
    reason: string,
    appealDetails: {
      day: string;
      startTime: string;
      endTime: string;
      roomCode: string;
    }
  ): Observable<any> {
    const url = `${this.baseUrl}/submit-rescheduling-appeal`;

    if (!scheduleId || !reason || !appealDetails) {
      return throwError(() => new Error('Invalid parameters provided.'));
    }

    const form = new FormData();
    form.append('scheduleId', String(scheduleId));
    if (appealFile) {
      form.append('appealFile', appealFile, appealFile.name);
    }
    form.append('reason', reason);
    form.append('day',       appealDetails.day ?? '');
    form.append('startTime', this.to24Hour(appealDetails.startTime));  // ← converted
    form.append('endTime',   this.to24Hour(appealDetails.endTime));    // ← converted
    form.append('roomCode',  String(appealDetails.roomCode ?? ''));

    return this.http.post(url, form).pipe(
      catchError((error: any) => throwError(() => error))
    );
  }

  // ─────────────────────────────────────────────
  //  ADMIN SIDE
  // ─────────────────────────────────────────────

  /**
   * Fetches all rescheduling appeals (admin view).
   * GET /api/rescheduling-appeals
   */
  getAllAppeals(): Observable<AppealResponse[]> {
    return this.http
      .get<AppealResponse[]>(`${this.baseUrl}/rescheduling-appeals`)
      .pipe(catchError((error: any) => throwError(() => error)));
  }

  /**
   * Approves an appeal and assigns the new schedule.
   * POST /api/rescheduling-appeals/{id}/approve
   */
  approveAppeal(
    appealId: number,
    newSchedule: {
      day: string;
      startTime: string;
      endTime: string;
      room: string;
    },
    adminRemarks: string
  ): Observable<any> {
    return this.http
      .post(`${this.baseUrl}/rescheduling-appeals/${appealId}/approve`, {
        day:           newSchedule.day,
        start_time:    this.to24Hour(newSchedule.startTime),  // ← converted
        end_time:      this.to24Hour(newSchedule.endTime),    // ← converted
        room:          newSchedule.room,
        admin_remarks: adminRemarks,
      })
      .pipe(catchError((error: any) => throwError(() => error)));
  }

  /**
   * Denies an appeal.
   * POST /api/rescheduling-appeals/{id}/deny
   */
  denyAppeal(appealId: number, adminRemarks: string): Observable<any> {
    return this.http
      .post(`${this.baseUrl}/rescheduling-appeals/${appealId}/deny`, {
        admin_remarks: adminRemarks,
      })
      .pipe(catchError((error: any) => throwError(() => error)));
  }
}
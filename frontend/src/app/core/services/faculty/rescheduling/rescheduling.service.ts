import { Injectable } from '@angular/core';
import { environment } from '../../../../../environments/environment.dev';
import { HttpClient } from '@angular/common/http';
import { catchError } from 'rxjs/operators';
import { throwError, Observable } from 'rxjs';
import {
  PopulateSchedulesResponse,
  Room,
  ScheduleArrangementOverride,
} from '../../../models/scheduling.model';
import { ScheduleValidationService } from '../../admin/scheduling/schedule-validation.service';

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
  is_approved: 'pending' | 'approved' | 'denied';
  admin_remarks: string | null;
  created_at: string;
}

@Injectable({
  providedIn: 'root'
})
export class ReschedulingService {
  private baseUrl = environment.apiUrl;

  constructor(
    private http: HttpClient,
    private scheduleValidationService: ScheduleValidationService
  ) {}

  private to24Hour(time: string): string {
    if (!time) return '';
    if (!time.includes('AM') && !time.includes('PM')) return time;
    
    const [timePart, period] = time.trim().split(' ');
    let [hours, minutes] = timePart.split(':').map(Number);

    if (period === 'AM') {
      if (hours === 12) hours = 0;
    } else {
      if (hours !== 12) hours += 12;
    }

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  // ── FACULTY — Submit appeal ───────────────────────────────────
  submitReschedulingAppeal(
    scheduleId: number,
    appealFile: File | null,
    reason: string,
    appealDetails: { day: string; startTime: string; endTime: string; roomCode: string; }
  ): Observable<any> {
    const url = `${this.baseUrl}/rescheduling-appeals`;

    if (!scheduleId || !reason || !appealDetails) {
      return throwError(() => new Error('Invalid parameters provided.'));
    }

    const form = new FormData();
    form.append('scheduleId', String(scheduleId));

    if (appealFile) form.append('appealFile', appealFile, appealFile.name);

    form.append('reason',    reason);
    form.append('day',       appealDetails.day ?? '');
    form.append('startTime', this.to24Hour(appealDetails.startTime));
    form.append('endTime',   this.to24Hour(appealDetails.endTime));
    form.append('roomCode',  String(appealDetails.roomCode ?? ''));

    return this.http.post(url, form).pipe(
      catchError((error: any) => throwError(() => error))
    );
  }

  // ── FACULTY — My Appeals ──────────────────────────────────────
  getMyAppeals(): Observable<AppealResponse[]> {
    return this.http
      .get<AppealResponse[]>(`${this.baseUrl}/my-appeals`)
      .pipe(catchError((error: any) => throwError(() => error)));
  }

  cancelAppeal(appealId: number): Observable<any> {
    return this.http
      .delete(`${this.baseUrl}/my-appeals/${appealId}`)
      .pipe(catchError((error: any) => throwError(() => error)));
  }

  // ── ADMIN ─────────────────────────────────────────────────────
  getAllAppeals(): Observable<AppealResponse[]> {
    return this.http
      .get<AppealResponse[]>(`${this.baseUrl}/rescheduling-appeals`)
      .pipe(catchError((error: any) => throwError(() => error)));
  }

  approveAppeal(
    appealId: number,
    newSchedule: { day: string; startTime: string; endTime: string; room: string; },
    adminRemarks: string
  ): Observable<any> {
    return this.http
      .post(`${this.baseUrl}/rescheduling-appeals/${appealId}/approve`, {
        day:           newSchedule.day,
        start_time:    this.to24Hour(newSchedule.startTime),
        end_time:      this.to24Hour(newSchedule.endTime),
        room:          newSchedule.room,
        admin_remarks: adminRemarks,
      })
      .pipe(catchError((error: any) => throwError(() => error)));
  }

  denyAppeal(appealId: number, adminRemarks: string): Observable<any> {
    return this.http
      .post(`${this.baseUrl}/rescheduling-appeals/${appealId}/deny`, {
        admin_remarks: adminRemarks,
      })
      .pipe(catchError((error: any) => throwError(() => error)));
  }

  // ── ADMIN / FACULTY — Appeal Access Toggles & Requests ────────
  rejectAppealAccessRequest(facultyId: string): Observable<any> {
    return this.http
      .post(`${this.baseUrl}/rescheduling-appeals/reject-access`, { faculty_id: facultyId })
      .pipe(catchError((error: any) => throwError(() => error)));
  }

  toggleFacultyAppealAccess(facultyId: number, isEnabled: boolean, activeSemesterId: number): Observable<any> {
    return this.http
      .post(`${this.baseUrl}/rescheduling-appeals/toggle-access`, {
        faculty_id: facultyId,
        is_enabled: isEnabled,
        active_semester_id: activeSemesterId
      })
      .pipe(catchError((error: any) => throwError(() => error)));
  }

  // >>> ADDED MISSING METHODS HERE <<<
  requestAppealAccess(facultyId: string): Observable<any> {
    return this.http
      .post(`${this.baseUrl}/rescheduling-appeals/request-access`, { faculty_id: facultyId })
      .pipe(catchError((error: any) => throwError(() => error)));
  }

  cancelAppealAccessRequest(facultyId: string): Observable<any> {
    return this.http
      .post(`${this.baseUrl}/rescheduling-appeals/cancel-request`, { faculty_id: facultyId })
      .pipe(catchError((error: any) => throwError(() => error)));
  }

  toggleAllFacultyAppealAccess(isEnabled: boolean, activeSemesterId: number): Observable<any> {
    return this.http
      .post(`${this.baseUrl}/rescheduling-appeals/toggle-all-access`, {
        is_enabled: isEnabled,
        active_semester_id: activeSemesterId
      })
      .pipe(catchError((error: any) => throwError(() => error)));
  }

  // ── VALIDATION ────────────────────────────────────────────────
  validateAppealBeforeApproval(
    appealId: number,
    proposedDay: string,
    proposedStartTime: string,
    proposedEndTime: string,
    proposedRoomId: number | null,
    schedules: PopulateSchedulesResponse,
    rooms: { rooms: Room[] },
    arrangements: ScheduleArrangementOverride[],
    scheduleContext: {
      schedule_id: number;
      program_id: number;
      year_level: number;
      section_id: number;
      faculty_id: number | null;
    }
  ): { hasConflicts: boolean; messages: string[] } {
    return this.scheduleValidationService.validateScheduleConflictsWithArrangements(
      schedules,
      rooms,
      arrangements,
      {
        schedule_id: scheduleContext.schedule_id,
        program_id: scheduleContext.program_id,
        year_level: scheduleContext.year_level,
        day: proposedDay,
        start_time: this.to24Hour(proposedStartTime),
        end_time: this.to24Hour(proposedEndTime),
        section_id: scheduleContext.section_id,
        faculty_id: scheduleContext.faculty_id,
        room_id: proposedRoomId,
      }
    );
  }
}
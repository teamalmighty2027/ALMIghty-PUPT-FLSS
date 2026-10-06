import { Injectable } from '@angular/core';
import { environment } from '../../../../../environments/environment.dev';
import { HttpClient } from '@angular/common/http';
import { catchError } from 'rxjs/operators';
import { throwError, Observable, of } from 'rxjs';
import {
  PopulateSchedulesResponse,
  Room,
  ScheduleArrangementOverride,
} from '../../../models/scheduling.model';
import { ScheduleValidationService } from '../../admin/scheduling/schedule-validation.service';

export interface ExtractedSchedule {
  day: string | null;
  startTime: string | null;
  endTime: string | null;
  room: string | null;
  reason: string | null;
}

export interface PreScanResult {
  tempToken: string;
  extracted: ExtractedSchedule;
  aiSummary: string | null;
}

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

  // Safely parses JSON payloads when local PHP notices prepend HTML to responses
  private handleResponseWithPhpNotices(obs: Observable<any>): Observable<any> {
    return obs.pipe(
      catchError((error: any) => {
        if (
          (error?.status === 200 || error?.status === 201) &&
          error?.error?.text &&
          typeof error.error.text === 'string'
        ) {
          const raw = error.error.text;
          const jsonStart = raw.indexOf('{');
          const jsonEnd = raw.lastIndexOf('}');

          if (jsonStart !== -1 && jsonEnd > jsonStart) {
            try {
              const parsed = JSON.parse(raw.substring(jsonStart, jsonEnd + 1));
              return of(parsed);
            } catch (e) {
              // ignore parse error
            }
          }
        }

        return throwError(() => error);
      })
    );
  }

  /** 
   * Pre-scan an appeal document using AI to extract 
   * schedule information and generate a summary.
   */
  preScanAppealDocument(file: File): Observable<PreScanResult> {
    const url = `${this.baseUrl}/rescheduling-appeals/pre-scan`;
    const form = new FormData();
    form.append('appealFile', file, file.name);

    return this.handleResponseWithPhpNotices(this.http.post(url, form));
  }

  /**
   * Cancels a pre-scan operation by sending a DELETE request to the server.
   * @param tempToken 
   * @returns 
   */
  cancelPreScan(tempToken: string): Observable<any> {
    const url = `${this.baseUrl}/rescheduling-appeals/pre-scan`;

    return this.http.delete(url, { body: { tempToken } });
  }

  /**
   * Submits a rescheduling appeal to the server with the provided details.
   * @param scheduleId - The ID of the schedule being appealed.
   * @param appealFile - The appeal document file, if available.
   * @param reason - The reason for the appeal.
   * @param appealDetails - An object containing the proposed schedule details
   * @param forceSubmit - A boolean indicating forcing submission with conflicts.
   * @param tempToken - A temporary token from a pre-scan operation, if applicable.
   * @param aiSummary - An optional AI-generated summary of the appeal document.
   * @returns 
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
    },
    forceSubmit: boolean = false,
    tempToken?: string | null,
    aiSummary?: string | null
  ): Observable<any> {
    const url = `${this.baseUrl}/rescheduling-appeals`;

    if (!scheduleId || !reason || !appealDetails) {
      return throwError(() => new Error('Invalid parameters provided.'));
    }

    const form = new FormData();
    form.append('scheduleId', String(scheduleId));

    if (tempToken) {
      form.append('tempToken', tempToken);
    } else if (appealFile) {
      form.append('appealFile', appealFile, appealFile.name);
    }

    if (aiSummary) {
      form.append('aiSummary', aiSummary);
    }

    form.append('reason',    reason);
    form.append('day',       appealDetails.day ?? '');
    form.append('startTime', this.to24Hour(appealDetails.startTime));
    form.append('endTime',   this.to24Hour(appealDetails.endTime));
    form.append('roomCode',  String(appealDetails.roomCode ?? ''));
    form.append('forceSubmit', forceSubmit ? 'true' : 'false');

    return this.handleResponseWithPhpNotices(this.http.post(url, form));
  }

    /**
   * Requests access for a faculty member to submit rescheduling appeals.
   * @param facultyId - The ID of the faculty member requesting access.
   * @returns An observable that emits the response from the server.
   */
  requestAppealAccess(facultyId: string): Observable<any> {
    return this.http
      .post(`${this.baseUrl}/rescheduling-appeals/request-access`, { faculty_id: facultyId })
      .pipe(catchError((error: any) => throwError(() => error)));
  }

  /**
   * Cancels a faculty member's request for access to submit rescheduling appeals.
   * @param facultyId - The ID of the faculty member canceling the request.
   * @returns An observable that emits the response from the server.
   */
  cancelAppealAccessRequest(facultyId: string): Observable<any> {
    return this.http
      .post(`${this.baseUrl}/rescheduling-appeals/cancel-request`, { faculty_id: facultyId })
      .pipe(catchError((error: any) => throwError(() => error)));
  }

  /**
   * Gets the list of appeals submitted by the current faculty member.
   * @returns 
   */
  getMyAppeals(): Observable<AppealResponse[]> {
    return this.http
      .get<AppealResponse[]>(`${this.baseUrl}/my-appeals`)
      .pipe(catchError((error: any) => throwError(() => error)));
  }

  /**
   * Cancels an appeal by its ID.
   * @param appealId 
   * @returns 
   */
  cancelAppeal(appealId: number): Observable<any> {
    return this.http
      .delete(`${this.baseUrl}/my-appeals/${appealId}`)
      .pipe(catchError((error: any) => throwError(() => error)));
  }

  /**
   * Gets the list of all rescheduling appeals.
   * @returns 
   */
  getAllAppeals(): Observable<AppealResponse[]> {
    return this.http
      .get<AppealResponse[]>(`${this.baseUrl}/rescheduling-appeals`)
      .pipe(catchError((error: any) => throwError(() => error)));
  }

  //
  // ADMIN ACTIONS
  //

  /**
   * Submits an approval for a rescheduling appeal with the provided
   * new schedule and administrative remarks.
   * @param appealId - The ID of the appeal being approved.
   * @param newSchedule - The target schedule slot details.
   * @param adminRemarks - Optional administrative remarks.
   * @returns 
   */
  approveAppeal(
    appealId: number,
    newSchedule: { day: string; startTime: string; endTime: string; room: string; },
    adminRemarks: string
  ): Observable<any> {
    return this.handleResponseWithPhpNotices(
      this.http.post(`${this.baseUrl}/rescheduling-appeals/${appealId}/approve`, {
        day:           newSchedule.day,
        start_time:    this.to24Hour(newSchedule.startTime),
        end_time:      this.to24Hour(newSchedule.endTime),
        room:          newSchedule.room,
        admin_remarks: adminRemarks,
      })
    );
  }

  /**
   * Approves an appeal as a mutual schedule swap between two schedules.
   * @param appealId - The ID of the appeal being approved.
   * @param swapScheduleId - The ID of the counter-schedule to swap with.
   * @param newSchedule - The target schedule slot details.
   * @param adminRemarks - Optional administrative remarks.
   */
  approveSwap(
    appealId: number,
    swapScheduleId: number,
    newSchedule: {
      day: string;
      startTime: string;
      endTime: string;
      room: string;
    },
    adminRemarks: string,
  ): Observable<any> {
    return this.handleResponseWithPhpNotices(
      this.http.post(
        `${this.baseUrl}/rescheduling-appeals/${appealId}/approve-swap`,
        {
          swap_schedule_id: swapScheduleId,
          day: newSchedule.day,
          start_time: this.to24Hour(newSchedule.startTime),
          end_time: this.to24Hour(newSchedule.endTime),
          room: newSchedule.room,
          admin_remarks: adminRemarks,
        },
      ),
    );
  }

  /**
   * Denies a rescheduling appeal with the provided administrative remarks.
   * @param appealId - The ID of the appeal being denied.
   * @param adminRemarks - Optional administrative remarks explaining the denial.
   * @returns - An Observable emitting the server response for the denial action.
   */
  denyAppeal(appealId: number, adminRemarks: string): Observable<any> {
    return this.http
      .post(`${this.baseUrl}/rescheduling-appeals/${appealId}/deny`, {
        admin_remarks: adminRemarks,
      })
      .pipe(catchError((error: any) => throwError(() => error)));
  }

  /**
   * Rejects a rescheduling appeal access request for the specified faculty member.
   * @param facultyId - The ID of the faculty member whose access request is being rejected.
   * @returns - An Observable emitting the server response for the rejection action.
   */
  rejectAppealAccessRequest(facultyId: string): Observable<any> {
    return this.http
      .post(`${this.baseUrl}/rescheduling-appeals/reject-access`, { faculty_id: facultyId })
      .pipe(catchError((error: any) => throwError(() => error)));
  }

  /**
   * Toggles the access status of a faculty member for rescheduling appeals.
   * @param facultyId - The ID of the faculty member whose access is being toggled.
   * @param isEnabled - The new access status (true for enabled, false for disabled).
   * @param activeSemesterId - The ID of the active semester.
   * @param startDate - Optional start date for the access period.
   * @param endDate - Optional end date for the access period.
   * @param sendEmail - Optional flag to indicate if an email should be sent.
   */   
  toggleFacultyAppealAccess(
    facultyId: number,
    isEnabled: boolean,
    activeSemesterId: number,
    startDate?: string,
    endDate?: string,
    sendEmail?: boolean
  ): Observable<any> {
    return this.http
      .post(`${this.baseUrl}/rescheduling-appeals/toggle-access`, {
        faculty_id: facultyId,
        is_enabled: isEnabled,
        active_semester_id: activeSemesterId,
        start_date: startDate,
        end_date: endDate,
        send_email: sendEmail
      })
      .pipe(catchError((error: any) => throwError(() => error)));
  }

  /**
   * Toggles the access status of all faculty members for rescheduling appeals.
   * @param isEnabled - The new access status (true for enabled, false for disabled).
   * @param activeSemesterId - The ID of the active semester.
   * @param startDate - Optional start date for the access period.
   * @param endDate - Optional end date for the access period.
   * @param sendEmail - Optional flag to indicate if an email should be sent.
   * @returns 
   */
  toggleAllFacultyAppealAccess(
    isEnabled: boolean,
    activeSemesterId: number,
    startDate?: string,
    endDate?: string,
    sendEmail?: boolean
  ): Observable<any> {
    return this.http
      .post(`${this.baseUrl}/rescheduling-appeals/toggle-all-access`, {
        is_enabled: isEnabled,
        active_semester_id: activeSemesterId,
        start_date: startDate,
        end_date: endDate,
        send_email: sendEmail
      })
      .pipe(catchError((error: any) => throwError(() => error)));
  }

  // ── VALIDATION ────────────────────────────────────────────────

  /**
   * Validates a rescheduling appeal before it is approved.
   * @param proposedDay The day of the proposed schedule.
   * @param proposedStartTime The start time of the proposed schedule.
   * @param proposedEndTime The end time of the proposed schedule.
   * @param proposedRoomId The ID of the proposed room.
   * @param schedules The current schedules.
   * @param rooms - The available rooms.
   * @param arrangements - The schedule arrangement overrides.
   * @param scheduleContext - An object containing the context of the schedule 
   * being appealed, including course ID, schedule ID, program ID, 
   * year level, section ID, and faculty ID.
   * @returns 
   */
  validateAppealBeforeApproval(
    proposedDay: string,
    proposedStartTime: string,
    proposedEndTime: string,
    proposedRoomId: number | null,
    schedules: PopulateSchedulesResponse,
    rooms: { rooms: Room[] },
    arrangements: ScheduleArrangementOverride[],
    scheduleContext: {
      course_id: number,
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
        course_id: scheduleContext.course_id,
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

  /**
   * Downloads the document associated with a rescheduling appeal.
   * @param appealId 
   * @returns 
   */
  downloadAppealDocument(appealId: number): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/rescheduling-appeals/${appealId}/download`, {
      responseType: 'blob'
    });
  }
}
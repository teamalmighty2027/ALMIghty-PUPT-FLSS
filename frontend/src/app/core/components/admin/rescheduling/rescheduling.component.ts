import { Component, OnInit, AfterViewInit, ViewChild, TemplateRef, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule, formatDate } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { trigger, transition, style, animate } from '@angular/animations';
import { Subject, forkJoin, takeUntil } from 'rxjs';
import { MatCheckboxModule } from '@angular/material/checkbox';

import { LoadingComponent } from '../../../../shared/loading/loading.component';
import { TableHeaderComponent } from '../../../../shared/table-header/table-header.component';
import { ReportsHeaderComponent } from '../../../../shared/reports-header/reports-header.component';
import { DialogViewScheduleComponent } from '../../../../shared/dialog-view-schedule/dialog-view-schedule.component';
import { DialogExportComponent } from '../../../../shared/dialog-export/dialog-export.component';
import { DialogToggleAppealsComponent } from '../../../../shared/dialog-toggle-appeals/dialog-toggle-appeals.component';

import { ReschedulingService, AppealResponse } from '../../../services/faculty/rescheduling/rescheduling.service';
import { SchedulingService } from '../../../services/admin/scheduling/scheduling.service';
import { SpeechRecognitionService } from '../../../services/speech/speech-recognition.service';
import { ReportsService } from '../../../services/admin/reports/reports.service';
import { ReportHeaderService } from '../../../services/report-header/report-header.service';

import {
  PopulateSchedulesResponse,
  Room,
  ScheduleArrangementOverride,
} from '../../../models/scheduling.model';

import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

// ── Local view models ───────────────────────────────────────────
interface ReschedulingAppeal {
  id: number;
  rawAppealId: number;
  scheduleId: number;
  facultyName: string;
  programCode: string;
  courseTitle: string;
  originalSchedule: string;
  originalDay?: string;
  originalStartTime?: string;
  originalEndTime?: string;
  originalRoom?: string;
  appealVerification: string;
  preferredDay?: string;
  preferredStartTime?: string;
  preferredEndTime?: string;
  rawPreferredStartTime?: string;
  rawPreferredEndTime?: string;
  room?: string;
  filePath?: string | null;
  reasoning?: string | null;
}

interface FacultyArrangement {
  facultyId: number;
  facultyName: string;
  facultyCode: string;
  facultyType: string;
  facultyUnits: number;
  schedules: any[];
  academicYear?: string;
  semester?: string;
  isAppealEnabled?: boolean;
  hasAppealRequest?: boolean;
  appealStartDate?: string | null;
  appealEndDate?: string | null;
}

interface TimeSlot {
  time: string;
  minutes: number;
}

@Component({
  selector: 'app-rescheduling',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatTableModule,
    MatPaginatorModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MatSlideToggleModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatDialogModule,
    LoadingComponent,
    TableHeaderComponent,
    MatTabsModule,
    ReportsHeaderComponent,
    MatCheckboxModule,
  ],
  animations: [
    trigger('fadeAnimation', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('300ms', style({ opacity: 1 })),
      ]),
    ]),
  ],
  templateUrl: './rescheduling.component.html',
  styleUrl: './rescheduling.component.scss',
})
export class ReschedulingComponent implements OnInit, AfterViewInit, OnDestroy {
  isLoading = false;
  isInitLoading = true;
  selectedTabIndex = 0;

  // Master Toggle State
  isAllAppealsEnabled = false;

  // ── Shared Term Variables ──
  selectedTermId: number | null = null;
  availableTerms: any[] = [];
  academicYear: string = '2025-2026';
  semester: string = '1st Semester';

  // ── Tab 1: Appeals Management ──
  appeals: AppealResponse[] =  [];
  headerInputFields: any[] = [{ type: 'text', label: 'Search Appeals', key: 'search' }];
  displayedColumns: string[] = ['index', 'facultyName', 'programCode', 'originalSchedule', 'appealVerification', 'action'];
  dataSource = new MatTableDataSource<ReschedulingAppeal>([]);
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild('toggleAllDialog') toggleAllDialog!: TemplateRef<any>;
  sendEmailToAll = false;

  // ── Tab 2: Internal Arrangements ──
  arrangementsInputFields: any[] = [{ type: 'text', label: 'Search Faculty', key: 'search' }];
  arrangementsColumns: string[] = ['index', 'facultyName', 'facultyCode', 'facultyType', 'facultyUnits', 'allowAppeals', 'action'];
  arrangementsDataSource = new MatTableDataSource<FacultyArrangement>([]);
  @ViewChild('arrangementsPaginator') arrangementsPaginator!: MatPaginator;

  private allFaculties: FacultyArrangement[] = [];
  hasAnyArrangements = false;

  private cachedSchedules: PopulateSchedulesResponse | null = null;
  private cachedRooms: { rooms: Room[] } | null = null;
  private cachedArrangements: ScheduleArrangementOverride[] = [];

  // ── Dialog state ──
  selectedAppeal: ReschedulingAppeal | null = null;
  newSchedule: ReschedulingAppeal | null = null;
  adminRemarks = '';
  conflictMessages: string[] = [];

  @ViewChild('viewDialog') viewDialog!: TemplateRef<any>;
  @ViewChild('appealDialog') appealDialog!: TemplateRef<any>;

  daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  timeOptions: string[] = [];
  roomOptions: string[] = [];
  availableEndTimes: string[] = [];
  timeSlots: TimeSlot[] = [];

  isListening = false;
  speechSupported = false;
  private destroy$ = new Subject<void>();
  private speechSession$ = new Subject<void>();
  private validationTimeout: any;

  /**
   * Initializes the component dependencies and speech-recognition state.
   */
  constructor(
    private reschedulingService: ReschedulingService,
    private reportsService: ReportsService,
    private reportHeaderService: ReportHeaderService,
    private schedulingService: SchedulingService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private speechRecognitionService: SpeechRecognitionService,
    private cdr: ChangeDetectorRef
  ) {
    this.speechSupported = this.speechRecognitionService.isSupported();
  }

  /**
   * Loads the active term, appeals, and arrangement data for the page.
   */
  ngOnInit(): void {
    this.reportsService.clearAllCaches();
    this.isInitLoading = true;
    this.isLoading = true;
    this.generateTimeSlots();
    this.generateTimeOptions();

    // Load terms FIRST so dropdown appears immediately
    this.reportsService.getAllTermsForDropdown().pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (terms) => {
        this.availableTerms = terms;
        const activeTerm = terms.find((term: any) => term.is_active === 1);
        if (activeTerm) {
          this.selectedTermId = activeTerm.active_semester_id;
          this.academicYear = `${activeTerm.year_start}-${activeTerm.year_end}`;
          this.semester = this.getSemesterDisplay(activeTerm.semester);
        }
        this.cdr.detectChanges(); // Dropdown renders immediately

        // THEN load appeals and arrangements in parallel
        forkJoin({
          appeals: this.reschedulingService.getAllAppeals(),
          arrangements: this.selectedTermId 
            ? this.reportsService.getFacultySchedulesReport(this.selectedTermId)
            : null as any
        }).pipe(takeUntil(this.destroy$)).subscribe({
          next: ({ appeals, arrangements }) => {
            this.appeals = appeals;
            const mappedAppeals = appeals.map(a => this.mapAppeal(a));
            this.dataSource.data = mappedAppeals;

            if (arrangements && this.selectedTermId) {
              this.loadArrangementsForTerm(this.selectedTermId, mappedAppeals);
            } else {
              this.isLoading = false;
              this.isInitLoading = false;
            }
          },
          error: (err) => {
            console.error('Failed to load data:', err);
            this.isLoading = false;
            this.isInitLoading = false;
          }
        });
      },
      error: (err) => {
        console.error('Failed to load terms:', err);
        this.isLoading = false;
        this.isInitLoading = false;
      }
    });
  }

  /**
   * Attaches the table paginators after the view is ready.
   */
  ngAfterViewInit(): void {
    this.dataSource.paginator = this.paginator;
    this.arrangementsDataSource.paginator = this.arrangementsPaginator;
  }

  /**
   * Cleans up pending timers, subscriptions, and speech-recognition state.
   */
  ngOnDestroy(): void {
    if (this.validationTimeout) {
      clearTimeout(this.validationTimeout);
    }

    this.destroy$.next();
    this.destroy$.complete();
    
    if (this.isListening) {
      this.speechSession$.next();
      this.speechSession$.complete();
      this.speechRecognitionService.abort();
      this.isListening = false;
    }
  }

  /**
   * Builds the half-hour time slot list from 7:00 AM through 9:00 PM.
   */
  private generateTimeSlots() {
    const startTime = 7 * 60; // 7:00 AM
    const endTime = 21 * 60;  // 9:00 PM
    const interval = 30;
    this.timeSlots = [];
    for (let time = startTime; time <= endTime; time += interval) {
      const hours = Math.floor(time / 60);
      const mins  = time % 60;
      const ampm  = hours >= 12 ? 'PM' : 'AM';
      const h     = hours % 12 || 12;
      const timeStr = `${h}:${mins.toString().padStart(2, '0')} ${ampm}`;
      this.timeSlots.push({ time: timeStr, minutes: time });
    }
  }

  /**
   * Converts a semester number into a user-friendly display label.
   *
   * @param semester The numeric semester value from the backend.
   */
  getSemesterDisplay(semester: number): string {
    switch (semester) {
      case 1: return '1st Semester';
      case 2: return '2nd Semester';
      case 3: return 'Summer Semester';
      default: return 'Unknown Semester';
    }
  }

  /**
   * Updates the selected term metadata and reloads the arrangement data.
   */
  onTermChange() {
    const selected = this.availableTerms.find(t => t.active_semester_id === this.selectedTermId);
    if (selected) {
      this.academicYear = `${selected.year_start}-${selected.year_end}`;
      this.semester = this.getSemesterDisplay(selected.semester);
      this.loadData();
    }
  }

  /**
   * Reloads the current term data and refreshes the local caches.
   */
  loadData(): void {
    if (!this.selectedTermId) return;

    this.isLoading = true;
    const mappedAppeals = this.dataSource.data;
    this.loadValidationCaches(mappedAppeals);
    this.loadArrangementsForTerm(this.selectedTermId, mappedAppeals);
  }

  /**
   * Populates the cached schedule and room data used for validation.
   *
   * @param mappedAppeals The mapped appeal rows currently shown in the table.
   */
  private loadValidationCaches(mappedAppeals: ReschedulingAppeal[]): void {
    this.cachedArrangements = this.buildArrangementOverrides(mappedAppeals);

    if (this.cachedSchedules && this.cachedRooms) return;

    forkJoin({
      schedules: this.schedulingService.populateSchedules(),
      rooms: this.schedulingService.getAllRooms(),
    }).subscribe({
      next: ({ schedules, rooms }) => {
        this.cachedSchedules = schedules;
        this.cachedRooms = rooms;
      },
      error: (err) => {
        console.error('Failed to load validation caches:', err);
      }
    });
  }

  /**
   * Builds schedule override objects for the approved appeal rows.
   *
   * @param mappedAppeals The mapped appeal rows currently shown in the table.
   */
  private buildArrangementOverrides(
    mappedAppeals: ReschedulingAppeal[]
  ): ScheduleArrangementOverride[] {
    return mappedAppeals
      .filter((appeal) => appeal.appealVerification === 'Approved')
      .map((appeal) => ({
        schedule_id: appeal.scheduleId,
        day: appeal.preferredDay ?? undefined,
        start_time: appeal.rawPreferredStartTime ?? undefined,
        end_time: appeal.rawPreferredEndTime ?? undefined,
        room_code: appeal.room ?? undefined,
      }));
  }

  /**
   * Finds the schedule context needed to validate an approval.
   *
   * @param scheduleId The schedule identifier to locate in the cached tree.
   */
  private getScheduleContext(scheduleId: number): {
    schedule_id: number;
    program_id: number;
    year_level: number;
    section_id: number;
    faculty_id: number | null;
  } | null {
    if (!this.cachedSchedules) return null;

    for (const program of this.cachedSchedules.programs) {
      for (const yearLevel of program.year_levels) {
        for (const semester of yearLevel.semesters) {
          for (const section of semester.sections) {
            for (const course of section.courses) {
              if (course.schedule?.schedule_id === scheduleId) {
                return {
                  schedule_id: scheduleId,
                  program_id: program.program_id,
                  year_level: yearLevel.year_level,
                  section_id: section.section_per_program_year_id,
                  faculty_id: course.faculty_id ?? null,
                };
              }
            }
          }
        }
      }
    }

    return null;
  }

  /**
   * Resolves a room code to its numeric room ID from the cached room list.
   *
   * @param roomCode The room code entered by the admin.
   */
  private getRoomIdByCode(roomCode: string | null | undefined): number | null {
    if (!roomCode || !this.cachedRooms) return null;
    const normalized = roomCode.trim().toLowerCase();
    if (!normalized) return null;

    const match = this.cachedRooms.rooms.find(
      (room) => room.room_code.toLowerCase() === normalized
    );
    return match?.room_id ?? null;
  }

  /**
   * Reloads the faculty arrangements for a term and merges approved appeals.
   *
   * @param termId The active semester identifier to load.
   * @param mappedAppeals The mapped appeal rows used for merging.
   */
  private loadArrangementsForTerm(termId: number, mappedAppeals: ReschedulingAppeal[]): void {
    this.reportsService.getFacultySchedulesReport(termId).subscribe({
      next: (facultiesReq) => {
        const approvedAppeals = mappedAppeals.filter(a => a.appealVerification === 'Approved');
        const rawFaculties = facultiesReq.faculty_schedule_reports.faculties;

        rawFaculties.forEach((fac: any) => {
          const facultyAppeals = approvedAppeals.filter(a => 
            this.normalizeString(a.facultyName) === this.normalizeString(fac.faculty_name));

          const mergedSchedules = (fac.schedules || []).map((sched: any) => {
            const matchingAppeal = facultyAppeals.find(a => a.scheduleId === sched.schedule_id);
            if (matchingAppeal) {
              return {
                ...sched,
                day: matchingAppeal.preferredDay,
                start_time: matchingAppeal.rawPreferredStartTime,
                end_time: matchingAppeal.rawPreferredEndTime,
                room_code: matchingAppeal.room || 'TBA',
                course_details: {
                  ...sched.course_details,
                  course_title: sched.course_details.course_title.includes('(Internal Arrangement)')
                    ? sched.course_details.course_title
                    : `${sched.course_details.course_title} (Internal Arrangement)`
                }
              };
            }
            return sched;
          });

          // ── Find existing live object and PATCH it, don't replace ──
          const existing = this.allFaculties.find(f => f.facultyId === fac.faculty_id);
          if (existing) {
            existing.schedules        = mergedSchedules;
            existing.facultyUnits     = fac.assigned_units || fac.units || 0;
            existing.isAppealEnabled  = !!fac.is_appeal_enabled;
            existing.hasAppealRequest = !!fac.has_appeal_request;
            existing.appealStartDate  = fac.appeal_start_date;
            existing.appealEndDate    = fac.appeal_end_date;
          } else {
            // New faculty not yet in the list — add them
            this.allFaculties.push({
              facultyId:        fac.faculty_id,
              facultyName:      fac.faculty_name,
              facultyCode:      fac.faculty_code,
              facultyType:      fac.faculty_type,
              facultyUnits:     fac.assigned_units || fac.units || 0,
              schedules:        mergedSchedules,
              academicYear:     this.academicYear,
              semester:         this.semester,
              isAppealEnabled:  !!fac.is_appeal_enabled,
              hasAppealRequest: !!fac.has_appeal_request,
              appealStartDate:  fac.appeal_start_date,
              appealEndDate:    fac.appeal_end_date
            });
          }
        });

        // Spread to trigger table re-render, but allFaculties objects are the SAME references
        this.arrangementsDataSource.data = [...this.allFaculties];
        this.updateMasterToggleState();
        this.cdr.detectChanges();
        this.hasAnyArrangements = this.allFaculties.some(f => f.schedules.length > 0);

        this.isLoading = false;
        this.isInitLoading = false;
      },
      error: (err) => {
        console.error('Failed to load faculty arrangements:', err);
        this.isLoading = false;
        this.isInitLoading = false;
      }
    });
  }

  /**
   * Filters the appeals table using the current search term.
   *
   * @param event The search payload emitted by the header component.
   */
  onInputChange(event: any): void {
    const searchTerm = (event?.search || event?.value || '').trim().toLowerCase();
    this.dataSource.filter = searchTerm;
  }

  /**
   * Filters the arrangements table using the current search term.
   *
   * @param event The search payload emitted by the header component.
   */
  onArrangementsInputChange(event: any): void {
    const searchTerm = (event?.search || event?.value || '').trim().toLowerCase();

    if (searchTerm === '') {
      this.arrangementsDataSource.data = this.allFaculties;
    } else {
      this.arrangementsDataSource.data = this.allFaculties.filter(f =>
        f.facultyName.toLowerCase().includes(searchTerm) ||
        f.facultyCode.toLowerCase().includes(searchTerm) ||
        f.facultyType.toLowerCase().includes(searchTerm)
      );
    }
  }

  /**
   * Returns the visible index for a row in the appeals table.
   *
   * @param i The row index within the current page.
   */
  getRowIndex(i: number): number {
    const pageIndex = this.paginator ? this.paginator.pageIndex : 0;
    const pageSize  = this.paginator ? this.paginator.pageSize  : 25;
    return i + 1 + pageIndex * pageSize;
  }

  /**
   * Returns the visible index for a row in the arrangements table.
   *
   * @param i The row index within the current page.
   */
  getArrangementRowIndex(i: number): number {
    const pageIndex = this.arrangementsPaginator ? this.arrangementsPaginator.pageIndex : 0;
    const pageSize  = this.arrangementsPaginator ? this.arrangementsPaginator.pageSize  : 25;
    return i + 1 + pageIndex * pageSize;
  }

  /**
   * Builds CSS class flags for the faculty type chip.
   *
   * @param facultyType The faculty type label from the report.
   */
  getFacultyTypeClass(facultyType: string): Record<string, boolean> {
    const type = (facultyType || '').toLowerCase();
    return {
      'full-time': type.includes('full-time'),
      'designee': type.includes('designee'),
      'part-time': type.includes('part-time'),
      'temporary': type.includes('temporary'),
    };
  }

  // ── Toggle Methods ──────────────────────────────────────────────

  /**
   * Synchronizes the master appeals toggle with the current faculty list.
   */
  updateMasterToggleState(): void {
    if (this.allFaculties.length === 0) {
      this.isAllAppealsEnabled = false;
      return;
    }
    // Only turn master toggle ON if EVERY faculty is enabled
    this.isAllAppealsEnabled = this.allFaculties.every(f => f.isAppealEnabled);
  }

  /**
   * Opens the confirmation dialog for enabling or disabling all appeals.
   *
   * @param event The toggle event from the master switch.
   */
  toggleAllAppeals(event: any): void {
    const isEnabled = event.checked;

    // Grab existing dates from an enabled faculty member to show in the dialog if disabling
    const activeFaculty = this.allFaculties.find(f => f.isAppealEnabled);

    const dialogRef = this.dialog.open(DialogToggleAppealsComponent, {
      width: '500px',
      data: { 
        type: 'all_appeals', 
        academicYear: this.academicYear, 
        semester: this.semester,
        currentState: !isEnabled,
        startDate: activeFaculty?.appealStartDate ? new Date(activeFaculty.appealStartDate) : null,
        endDate: activeFaculty?.appealEndDate ? new Date(activeFaculty.appealEndDate) : null
      },
      disableClose: true,
      autoFocus: false
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        // Format dates for MySQL (YYYY-MM-DD HH:mm:ss)
        const formattedStart = result.startDate ? formatDate(result.startDate, 'yyyy-MM-dd HH:mm:ss', 'en-US') : undefined;
        const formattedEnd = result.endDate ? formatDate(result.endDate, 'yyyy-MM-dd 23:59:59', 'en-US') : undefined;

        // Optimistic update
        this.isAllAppealsEnabled = isEnabled;
        this.allFaculties.forEach(f => {
          f.isAppealEnabled = isEnabled;
          if (isEnabled) {
            f.hasAppealRequest = false;
            // UPDATE LOCAL MEMORY WITH NEW DATES
            f.appealStartDate = formattedStart;
            f.appealEndDate = formattedEnd;
          } else {
            // WIPE LOCAL MEMORY IF DISABLED
            f.appealStartDate = null;
            f.appealEndDate = null;
          }
        });
        
        this.arrangementsDataSource.data = [...this.allFaculties];
        this.cdr.detectChanges();

        this.reschedulingService.toggleAllFacultyAppealAccess(isEnabled, this.selectedTermId!, formattedStart, formattedEnd, result.sendEmail)
          .subscribe({
            next: () => {
              const status = isEnabled ? 'scheduled' : 'disabled';
              this.snackBar.open(`Appeals ${status} for ALL faculty`, 'Close', { duration: 3000 });
              
              // Refresh to sync dates from server
              if (this.selectedTermId) {
                this.loadArrangementsForTerm(this.selectedTermId, this.dataSource.data);
              }
            },
            error: () => {
              // Revert on failure
              this.isAllAppealsEnabled = !isEnabled;
              this.allFaculties.forEach(f => f.isAppealEnabled = !isEnabled);
              this.arrangementsDataSource.data = [...this.allFaculties];
              this.updateMasterToggleState();
              this.cdr.detectChanges();
              this.snackBar.open('Failed to update appeal access.', 'Close', { duration: 3000 });
            }
          });
      }
    });
  }

    /**
     * Opens the confirmation dialog for a single faculty appeal toggle.
     *
     * @param faculty The faculty row being updated.
     * @param event The toggle event from the row switch.
     */
  toggleAppealAccess(faculty: FacultyArrangement, event: any): void {
    const isEnabled = event.checked;

    // Helper function to safely parse SQL dates across all browsers
    const parseSqlDate = (dateStr: string | null | undefined) => 
      dateStr ? new Date(dateStr.replace(' ', 'T')) : null;

    const dialogRef = this.dialog.open(DialogToggleAppealsComponent, {
      width: '500px',
      data: { 
        type: 'single_appeal', 
        facultyName: faculty.facultyName, 
        academicYear: this.academicYear, 
        semester: this.semester,
        currentState: !isEnabled,
        // USE THE SAFE PARSER HERE
        startDate: parseSqlDate(faculty.appealStartDate),
        endDate: parseSqlDate(faculty.appealEndDate)
      },
      disableClose: true,
      autoFocus: false
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        // Format dates for MySQL (YYYY-MM-DD HH:mm:ss)
        const formattedStart = result.startDate ? formatDate(result.startDate, 'yyyy-MM-dd HH:mm:ss', 'en-US') : undefined;
        const formattedEnd = result.endDate ? formatDate(result.endDate, 'yyyy-MM-dd 23:59:59', 'en-US') : undefined;

        faculty.isAppealEnabled = isEnabled;
        
        // UPDATE LOCAL MEMORY WITH NEW DATES
        if (isEnabled) {
          faculty.hasAppealRequest = false;
          faculty.appealStartDate = formattedStart;
          faculty.appealEndDate = formattedEnd;
        } else {
          faculty.appealStartDate = null;
          faculty.appealEndDate = null;
        }

        this.reschedulingService.toggleFacultyAppealAccess(faculty.facultyId, isEnabled, this.selectedTermId!, formattedStart, formattedEnd, result.sendEmail)
          .subscribe({
            next: () => {
              const status = isEnabled ? 'scheduled' : 'disabled';
              this.snackBar.open(`Appeals ${status} for ${faculty.facultyName}`, 'Close', { duration: 3000 });
              this.updateMasterToggleState();
            },
            error: () => {
              faculty.isAppealEnabled = !isEnabled;
              this.updateMasterToggleState();
              this.snackBar.open('Failed to update appeal access.', 'Close', { duration: 3000 });
            }
          });
      }
    });
  }

    /**
     * Handles tab changes and refreshes the active tab's data silently.
     *
     * @param event The tab-change event from the Material tab group.
     */
  onTabChange(event: any): void {
    const newIndex = event.index;
    
    if (newIndex === 1) {
      // Appeals tab — silent background refresh, no loading state
      this.reschedulingService.getAllAppeals().pipe(
        takeUntil(this.destroy$)
      ).subscribe({
        next: (appeals) => {
          this.appeals = appeals;
          const mappedAppeals = appeals.map(a => this.mapAppeal(a));
          this.dataSource.data = mappedAppeals;
          this.cachedArrangements = this.buildArrangementOverrides(mappedAppeals);
        },
        error: (err) => console.error('Failed to refresh appeals:', err)
      });
    } else if (newIndex === 0 && this.selectedTermId) {
      // Arrangements tab — silent refresh, NO isLoading flag so animation plays
      this.reportsService.getFacultySchedulesReport(this.selectedTermId).pipe(
        takeUntil(this.destroy$)
      ).subscribe({
        next: (facultiesReq) => {
          const mappedAppeals = this.dataSource.data;
          const approvedAppeals = mappedAppeals.filter(a => a.appealVerification === 'Approved');
          const rawFaculties = facultiesReq.faculty_schedule_reports.faculties;

          const mergedFaculties: FacultyArrangement[] = rawFaculties.map((fac: any) => {
            const facultyAppeals = approvedAppeals.filter(a => a.facultyName === fac.faculty_name);
            const mergedSchedules = (fac.schedules || []).map((sched: any) => {
              const matchingAppeal = facultyAppeals.find(a => a.scheduleId === sched.schedule_id);
              if (matchingAppeal) {
                return {
                  ...sched,
                  day: matchingAppeal.preferredDay,
                  start_time: matchingAppeal.rawPreferredStartTime,
                  end_time: matchingAppeal.rawPreferredEndTime,
                  room_code: matchingAppeal.room || 'TBA',
                  course_details: {
                    ...sched.course_details,
                    course_title: `${sched.course_details.course_title} (Internal Arrangement)`
                  }
                };
              }
              return sched;
            });

            return {
            /**
             * Opens the export dialog for all internal arrangements.
             */
              facultyId: fac.faculty_id,
              facultyName: fac.faculty_name,
              facultyCode: fac.faculty_code,
              facultyType: fac.faculty_type,
              facultyUnits: fac.assigned_units || fac.units || 0,
              schedules: mergedSchedules,
              academicYear: this.academicYear,
              semester: this.semester,
              isAppealEnabled: !!fac.is_appeal_enabled,
              hasAppealRequest: !!fac.has_appeal_request,
              appealStartDate: fac.appeal_start_date,
              appealEndDate: fac.appeal_end_date
            };
          });

          this.allFaculties = mergedFaculties;
          this.arrangementsDataSource.data = mergedFaculties;
          this.updateMasterToggleState();
          this.cdr.detectChanges();
        },
        error: (err) => console.error('Failed to refresh arrangements:', err)
      });
    }
  }

  // ── PDF and Excel Export Methods ─────────────────────────────────────
  
  onExportArrangements(): void {
    if (this.allFaculties.length === 0) {
      this.snackBar.open('No active arrangements available to export.', 'Close', { duration: 3000 });
      return;
    }

    const generatePdfFunction = (): Blob | void => {
      return this.generateAllSchedulesPdfBlob();
    };

    const baseFileName = `All_Internal_Arrangements_${this.academicYear}_${this.semester.replace(/\s+/g, '_')}`;

    this.dialog.open(DialogViewScheduleComponent, {
      maxWidth: '90vw',
      width: '100%',
      data: {
        exportType: 'all',
        entity: 'faculty',
        entityData: this.allFaculties.map(f => f.schedules).flat(),
        customTitle: 'All Internal Arrangements',
        fileName: baseFileName,
        academicYear: this.academicYear,
        semester: this.semester,
        generatePdfFunction: generatePdfFunction,
        generateExcelFunction: async () => {
          const excelBlob = await this.generateArrangementsExcelBlobAll();
          saveAs(excelBlob, `${baseFileName}.xlsx`);
        },
        showViewToggle: false,
      },
      disableClose: true,
      autoFocus: true,
    });
  }

  /**
   * Opens the schedule preview dialog for one faculty's arrangements.
   *
   * @param faculty The faculty row to preview.
   */
  viewFacultyArrangements(faculty: FacultyArrangement): void {
    // ── Always grab the live object from allFaculties, never the table row ──
    const liveFaculty = this.allFaculties.find(f => f.facultyId === faculty.facultyId) ?? faculty;

    const formattedName = liveFaculty.facultyName.replace(',', '').replace(/\s+/g, '_');
    const baseFileName = `${formattedName}_Arrangements_${liveFaculty.academicYear}_${liveFaculty.semester?.replace(/\s+/g, '_')}`;

    this.dialog.open(DialogViewScheduleComponent, {
      maxWidth: '90vw',
      width: '100%',
      data: {
        exportType: 'single',
        entity: 'faculty',
        entityData: liveFaculty.schedules,  // ← live reference, not snapshot
        customTitle: liveFaculty.facultyName,
        academicYear: liveFaculty.academicYear,
        semester: liveFaculty.semester,
        generatePdfFunction: () => this.createPdfBlob(liveFaculty),
        generateExcelFunction: async () => {
          const excelBlob = await this.generateArrangementExcelBlob(liveFaculty);
          saveAs(excelBlob, `${baseFileName}.xlsx`);
        },
        previewMode: true,
      },
      disableClose: true,
      autoFocus: true,
    });
  }

  /**
   * Opens the export dialog for a single faculty's arrangements.
   *
   * @param faculty The faculty row to export.
   */
  downloadFacultyArrangements(faculty: FacultyArrangement): void {
    const academicYear = faculty.academicYear || '';
    const semester = faculty.semester || '';
    const formattedName = faculty.facultyName.replace(',', '').replace(/\s+/g, '_');
    const baseFileName = `${formattedName}_Arrangements_${academicYear}_${semester.replace(/\s+/g, '_')}`;

    this.dialog.open(DialogExportComponent, {
      width: '90vw',
      maxWidth: '1200px',
      disableClose: true,
      data: {
        exportType: 'single',
        customTitle: `${faculty.facultyName} (Internal Arrangement)`,
        subtitle: `For Academic Year ${academicYear}, ${semester}`,
        generatePdfFunction: () => this.createPdfBlob(faculty),
        generateExcelFunction: async () => {
          const excelBlob = await this.generateArrangementExcelBlob(faculty);
          saveAs(excelBlob, `${baseFileName}.xlsx`);
        },
        generateFileNameFunction: () => `${baseFileName}.pdf`
      }
    });
  }

  // ── ExcelJS Rendering Logic ────────────────────────────────────

  /**
   * Builds one Excel workbook containing every faculty arrangement sheet.
   */
  private async generateArrangementsExcelBlobAll(): Promise<Blob> {
    const workbook = new ExcelJS.Workbook();
    for (const faculty of this.allFaculties) {
      if (faculty.schedules && faculty.schedules.length > 0) {
        const tabName = faculty.facultyName.split(',')[0].substring(0, 31).replace(/[^\w\s-]/gi, '');
        const worksheet = workbook.addWorksheet(tabName);
        this.applyArrangementExcelLayout(worksheet, faculty);
      }
    }
    const buffer = await workbook.xlsx.writeBuffer();
    return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  /**
   * Builds one Excel workbook for a single faculty arrangement sheet.
   *
   * @param faculty The faculty arrangement to export.
   */
  private async generateArrangementExcelBlob(faculty: FacultyArrangement): Promise<Blob> {
    const workbook = new ExcelJS.Workbook();
    const tabName = faculty.facultyName.split(',')[0].substring(0, 31).replace(/[^\w\s-]/gi, '');
    const worksheet = workbook.addWorksheet(tabName);
    this.applyArrangementExcelLayout(worksheet, faculty);
    const buffer = await workbook.xlsx.writeBuffer();
    return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  /**
   * Applies the shared Excel layout for a faculty arrangement sheet.
   *
   * @param worksheet The worksheet being formatted.
   * @param faculty The faculty arrangement data to render.
   */
  private applyArrangementExcelLayout(worksheet: ExcelJS.Worksheet, faculty: FacultyArrangement) {
    worksheet.pageSetup = {
      orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 }
    };

    worksheet.columns = [
      { width: 15 }, { width: 35 }, { width: 8 }, { width: 8 }, 
      { width: 10 }, { width: 15 }, { width: 15 }, { width: 25 }
    ];

    worksheet.mergeCells('A1:D1'); worksheet.mergeCells('E1:H1');
    worksheet.mergeCells('A2:D2'); worksheet.mergeCells('E2:H2');

    worksheet.getCell('A1').value = `Faculty (Internal Arrangement): ${faculty.facultyName.toUpperCase()}`;
    worksheet.getCell('E1').value = `Faculty Type: ${faculty.facultyType}`;
    worksheet.getCell('A2').value = `School Year: ${faculty.academicYear} | Semester: ${faculty.semester}`;
    worksheet.getCell('E2').value = `Total Load: ${faculty.facultyUnits} Units`;

    ['A1', 'E1', 'A2', 'E2'].forEach(c => {
      const cell = worksheet.getCell(c);
      cell.font = { bold: true };
      cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
    });

    worksheet.addRow([]);

    const headerRow = worksheet.addRow([
      'Subject Code', 'Description', 'Lec', 'Lab', 'Units', 'Section', 'Room No.', 'Schedule'
    ]);
    headerRow.height = 25;
    headerRow.eachCell(cell => {
      cell.font = { bold: true };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
    });

    if (faculty.schedules && faculty.schedules.length > 0) {
      faculty.schedules.forEach((schedule: any) => {
        const dayShort = schedule.day.substring(0, 3).toUpperCase();
        const timeRange = `${this.formatTime(schedule.start_time)} - ${this.formatTime(schedule.end_time)}`;
        
        const row = worksheet.addRow([
          schedule.course_details?.course_code || '',
          schedule.course_details?.course_title || '',
          schedule.course_details?.lec || 0,
          schedule.course_details?.lab || 0,
          schedule.course_details?.units || 0,
          `${schedule.program_code} ${schedule.year_level}-${schedule.section_name}`,
          schedule.room_code || 'TBA',
          `${dayShort}\n${timeRange}`
        ]);

        row.eachCell((cell, colNum) => {
          cell.alignment = { vertical: 'middle', horizontal: colNum === 2 ? 'left' : 'center', wrapText: true };
          cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
        });
      });
    }
  }

  // ── jsPDF Rendering Logic ────────────────────────────────────

  /**
   * Builds one PDF document containing all internal arrangement pages.
   */
  generateAllSchedulesPdfBlob(): Blob {
    const doc = new jsPDF('landscape', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.width;
    const margin = 10;
    const topMargin = 15;
    const logoSize = 22;

    const facultiesWithSchedules = this.allFaculties.filter(f => f.schedules && f.schedules.length > 0);

    facultiesWithSchedules.forEach((faculty, index) => {
      if (index > 0) {
        this.reportHeaderService.addStandardFooter(doc);
        doc.addPage();
      }
      
      const title = `${faculty.facultyName} Schedule (Internal Arrangement)`;
      const subtitle = this.getAcademicYearSubtitle(faculty);
      
      let currentY = this.drawHeader(doc, topMargin, pageWidth, margin, logoSize, title, subtitle);
      this.drawScheduleTable(doc, faculty.schedules, title, subtitle, currentY, margin, pageWidth);
    });

    this.reportHeaderService.addStandardFooter(doc);
    return doc.output('blob');
  }

  /**
   * Builds one PDF document for a single faculty arrangement.
   *
   * @param faculty The faculty arrangement to render in the PDF.
   */
  createPdfBlob(faculty: FacultyArrangement): Blob {
    const doc = new jsPDF('landscape', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.width;
    const margin = 10;
    const topMargin = 15;
    const logoSize = 22;

    if (faculty.schedules && faculty.schedules.length > 0) {
      const title = `${faculty.facultyName} (Internal Arrangement)`;
      const subtitle = this.getAcademicYearSubtitle(faculty);

      let currentY = this.drawHeader(doc, topMargin, pageWidth, margin, logoSize, title, subtitle);
      this.drawScheduleTable(doc, faculty.schedules, title, subtitle, currentY, margin, pageWidth);
    }
    
    this.reportHeaderService.addStandardFooter(doc);
    return doc.output('blob');
  }

  /**
   * Renders the shared PDF header and returns the next Y position.
   *
   * @param doc The PDF document being generated.
   * @param startY The top offset where the header should start.
   * @param pageWidth The printable page width.
   * @param margin The left and right page margin.
   * @param logoSize The logo size reserved by the layout.
   * @param title The title text shown in the header.
   * @param subtitle The subtitle text shown in the header.
   */
  private drawHeader(doc: jsPDF, startY: number, pageWidth: number, margin: number, logoSize: number, title: string, subtitle: string): number {
    let currentY = startY;
    this.reportHeaderService.addHeader(doc, title, currentY, subtitle).subscribe((newY) => {
        currentY = newY;
    });
    return currentY;
  }

  /**
   * Draws the schedule grid and schedule blocks for one PDF section.
   *
   * @param doc The PDF document being generated.
   * @param scheduleData The schedules to render.
   * @param title The title text used in the section.
   * @param subtitle The subtitle text used in the section.
   * @param startY The starting Y position for the table.
   * @param margin The left and right page margin.
   * @param pageWidth The printable page width.
   */
  private drawScheduleTable(doc: jsPDF, scheduleData: any[], title: string, subtitle: string, startY: number, margin: number, pageWidth: number): void {
    const hasSchedules = scheduleData && scheduleData.length > 0;

    if (!hasSchedules) {
      doc.setFontSize(20);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(128, 128, 128);
      doc.text('No Assigned Schedule', pageWidth / 2, startY + 50, { align: 'center' });
      return;
    }

    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const timeColWidth = 22; 
    const dayColumnWidth = (pageWidth - margin * 2 - timeColWidth) / days.length;
    
    // MASSIVE row height for large fonts
    const rowHeight = 8.5; 

    // Split the day into Morning and Afternoon chunks
    const chunks = [
      { name: 'Morning (7:00 AM - 2:00 PM)', start: 420, end: 840 },
      { name: 'Afternoon (2:00 PM - 9:00 PM)', start: 840, end: 1260 }
    ];

    // Only process chunks that actually contain classes
    const activeChunks = chunks.filter(chunk => {
      return scheduleData.some(s => {
        const sStart = this.timeToMinutes(s.start_time);
        const sEnd = this.timeToMinutes(s.end_time);
        return Math.max(sStart, chunk.start) < Math.min(sEnd, chunk.end);
      });
    });

    if (activeChunks.length === 0) {
      doc.setFontSize(20);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(128, 128, 128);
      doc.text('No Assigned Schedule', pageWidth / 2, startY + 50, { align: 'center' });
      return;
    }

    let pageUsed = false;
    let currentY = startY;

    activeChunks.forEach(chunk => {
      
      if (pageUsed) {
        this.reportHeaderService.addStandardFooter(doc);
        doc.addPage();
        currentY = this.drawHeader(doc, 15, pageWidth, margin, 22, title, subtitle);
      }
      
      pageUsed = true;
      currentY -= 3; 

      // --- Draw Headers ---
      doc.setFillColor(128, 0, 0);
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');

      // Time Header
      doc.rect(margin, currentY, timeColWidth, 10, 'F');
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.5);
      doc.rect(margin, currentY, timeColWidth, 10);
      doc.text('Time', margin + timeColWidth / 2, currentY + 6.5, { align: 'center' });

      // Day Headers
      days.forEach((day, index) => {
        const xPos = margin + timeColWidth + index * dayColumnWidth;
        doc.setFillColor(128, 0, 0);
        doc.rect(xPos, currentY, dayColumnWidth, 10, 'F');
        doc.rect(xPos, currentY, dayColumnWidth, 10);
        doc.text(day, xPos + dayColumnWidth / 2, currentY + 6.5, { align: 'center' });
      });

      currentY += 10;

      // --- Draw Time Grid for this Chunk ---
      doc.setTextColor(0, 0, 0);
      const chunkSlots = this.timeSlots.filter(s => s.minutes >= chunk.start && s.minutes < chunk.end);

      chunkSlots.forEach((slot, index) => {
        const yPos = currentY + index * rowHeight;
        
        // Flag the top row, the bottom row, and our standard 3-hour gaps
        const isTopRow = index === 0;
        const isBottomRow = index === chunkSlots.length - 1;
        const isThreeHourGap = slot.minutes >= 450 && (slot.minutes - 450) % 180 === 0;

        // Print the Time text if it matches any of those conditions
        if (isTopRow || isBottomRow || isThreeHourGap) {
          
          if (!isTopRow) {
            doc.setDrawColor(200, 200, 200); 
            doc.setLineWidth(0.5);
            doc.line(margin, yPos, pageWidth - margin, yPos);
          }
          
          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          doc.text(slot.time, margin + timeColWidth / 2, yPos + 5, { align: 'center' });
        }
      });

      const finalY = currentY + chunkSlots.length * rowHeight;
      doc.setDrawColor(200, 200, 200);
      
      // Bottom border
      doc.line(margin, finalY, pageWidth - margin, finalY);

      // Vertical Lines
      doc.line(margin, currentY, margin, finalY); 
      doc.line(margin + timeColWidth, currentY, margin + timeColWidth, finalY); 
      days.forEach((_, index) => {
        const xPos = margin + timeColWidth + (index + 1) * dayColumnWidth;
        doc.line(xPos, currentY, xPos, finalY);
      });

      // --- Draw the Blocks ---
      const sortedScheduleData = [...scheduleData].sort((a, b) => this.timeToMinutes(a.start_time) - this.timeToMinutes(b.start_time));

      sortedScheduleData.forEach(item => {
        const dayIndex = days.indexOf(item.day);
        if (dayIndex === -1) return;

        const originalStart = this.timeToMinutes(item.start_time);
        const originalEnd = this.timeToMinutes(item.end_time);

        const cappedStart = Math.max(originalStart, chunk.start);
        const cappedEnd = Math.min(originalEnd, chunk.end);

        if (cappedStart >= cappedEnd) return;

        const startSlot = chunkSlots.findIndex(slot => slot.minutes === cappedStart);
        const duration = Math.ceil((cappedEnd - cappedStart) / 30);

        if (startSlot === -1) return;

        const xPos = margin + timeColWidth + dayIndex * dayColumnWidth;
        const yPos = currentY + startSlot * rowHeight;
        const height = duration * rowHeight;

        // Draw Block Box
        doc.setFillColor(240, 240, 240); 
        doc.setDrawColor(128, 0, 0);     
        doc.setLineWidth(0.3);
        doc.rect(xPos, yPos, dayColumnWidth, height, 'FD'); 

        // --- DYNAMIC TEXT SCALING ---
        let startPadding = 5;
        let lineSpacing = 4.2;
        let bottomBoundary = 6;
        let codeFontSize = 10;
        let textFontSize = 9;
        let timeFontSize = 9.5;
        let timeBottomPadding = 2;

        if (duration <= 2) { 
          startPadding = 3.5;
          lineSpacing = 2.8;
          bottomBoundary = 3.5;
          codeFontSize = 7.5;   
          textFontSize = 6.5;   
          timeFontSize = 7;     
          timeBottomPadding = 1.2;
        } else if (duration === 3) { 
          startPadding = 4;
          lineSpacing = 3.4;
          bottomBoundary = 4.5;
          codeFontSize = 8.5;   
          textFontSize = 7.5;   
          timeFontSize = 8;     
          timeBottomPadding = 1.5;
        } else if (duration === 4) { 
          startPadding = 5;
          lineSpacing = 4;
          bottomBoundary = 5;
          codeFontSize = 9.5;   
          textFontSize = 8.5;   
          timeFontSize = 9;     
          timeBottomPadding = 1.8;
        }

        // ALWAYS print the Time Range at the very bottom of the box first
        const timeString = `${this.formatTimeTo12Hour(item.start_time)} - ${this.formatTimeTo12Hour(item.end_time)}`;
        doc.setTextColor(0);
        doc.setFontSize(timeFontSize);
        doc.setFont('helvetica', 'normal');
        doc.text(timeString, xPos + dayColumnWidth / 2, yPos + height - timeBottomPadding, { align: 'center' });

        // Block Content (Tailored for Rescheduling - Internal Arrangements)
        const content = [
          item.course_details?.course_code || '',
          item.course_details?.course_title || '',
          `${item.program_code} ${item.year_level} - ${item.section_name}`, 
          item.room_code && item.room_code.trim() !== '' ? item.room_code : 'Room TBA'
        ].filter(line => line !== ''); 

        const isBridging = item.course_details?.offering_type === 'bridging';

        let textY = yPos + startPadding;

        // Draw "Bridging" badge at top-right of block if applicable
        if (isBridging) {
          const badgeLabel = 'Bridging';
          const badgeFontSize = duration <= 2 ? 5.5 : 6.5;
          const badgePaddingX = 2.5;
          const badgePaddingY = 1.5;
          doc.setFontSize(badgeFontSize);
          doc.setFont('helvetica', 'bold');
          const badgeTextWidth = doc.getTextWidth(badgeLabel);
          const badgeW = badgeTextWidth + badgePaddingX * 2;
          const badgeH = badgeFontSize * 0.45 + badgePaddingY * 2;
          // Center the badge horizontally in the block
          const badgeX = xPos + (dayColumnWidth - badgeW) / 2;
          // Place it just below the course code (textY is already advanced past course code)
          const badgeY = textY - lineSpacing + (duration <= 2 ? 0.5 : 1);
          doc.setFillColor(128, 0, 0);
          doc.setDrawColor(128, 0, 0);
          doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 1, 1, 'FD');
          doc.setTextColor(255, 255, 255);
          doc.text(badgeLabel, badgeX + badgePaddingX, badgeY + badgeH - badgePaddingY - 0.2);
          doc.setTextColor(0, 0, 0);
          // Advance textY so subsequent lines don't overlap the badge
          textY += badgeH + (duration <= 2 ? 0.5 : 1.5);
        }

        content.forEach((line, idx) => {
          doc.setFontSize(idx === 0 ? codeFontSize : textFontSize);
          doc.setFont('helvetica', idx === 0 ? 'bold' : 'normal');
          
          const wrappedLines = doc.splitTextToSize(line, dayColumnWidth - 2);
          wrappedLines.forEach((wLine: string) => {
            if (textY < yPos + height - bottomBoundary) { 
              doc.text(wLine, xPos + dayColumnWidth / 2, textY, { align: 'center' });
              textY += lineSpacing; 
            }
          });
        });
      });
    });
  }

  /**
   * Formats a 24-hour time string into a 12-hour display label.
   *
   * @param time The time value to format.
   */
  private formatTime(time: string): string {
    const [hours, minutes] = time.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const formattedHours = hours % 12 || 12;
    return `${formattedHours}:${minutes.toString().padStart(2, '0')} ${period}`;
  }

  /**
   * Converts a time string into minutes since midnight.
   *
   * @param time The time value to convert.
   */
  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Formats a time value for the PDF schedule grid.
   *
   * @param time The time value to format.
   */
  private formatTimeTo12Hour(time: string): string {
    return this.formatTime(time);
  }

  /**
   * Builds the academic-year subtitle used in PDF exports.
   *
   * @param faculty The faculty metadata used in the subtitle.
   */
  private getAcademicYearSubtitle(faculty: { academicYear?: string, semester?: string }): string {
    return `For Academic Year ${faculty.academicYear}, ${faculty.semester}`;
  }

  // ── Original Data mapping ──────────────────────────────────────────────────
  /**
   * Generates the selectable time options used by the edit dialog.
   */
  generateTimeOptions(): void {
    for (let hour = 7; hour <= 21; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const period      = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
        const displayMin  = minute === 0 ? '00' : String(minute).padStart(2, '0');
        this.timeOptions.push(`${displayHour}:${displayMin} ${period}`);
      }
    }
  }

  /**
   * Loads the available room options for the appeal editor.
   */
  private loadRoomOptions(): void {
    this.schedulingService.getAllRooms().subscribe({
      next: (response: any) => {
        if (response && response.rooms) {
          const availableRooms = response.rooms.filter(
            (room: any) => room.status === 'Available'
          );
          this.roomOptions = availableRooms.map((room: any) => room.room_code);
        }
      },
      error: (error: any) => {
        console.error('Failed to load rooms:', error);
        this.roomOptions = ['A401', 'A402']; 
      }
    });
  }

  /**
   * Handles a generic schedule-field change and revalidates conflicts.
   */
  onScheduleFieldChange(): void {
    this.debounceValidation();
  }

  /**
   * Updates the allowed end times when the start time changes.
   */
  onStartTimeChange(): void {
    if (this.newSchedule?.preferredStartTime) {
      this.updateAvailableEndTimes(this.newSchedule.preferredStartTime);
      // Clear end time if it's no longer valid
      const startIndex = this.timeOptions.indexOf(this.newSchedule.preferredStartTime);
      if (this.newSchedule?.preferredEndTime) {
        const endIndex = this.timeOptions.indexOf(this.newSchedule.preferredEndTime);
        if (endIndex <= startIndex) {
          this.newSchedule.preferredEndTime = undefined;
        }
      }
    }
    this.debounceValidation();
  }

  /**
   * Validates the selected end time and then rechecks conflicts.
   */
  onEndTimeChange(): void {
    // Validate that end time is after start time
    if (this.newSchedule?.preferredStartTime && this.newSchedule?.preferredEndTime) {
      const startIndex = this.timeOptions.indexOf(this.newSchedule.preferredStartTime);
      const endIndex = this.timeOptions.indexOf(this.newSchedule.preferredEndTime);
      if (endIndex <= startIndex) {
        this.snackBar.open('End time must be after start time', 'Close', { duration: 3000 });
        this.newSchedule.preferredEndTime = undefined;
      }
    }
    this.debounceValidation();
  }

  /**
   * Debounces conflict validation so the dialog does not revalidate too often.
   */
  private debounceValidation(): void {
    // Clear previous timeout
    if (this.validationTimeout) {
      clearTimeout(this.validationTimeout);
    }
    
    // Set new timeout - waits 500ms after last change before validating
    this.validationTimeout = setTimeout(() => {
      this.validateConflicts();
    }, 500);
  }

  /**
   * Validates the proposed appeal schedule against cached conflicts.
   */
  private validateConflicts(): void {
    // Only validate if all required fields are filled
    if (!this.newSchedule?.preferredDay || 
        !this.newSchedule?.preferredStartTime || 
        !this.newSchedule?.preferredEndTime) {
      this.conflictMessages = [];
      return;
    }

    if (!this.cachedSchedules || !this.cachedRooms) {
      return;
    }

    const scheduleContext = this.getScheduleContext(this.selectedAppeal?.scheduleId ?? 0);
    if (!scheduleContext) {
      return;
    }

    const proposedRoomId = this.getRoomIdByCode(this.newSchedule.room ?? null);
    const validation = this.reschedulingService.validateAppealBeforeApproval(
      this.selectedAppeal?.rawAppealId ?? 0,
      this.newSchedule.preferredDay,
      this.newSchedule.preferredStartTime,
      this.newSchedule.preferredEndTime,
      proposedRoomId,
      this.cachedSchedules,
      this.cachedRooms,
      this.cachedArrangements,
      scheduleContext
    );

    this.conflictMessages = validation.hasConflicts ? validation.messages : [];
  }

  /**
   * Updates the available end-time list for the selected start time.
   *
   * @param startTime The selected start time from the dialog.
   */
  private updateAvailableEndTimes(startTime: string): void {
    const startIndex = this.timeOptions.indexOf(startTime);
    if (startIndex >= 0 && startIndex < this.timeOptions.length - 1) {
      this.availableEndTimes = this.timeOptions.slice(startIndex + 1);
    } else {
      this.availableEndTimes = [];
    }
  }

  /**
   * Converts a raw time value into a 12-hour display string.
   *
   * @param time The time value to convert.
   */
  private to12Hour(time: string | null | undefined): string {
    if (!time) return '—';
    if (time.includes('AM') || time.includes('PM')) return time;
    const [hourStr, minuteStr] = time.split(':');
    let hours = parseInt(hourStr, 10);
    const minutes = minuteStr ?? '00';
    const period = hours >= 12 ? 'PM' : 'AM';
    if (hours === 0) hours = 12;
    else if (hours > 12) hours -= 12;
    return `${hours}:${minutes} ${period}`;
  }

  /**
   * Maps a backend appeal record into the table view model.
   *
   * @param a The raw appeal record from the API.
   */
  private mapAppeal(a: any): ReschedulingAppeal {
    const approved: any = a.is_approved;
    let status = 'Pending';
    if (approved === true  || approved === 1 || approved === '1') status = 'Approved';
    if (approved === false || approved === 0 || approved === '0') status = 'Denied';

    const origStart = this.to12Hour(a.original_start_time);
    const origEnd   = this.to12Hour(a.original_end_time);
    const appStart  = this.to12Hour(a.appeal_start_time);
    const appEnd    = this.to12Hour(a.appeal_end_time);

    return {
      id:                 a.appeal_id,
      rawAppealId:        a.appeal_id,
      scheduleId:         a.schedule_id,
      facultyName:        a.faculty_name,
      programCode:        a.program_code,
      courseTitle:        a.course_title,
      originalSchedule:  `${a.original_day} | ${origStart} - ${origEnd}`,
      originalDay:        a.original_day,
      originalStartTime:  origStart,
      originalEndTime:    origEnd,
      originalRoom:       a.original_room,
      appealVerification: status,
      preferredDay:       a.appeal_day,
      preferredStartTime: appStart,
      preferredEndTime:   appEnd,
      rawPreferredStartTime: a.appeal_start_time,
      rawPreferredEndTime: a.appeal_end_time,
      room:               a.appeal_room ?? undefined,
      filePath:           a.file_path,
      reasoning:          a.reasoning,
    };
  }

  // ── Dialog methods ────────────────────────────────────────────
  /**
   * Opens the read-only appeal details dialog.
   *
   * @param appeal The appeal row to display.
   */
  openViewDialog(appeal: ReschedulingAppeal): void {
    this.selectedAppeal = { ...appeal };
    this.dialog.open(this.viewDialog, {
      width: '55%', maxWidth: '1000px', maxHeight: '90vh',
      height: 'auto', disableClose: true,
      panelClass: 'custom-dialog-container',
      autoFocus: true,
    });
  }

  /**
   * Opens the approval dialog and prepares the editable schedule data.
   *
   * @param appeal The appeal row to edit.
   */
  openEditDialog(appeal: ReschedulingAppeal): void {
    this.selectedAppeal = { ...appeal };
    this.newSchedule = this.selectedAppeal.appealVerification !== 'Pending'
      ? { ...this.selectedAppeal }
      : { ...appeal, preferredDay: undefined, preferredStartTime: undefined, 
          preferredEndTime: undefined, room: undefined };
    this.adminRemarks = '';
    this.conflictMessages = [];
    
    this.loadRoomOptions();
    this.availableEndTimes = [...this.timeOptions];
    if (this.newSchedule?.preferredStartTime) {
      this.updateAvailableEndTimes(this.newSchedule.preferredStartTime);
    }

    // Load validation caches NOW (lazily, only when actually needed)
    this.loadValidationCaches(this.dataSource.data);

    this.dialog.open(this.appealDialog, {
      width: '55%', maxWidth: '1000px', maxHeight: '90vh',
      height: 'auto', disableClose: true,
      panelClass: 'custom-dialog-container',
      autoFocus: true,
    });
  }

  /**
   * Closes the active dialog and clears the temporary edit state.
   */
  closeDialog(): void {
    if (this.validationTimeout) {
      clearTimeout(this.validationTimeout);
    }
    this.dialog.closeAll();
    this.selectedAppeal = null;
    this.newSchedule    = null;
    this.adminRemarks   = '';
    this.conflictMessages = [];
  }

  /**
   * Resets the editable fields in the approval dialog.
   */
  clearAll(): void {
    if (!this.newSchedule) return;
    this.newSchedule.preferredDay       = undefined;
    this.newSchedule.preferredStartTime = undefined;
    this.newSchedule.preferredEndTime   = undefined;
    this.newSchedule.room               = undefined;
    this.availableEndTimes = [...this.timeOptions];
    this.adminRemarks = '';
    this.conflictMessages = [];
  }

  /**
   * Normalizes an API error into a user-facing message.
   *
   * @param error The error object returned by the request.
   * @param defaultMessage The fallback message to use when the error is unclear.
   */
  private getErrorMessage(error: any, defaultMessage: string): string {
    // Handle different error response structures
    if (error?.status && error?.statusText) {
      // HttpErrorResponse with status
      if (error?.error?.message) return error.error.message;
      if (error?.error?.error) return error.error.error;
      if (typeof error?.error === 'string') return error.error;
      if (error?.message) return error.message;
    }
    
    // Handle plain error objects
    if (typeof error === 'string') return error;
    if (error?.message) return error.message;
    
    return defaultMessage;
  }

  approveAppeal(): void {
    if (!this.selectedAppeal || !this.newSchedule) return;

    this.conflictMessages = [];

    if (!this.cachedSchedules || !this.cachedRooms) {
      this.snackBar.open('Validation data is not ready. Please try again.', 'Close', { duration: 4000 });
      return;
    }

    const scheduleContext = this.getScheduleContext(this.selectedAppeal.scheduleId);
    if (!scheduleContext) {
      this.snackBar.open('Unable to locate schedule context for validation.', 'Close', { duration: 4000 });
      return;
    }

    const proposedRoomId = this.getRoomIdByCode(this.newSchedule.room ?? null);
    const validation = this.reschedulingService.validateAppealBeforeApproval(
      this.selectedAppeal.rawAppealId,
      this.newSchedule.preferredDay ?? '',
      this.newSchedule.preferredStartTime ?? '',
      this.newSchedule.preferredEndTime ?? '',
      proposedRoomId,
      this.cachedSchedules,
      this.cachedRooms,
      this.cachedArrangements,
      scheduleContext
    );

    if (validation.hasConflicts) {
      this.conflictMessages = validation.messages;
      return;
  /**
   * Approves the selected appeal after validating the proposed schedule.
   */
    }

    this.reschedulingService.approveAppeal(
      this.selectedAppeal.rawAppealId,
      {
        day:       this.newSchedule?.preferredDay       ?? '',
        startTime: this.newSchedule?.preferredStartTime ?? '',
        endTime:   this.newSchedule?.preferredEndTime   ?? '',
        room:      this.newSchedule?.room               ?? '',
      },
      this.adminRemarks
    ).subscribe({
      next: () => {
        this.snackBar.open('Appeal approved successfully.', 'Close', { duration: 5000 });

        this.reschedulingService.getAllAppeals().subscribe({
          next: (appeals) => {
            const mappedAppeals = appeals.map(a => this.mapAppeal(a));
            this.dataSource.data = mappedAppeals;
            this.cachedArrangements = this.buildArrangementOverrides(mappedAppeals);

            const approvedAppeals = mappedAppeals.filter(a => a.appealVerification === 'Approved');

            // ── Mutate in-place so the open dialog's array reference stays valid ──
            this.allFaculties.forEach(liveFac => {
              const facultyAppeals = approvedAppeals.filter(
                a => this.normalizeString(a.facultyName) === this.normalizeString(liveFac.facultyName));
              if (facultyAppeals.length === 0) return;

              liveFac.schedules.forEach((sched, index) => {
                const match = facultyAppeals.find(a => a.scheduleId === sched.schedule_id);
                if (!match) return;

                // Mutate the index in-place — do NOT replace the array itself
                liveFac.schedules[index] = {
                  ...sched,
                  day: match.preferredDay,
                  start_time: match.rawPreferredStartTime,
                  end_time: match.rawPreferredEndTime,
                  room_code: match.room || 'TBA',
                  course_details: {
                    ...sched.course_details,
                    course_title: sched.course_details.course_title.includes('(Internal Arrangement)')
                      ? sched.course_details.course_title
                      : `${sched.course_details.course_title} (Internal Arrangement)`
                  }
                };
              });
            });

            this.arrangementsDataSource.data = [...this.allFaculties];
            this.cdr.detectChanges();

            // Full server refresh in background
            if (this.selectedTermId) {
              this.loadArrangementsForTerm(this.selectedTermId, mappedAppeals);
            }
          }
        });

        this.closeDialog();
      },
      error: (err) => {
        const errorMessage = this.getErrorMessage(err, 'Failed to approve appeal');
        this.snackBar.open(errorMessage, 'Close', { duration: 5000 });
        console.error('Failed to approve appeal:', err);
      },
    });
  }

  /**
   * Denies the selected appeal and records the admin remarks.
   */
  denyAppeal(): void {
    if (!this.selectedAppeal) return;
    
    // We pass the adminRemarks to the backend so the email can explain WHY it was rejected
    this.reschedulingService.denyAppeal(this.selectedAppeal.rawAppealId, this.adminRemarks)
      .subscribe({
        next: () => { 
          this.updateLocalStatus(this.selectedAppeal!.id, 'Denied'); 
          this.closeDialog();
          
          // Show a richer snackbar confirming the email was sent
          this.snackBar.open('Appeal denied and notification email sent to faculty.', 'Close', { duration: 5000 });
        },
        error: (err) => {
          const errorMessage = this.getErrorMessage(err, 'Failed to deny appeal');
          this.snackBar.open(errorMessage, 'Close', { duration: 5000 });
          console.error('Failed to deny appeal:', err);
        },
      });
  }

  /**
   * Updates the local table row status after an appeal action completes.
   *
   * @param id The appeal row identifier.
   * @param status The new appeal status label.
   */
  private updateLocalStatus(id: number, status: string): void {
    this.dataSource.data = this.dataSource.data.map(row =>
      row.id === id ? { ...row, appealVerification: status } : row
    );
  }

  /**
   * Starts or stops speech recognition for the admin remarks field.
   */
  onSpeechRecognition(): void {
    if (!this.speechRecognitionService.isSupported()) {
      this.snackBar.open('Speech Recognition is not supported.', 'Close', { duration: 5000 });
      return;
    }

    if (this.isListening) {
      this.speechRecognitionService.stopListening();
      this.isListening = false;
      this.speechSession$.next();
      this.speechSession$.complete();
      this.speechSession$ = new Subject<void>();
      return;
    }

    this.speechSession$ = new Subject<void>();
    this.isListening = true;
    this.speechRecognitionService.startListening();

    this.speechRecognitionService.getTranscript()
      .pipe(takeUntil(this.speechSession$))
      .subscribe(result => {
        if (result.isFinal && result.transcript) {
          this.adminRemarks = (this.adminRemarks + ' ' + result.transcript).trim();
          this.cdr.markForCheck();
        }
      });

    this.speechRecognitionService.getError()
      .pipe(takeUntil(this.speechSession$))
      .subscribe(error => {
        this.isListening = false;
        this.snackBar.open(error, 'Close', { duration: 5000 });
        this.speechSession$.next();
        this.speechSession$.complete();
        this.cdr.markForCheck();
      });

    this.speechRecognitionService.getIsListening()
      .pipe(takeUntil(this.speechSession$))
      .subscribe(listening => {
        this.isListening = listening;
        this.cdr.markForCheck();
      });
  }

    /**
     * Emits a placeholder export action for the appeals table.
     */
  onExportAll(): void { console.log('Export all appeals', this.dataSource.data); }

    /**
     * Downloads the appeal document for the selected appeal.
     *
     * @param appealId The appeal identifier to download.
     * @param facultyName The faculty name used in the downloaded file name.
     */
  downloadAppealDocument(appealId: number | undefined, facultyName: string): void {
    if (!appealId) {
      this.snackBar.open('No valid appeal selected.', 'Close', { duration: 3000 });
      return;
    }

    this.snackBar.open('Downloading document...', 'Close', { duration: 2000 });

    // Use the secure Angular HTTP Client which automatically attaches your Auth token
    this.reschedulingService.downloadAppealDocument(appealId).subscribe({
      next: (blob: Blob) => {
        const cleanName = (facultyName || 'Faculty').replace(/[^a-zA-Z0-9]/g, '_');
        saveAs(blob, `${cleanName}_Appeal_Document.pdf`); // Triggers the actual download
      },
      error: (err) => {
        console.error('Download error:', err);
        this.snackBar.open('Failed to download document. You might be unauthorized or it was deleted.', 'Close', { duration: 3000 });
      }
    });
  }

  /** 
   * Normalizes a string by trimming whitespace and converting to lowercase.
   *
   * @param str The string value to normalize.
   */
  private normalizeString(str: string): string {
    return str?.trim().toLowerCase() || '';
  }
}
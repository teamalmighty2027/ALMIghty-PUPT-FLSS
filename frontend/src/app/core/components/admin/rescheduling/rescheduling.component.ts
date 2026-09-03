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
import { DialogArrangementCheckerComponent } from '../../../../shared/dialog-arrangement-checker/dialog-arrangement-checker.component';
import { DialogViewInternalArrangementsComponent } from '../../../../shared/dialog-view-internal-arrangements/dialog-view-internal-arrangements.component';

import { ReschedulingService, AppealResponse } from '../../../services/faculty/rescheduling/rescheduling.service';
import { SchedulingService } from '../../../services/admin/scheduling/scheduling.service';
import { SpeechRecognitionService } from '../../../services/speech/speech-recognition.service';
import { ReportsService } from '../../../services/admin/reports/reports.service';
import { ScheduleSyncService } from '../../../services/admin/sync/schedule-sync.service';
import { getFacultyTypeClass } from '../../../../shared/utils/faculty-type.utils';
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
  isRefreshing = false;
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
    private syncService: ScheduleSyncService,
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

    // Start auto refresh polling (15s)
    this.syncService.startAutoRefresh('rescheduling', 15000);
    this.syncService.refreshTrigger$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.refreshDataSilently();
      });

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
    this.syncService.stopAutoRefresh('rescheduling');

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
   * Silently re-fetches appeals and arrangements without full loading state.
   */
  public refreshDataSilently(): void {
    this.isRefreshing = true;
    this.reportsService.clearAllCaches();

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
        }
        this.isRefreshing = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Silent refresh failed:', err);
        this.isRefreshing = false;
      }
    });
  }

  /**
   * Triggers an immediate manual refresh.
   */
  onManualRefresh(): void {
    this.syncService.forceRefresh();
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
    course_id: number;
    schedule_id: number;
    program_id: number;
    year_level: number;
    section_id: number;
    faculty_id: number | null;
  } | null {
    if (!this.cachedSchedules) return null;

    const allSchedules = this.cachedSchedules.programs.flatMap((program) =>
      program.year_levels.flatMap((yearLevel) =>
        yearLevel.semesters.flatMap((semester) =>
          semester.sections.flatMap((section) =>
            section.courses.map(
              (course) => course.schedule).filter((s): s is any => !!s
            )
          )
        )
      )
    );

    const schedule = allSchedules.find((s) => s.schedule_id === scheduleId);
    if (schedule) {
      return {
        course_id: schedule.course_id,
        schedule_id: schedule.schedule_id,
        program_id: schedule.program_id,
        year_level: schedule.year_level,
        section_id: schedule.section_id,
        faculty_id: schedule.faculty_id ?? null,
      };
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
        const rawFaculties = facultiesReq?.faculty_schedule_reports?.faculties || [];

        rawFaculties.forEach((fac: any) => {
          const facultyAppeals = approvedAppeals.filter(a => 
            this.normalizeString(a.facultyName) === this.normalizeString(fac.faculty_name));

          const mergedSchedules = (fac.schedules || []).map((sched: any) => {
            const matchingAppeal = facultyAppeals.find(a => Number(a.scheduleId) === Number(sched.schedule_id));
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
    return getFacultyTypeClass(facultyType);
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
    // Master toggle is ON only if EVERY faculty is enabled and a deadline is set
    const allEnabled = this.allFaculties.every(f => !!f.isAppealEnabled);
    const hasDeadlineSet = this.allFaculties.some(f => !!f.appealEndDate);
    this.isAllAppealsEnabled = allEnabled && hasDeadlineSet;
  }

  /**
   * Opens the confirmation dialog for enabling or disabling all appeals.
   *
   * @param event The toggle event from the master switch.
   */
  toggleAllAppeals(event: any): void {
    // Keep switch in current state until user confirms in the dialog
    if (event?.source) {
      event.source.checked = this.isAllAppealsEnabled;
    }

    // Target state will be opposite of current master toggle state
    const isEnabled = !this.isAllAppealsEnabled;

    // Snapshot current states to safely revert if cancelled or failed
    const previousStates = this.allFaculties.map(f => ({
      facultyId: f.facultyId,
      isAppealEnabled: f.isAppealEnabled,
      hasAppealRequest: f.hasAppealRequest,
      appealStartDate: f.appealStartDate,
      appealEndDate: f.appealEndDate,
    }));

    const restorePreviousStates = () => {
      this.allFaculties.forEach(f => {
        const prev = previousStates.find(p => p.facultyId === f.facultyId);
        if (prev) {
          f.isAppealEnabled = prev.isAppealEnabled;
          f.hasAppealRequest = prev.hasAppealRequest;
          f.appealStartDate = prev.appealStartDate;
          f.appealEndDate = prev.appealEndDate;
        }
      });
      this.arrangementsDataSource.data = [...this.allFaculties];
      this.updateMasterToggleState();
      this.cdr.detectChanges();
    };

    // Grab existing dates from an enabled faculty member to show in dialog
    const activeFaculty = this.allFaculties.find(f => f.isAppealEnabled);

    const dialogRef = this.dialog.open(DialogToggleAppealsComponent, {
      width: '500px',
      data: { 
        type: 'all_appeals', 
        academicYear: this.academicYear, 
        semester: this.semester,
        currentState: this.isAllAppealsEnabled,
        startDate: activeFaculty?.appealStartDate 
          ? new Date(activeFaculty.appealStartDate) 
          : null,
        endDate: activeFaculty?.appealEndDate 
          ? new Date(activeFaculty.appealEndDate) 
          : null
      },
      disableClose: false,
      autoFocus: false
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        // Format dates for MySQL (YYYY-MM-DD HH:mm:ss)
        const formattedStart = result.startDate 
          ? formatDate(result.startDate, 'yyyy-MM-dd HH:mm:ss', 'en-US') 
          : undefined;
        const formattedEnd = result.endDate 
          ? formatDate(result.endDate, 'yyyy-MM-dd', 'en-US') + ' 23:59:59' 
          : undefined;

        // Optimistic update
        this.allFaculties.forEach(f => {
          f.isAppealEnabled = isEnabled;
          if (isEnabled) {
            f.hasAppealRequest = false;
            f.appealStartDate = formattedStart;
            f.appealEndDate = formattedEnd;
          } else {
            f.appealStartDate = null;
            f.appealEndDate = null;
          }
        });
        
        this.arrangementsDataSource.data = [...this.allFaculties];
        this.updateMasterToggleState();
        this.cdr.detectChanges();

        this.reschedulingService
          .toggleAllFacultyAppealAccess(
            isEnabled, 
            this.selectedTermId!, 
            formattedStart, 
            formattedEnd, 
            result.sendEmail
          )
          .subscribe({
            next: () => {
              const status = isEnabled ? 'scheduled' : 'disabled';
              this.snackBar.open(
                `Appeals ${status} for ALL faculty`, 
                'Close', 
                { duration: 3000 }
              );
              this.updateMasterToggleState();
              this.cdr.detectChanges();
              
              if (this.selectedTermId) {
                this.loadArrangementsForTerm(
                  this.selectedTermId, 
                  this.dataSource.data
                );
              }
            },
            error: () => {
              restorePreviousStates();
              this.snackBar.open(
                'Failed to update appeal access.', 
                'Close', 
                { duration: 3000 }
              );
            }
          });
      } else {
        // User cancelled dialog — revert toggle and individual states
        restorePreviousStates();
      }
    });
  }

  /**
   * Opens the Internal Arrangement Checker playground dialog.
   */
  openArrangementChecker(): void {
    if (!this.cachedSchedules || !this.cachedRooms) {
      this.snackBar.open('Schedule and room data loading... Please try again.', 'Close', { duration: 3000 });
      return;
    }

    const facultiesList = this.allFaculties.map(f => ({
      facultyId: f.facultyId,
      facultyName: f.facultyName
    }));

    const roomsList = this.cachedRooms.rooms || [];

    this.dialog.open(DialogArrangementCheckerComponent, {
      width: '680px',
      data: {
        cachedSchedules: this.cachedSchedules,
        cachedRooms: this.cachedRooms,
        cachedArrangements: this.cachedArrangements,
        faculties: facultiesList,
        rooms: roomsList,
      },
      autoFocus: false,
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

    // Keep switch in current state until user confirms in the dialog
    if (event?.source) {
      event.source.checked = faculty.isAppealEnabled;
    }

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
      disableClose: false,
      autoFocus: false
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        // Format dates for MySQL (YYYY-MM-DD HH:mm:ss)
        const formattedStart = result.startDate ? formatDate(result.startDate, 'yyyy-MM-dd HH:mm:ss', 'en-US') : undefined;
        const formattedEnd = result.endDate ? formatDate(result.endDate, 'yyyy-MM-dd', 'en-US') + ' 23:59:59' : undefined;

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

        if (event?.source) {
          event.source.checked = isEnabled;
        }

        // Immediately reflect the change in the table without waiting for the API
        this.arrangementsDataSource.data = [...this.allFaculties];
        this.updateMasterToggleState();
        this.cdr.detectChanges();

        this.reschedulingService.toggleFacultyAppealAccess(faculty.facultyId, isEnabled, this.selectedTermId!, formattedStart, formattedEnd, result.sendEmail)
          .subscribe({
            next: () => {
              const status = isEnabled ? 'scheduled' : 'disabled';
              this.snackBar.open(`Appeals ${status} for ${faculty.facultyName}`, 'Close', { duration: 3000 });
              faculty.isAppealEnabled = isEnabled;
              if (event?.source) {
                event.source.checked = isEnabled;
              }
              this.arrangementsDataSource.data = [...this.allFaculties];
              this.updateMasterToggleState();
              this.cdr.detectChanges();
            },
            error: () => {
              // Revert on API failure
              faculty.isAppealEnabled = !isEnabled;
              faculty.appealStartDate = null;
              faculty.appealEndDate = null;
              if (event?.source) {
                event.source.checked = faculty.isAppealEnabled;
              }
              this.arrangementsDataSource.data = [...this.allFaculties];
              this.updateMasterToggleState();
              this.cdr.detectChanges();
              this.snackBar.open('Failed to update appeal access.', 'Close', { duration: 3000 });
            }
          });
      } else {
        // User cancelled the dialog — revert the toggle visual state immediately
        if (event?.source) {
          event.source.checked = faculty.isAppealEnabled;
        }
        this.arrangementsDataSource.data = [...this.allFaculties];
        this.updateMasterToggleState();
        this.cdr.detectChanges();
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
              const matchingAppeal = facultyAppeals.find(a => Number(a.scheduleId) === Number(sched.schedule_id));
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

    this.dialog.open(DialogViewInternalArrangementsComponent, {
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
      disableClose: false,
      autoFocus: true,
    });
  }

  // Opens the timetable view dialog for a faculty's internal arrangements
  viewFacultyArrangements(faculty: FacultyArrangement): void {
    const liveFaculty =
      this.allFaculties.find((f) => f.facultyId === faculty.facultyId) ??
      faculty;

    const formattedName = liveFaculty.facultyName.replace(',', '').replace(/\s+/g, '_');
    const baseFileName = `${formattedName}_Arrangements_${liveFaculty.academicYear}_${liveFaculty.semester?.replace(/\s+/g, '_')}`;

    const dialogRef = this.dialog.open(
      DialogViewInternalArrangementsComponent,
      {
        maxWidth: '90vw',
        width: '100%',
        data: {
          facultyId: liveFaculty.facultyId,
          facultyName: liveFaculty.facultyName,
          facultyCode: liveFaculty.facultyCode,
          facultyType: liveFaculty.facultyType,
          schedules: liveFaculty.schedules,
          academicYear: liveFaculty.academicYear,
          semester: liveFaculty.semester,
          generatePdfFunction: () => this.createPdfBlob(liveFaculty),
          generateExcelFunction: async () => {
            const excelBlob = await this.generateArrangementExcelBlob(liveFaculty);
            saveAs(excelBlob, `${baseFileName}.xlsx`);
          },
          onScheduleUpdated: () => {
            if (this.selectedTermId) {
              this.reschedulingService.getAllAppeals().subscribe({
                next: (appeals) => {
                  const mappedAppeals = appeals.map((a) => this.mapAppeal(a));

                  this.loadArrangementsForTerm(
                    this.selectedTermId!,
                    mappedAppeals
                  );
                }
              });
            }
          }
        },
        disableClose: false,
        autoFocus: true
      }
    );

    dialogRef.afterClosed().subscribe((wasSaved: boolean) => {
      if (wasSaved && this.selectedTermId) {
        this.reschedulingService.getAllAppeals().subscribe({
          next: (appeals) => {
            const mappedAppeals = appeals.map((a) => this.mapAppeal(a));

            this.loadArrangementsForTerm(
              this.selectedTermId!,
              mappedAppeals
            );
          }
        });
      }
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
      disableClose: false,
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

  // Formats time plot type key for display
  getDisplayTypeName(type: string): string {
    switch (type) {
      case 'night_service': return 'Night Service';
      case 'official_time': return 'Official Time';
      case 'advising_time': return 'Advising Time';
      default: return type;
    }
  }

  /**
   * Builds one PDF document containing all internal arrangement pages.
   */
  generateAllSchedulesPdfBlob(): Blob {
    const doc = new jsPDF('landscape', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.width;
    const margin = 10;
    const topMargin = 15;
    const logoSize = 22;

    const facultiesWithSchedules = this.allFaculties.filter(
      f => f.schedules && f.schedules.length > 0
    );

    facultiesWithSchedules.forEach((faculty, index) => {
      if (index > 0) {
        this.reportHeaderService.addStandardFooter(doc);
        doc.addPage();
      }

      const title = `${faculty.facultyName}`;
      const subtitle = this.getAcademicYearSubtitle(faculty);

      let currentY = this.drawHeader(
        doc,
        topMargin,
        pageWidth,
        margin,
        logoSize,
        title,
        subtitle
      );

      this.drawScheduleTable(
        doc,
        faculty.schedules || [],
        title,
        subtitle,
        currentY,
        margin,
        pageWidth,
        []
      );
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
      const title = `${faculty.facultyName}`;
      const subtitle = this.getAcademicYearSubtitle(faculty);

      let currentY = this.drawHeader(
        doc,
        topMargin,
        pageWidth,
        margin,
        logoSize,
        title,
        subtitle
      );

      this.drawScheduleTable(
        doc,
        faculty.schedules || [],
        title,
        subtitle,
        currentY,
        margin,
        pageWidth,
        []
      );
    }

    this.reportHeaderService.addStandardFooter(doc);
    return doc.output('blob');
  }

  /**
   * Renders the shared PDF header and returns the next Y position.
   */
  private drawHeader(
    doc: jsPDF,
    startY: number,
    pageWidth: number,
    margin: number,
    logoSize: number,
    title: string,
    subtitle: string
  ): number {
    let currentY = startY;
    this.reportHeaderService
      .addHeader(doc, title, currentY, subtitle)
      .subscribe((newY) => {
        currentY = newY;
      });
    return currentY;
  }

  /**
   * Draws the schedule grid and schedule blocks for one PDF section.
   */
  private drawScheduleTable(
    doc: jsPDF,
    scheduleData: any[],
    title: string,
    subtitle: string,
    startY: number,
    margin: number,
    pageWidth: number,
    timePlots: any[] = []
  ): void {
    const hasSchedules =
      (scheduleData && scheduleData.length > 0) ||
      (timePlots && timePlots.length > 0);

    if (!hasSchedules) return;

    const days = [
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday'
    ];

    const timeColWidth = 22;
    const dayColumnWidth =
      (pageWidth - margin * 2 - timeColWidth) / days.length;
    const rowHeight = 8.5;

    const chunks = [
      { name: 'Morning (7:30 AM - 2:00 PM)', start: 450, end: 840 },
      { name: 'Afternoon (2:00 PM - 9:00 PM)', start: 840, end: 1260 }
    ];

    const activeChunks = chunks.filter(chunk => {
      const hasSched = scheduleData.some(s => {
        if (!s.start_time || !s.end_time || !s.day) return false;
        const sStart = this.timeToMinutes(s.start_time);
        const sEnd = this.timeToMinutes(s.end_time);
        return Math.max(sStart, chunk.start) < Math.min(sEnd, chunk.end);
      });

      const hasPlot = timePlots.some(p => {
        if (!p.start_time || !p.end_time || !p.day) return false;
        const pStart = this.timeToMinutes(p.start_time);
        const pEnd = this.timeToMinutes(p.end_time);
        return Math.max(pStart, chunk.start) < Math.min(pEnd, chunk.end);
      });

      return hasSched || hasPlot;
    });

    if (activeChunks.length === 0) return;

    let pageUsed = false;
    let currentY = startY;

    activeChunks.forEach(chunk => {
      if (pageUsed) {
        this.reportHeaderService.addStandardFooter(doc);
        doc.addPage();
        currentY = this.drawHeader(
          doc,
          15,
          pageWidth,
          margin,
          22,
          title,
          subtitle
        );
      }

      pageUsed = true;
      currentY -= 3;

      // --- 1. DRAW HEADERS ---
      const headerHeight = 7;
      const subHeaderHeight = 5;
      const totalHeaderHeight = headerHeight + subHeaderHeight;

      // Time Header
      doc.setFillColor(128, 0, 0);
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.5);
      doc.rect(margin, currentY, timeColWidth, totalHeaderHeight, 'FD');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(
        'Time',
        margin + timeColWidth / 2,
        currentY + (totalHeaderHeight / 2) + 1.5,
        { align: 'center' }
      );

      // Day Headers
      days.forEach((day, index) => {
        const xPos = margin + timeColWidth + index * dayColumnWidth;
        const subjColWidth = dayColumnWidth * 0.7;
        const roomColWidth = dayColumnWidth * 0.3;

        // Top row: Day name
        doc.setFillColor(128, 0, 0);
        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(0.5);
        doc.rect(xPos, currentY, dayColumnWidth, headerHeight, 'FD');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(
          day,
          xPos + dayColumnWidth / 2,
          currentY + 4.5,
          { align: 'center' }
        );

        // Bottom row: Subject sub-header
        doc.setFillColor(160, 20, 20);
        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(0.4);
        doc.rect(
          xPos,
          currentY + headerHeight,
          subjColWidth,
          subHeaderHeight,
          'FD'
        );
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.text(
          'Subject',
          xPos + subjColWidth / 2,
          currentY + headerHeight + 3.5,
          { align: 'center' }
        );

        // Bottom row: Room sub-header
        doc.setFillColor(160, 20, 20);
        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(0.4);
        doc.rect(
          xPos + subjColWidth,
          currentY + headerHeight,
          roomColWidth,
          subHeaderHeight,
          'FD'
        );
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.text(
          'Room',
          xPos + subjColWidth + roomColWidth / 2,
          currentY + headerHeight + 3.5,
          { align: 'center' }
        );
      });

      currentY += totalHeaderHeight;

      // --- 2. DRAW TIME GRID ---
      doc.setTextColor(0, 0, 0);
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.5);

      const chunkSlots = this.timeSlots.filter(
        s => s.minutes >= chunk.start && s.minutes < chunk.end
      );

      chunkSlots.forEach((slot, index) => {
        const yPos = currentY + index * rowHeight;
        const isTopRow = index === 0;

        if (!isTopRow) {
          doc.setDrawColor(200, 200, 200);
          doc.setLineWidth(0.5);
          doc.line(margin, yPos, pageWidth - margin, yPos);
        }

        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text(
          slot.time,
          margin + timeColWidth / 2,
          yPos + 5,
          { align: 'center' }
        );
      });

      const finalY = currentY + chunkSlots.length * rowHeight;
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.5);
      doc.line(margin, finalY, pageWidth - margin, finalY);

      doc.line(margin, currentY, margin, finalY);
      doc.line(margin + timeColWidth, currentY, margin + timeColWidth, finalY);
      days.forEach((_, index) => {
        const xPos = margin + timeColWidth + index * dayColumnWidth;
        const subjColWidth = dayColumnWidth * 0.7;
        doc.line(xPos + subjColWidth, currentY, xPos + subjColWidth, finalY);
        doc.line(xPos + dayColumnWidth, currentY, xPos + dayColumnWidth, finalY);
      });

      // --- 3. MERGE BLOCKS ---
      const mergedMap = new Map<string, any>();
      for (const item of scheduleData) {
        if (!item.start_time || !item.end_time || !item.day) continue;
        const key = `${item.day}|${item.start_time}|${item.end_time}`;
        if (mergedMap.has(key)) {
          const existing = mergedMap.get(key);
          if (!existing._mergedPrograms) {
            existing._mergedPrograms = [existing.program_code];
          }
          if (!existing._mergedPrograms.includes(item.program_code)) {
            existing._mergedPrograms.push(item.program_code);
          }
        } else {
          mergedMap.set(key, { ...item });
        }
      }

      const sortedScheduleData = [...mergedMap.values()].sort(
        (a, b) =>
          this.timeToMinutes(a.start_time) - this.timeToMinutes(b.start_time)
      );

      // PASS 1: Draw all block backgrounds
      sortedScheduleData.forEach(item => {
        const dayIndex = days.indexOf(item.day);
        if (dayIndex === -1) return;

        const cappedStart = Math.max(
          this.timeToMinutes(item.start_time),
          chunk.start
        );
        const cappedEnd = Math.min(
          this.timeToMinutes(item.end_time),
          chunk.end
        );
        if (cappedStart >= cappedEnd) return;

        const startSlot = chunkSlots.findIndex(
          slot => slot.minutes === cappedStart
        );
        if (startSlot === -1) return;

        const duration = Math.ceil((cappedEnd - cappedStart) / 30);
        const xPos = margin + timeColWidth + dayIndex * dayColumnWidth;
        const yPos = currentY + startSlot * rowHeight;
        const height = duration * rowHeight;
        const subjColWidth = dayColumnWidth * 0.7;
        const roomColWidth = dayColumnWidth * 0.3;

        doc.setFillColor(240, 240, 240);
        doc.setDrawColor(128, 0, 0);
        doc.setLineWidth(0.3);
        doc.rect(xPos, yPos, subjColWidth, height, 'FD');
        doc.rect(xPos + subjColWidth, yPos, roomColWidth, height, 'FD');
      });

      // PASS 1.5: Draw all block backgrounds (Time Plots)
      timePlots.forEach(plot => {
        const dayIndex = days.indexOf(plot.day);
        if (dayIndex === -1) return;

        const cappedStart = Math.max(
          this.timeToMinutes(plot.start_time),
          chunk.start
        );
        const cappedEnd = Math.min(
          this.timeToMinutes(plot.end_time),
          chunk.end
        );
        if (cappedStart >= cappedEnd) return;

        const startSlot = chunkSlots.findIndex(
          slot => slot.minutes === cappedStart
        );
        if (startSlot === -1) return;

        const duration = Math.ceil((cappedEnd - cappedStart) / 30);
        const xPos = margin + timeColWidth + dayIndex * dayColumnWidth;
        const yPos = currentY + startSlot * rowHeight;
        const height = duration * rowHeight;

        if (plot.time_type === 'night_service') {
          doc.setFillColor(227, 242, 253);
          doc.setDrawColor(21, 101, 192);
        } else if (plot.time_type === 'official_time') {
          doc.setFillColor(255, 243, 224);
          doc.setDrawColor(230, 81, 0);
        } else {
          doc.setFillColor(243, 245, 253);
          doc.setDrawColor(74, 20, 140);
        }

        doc.setLineWidth(0.3);
        doc.rect(xPos, yPos, dayColumnWidth, height, 'FD');
      });

      // PASS 2: Draw all text on top
      sortedScheduleData.forEach(item => {
        const dayIndex = days.indexOf(item.day);
        if (dayIndex === -1) return;

        const originalStart = this.timeToMinutes(item.start_time);
        const originalEnd = this.timeToMinutes(item.end_time);
        const cappedStart = Math.max(originalStart, chunk.start);
        const cappedEnd = Math.min(originalEnd, chunk.end);
        if (cappedStart >= cappedEnd) return;

        const startSlot = chunkSlots.findIndex(
          slot => slot.minutes === cappedStart
        );
        if (startSlot === -1) return;

        const duration = Math.ceil((cappedEnd - cappedStart) / 30);
        const xPos = margin + timeColWidth + dayIndex * dayColumnWidth;
        const yPos = currentY + startSlot * rowHeight;
        const height = duration * rowHeight;
        const subjColWidth = dayColumnWidth * 0.7;
        const roomColWidth = dayColumnWidth * 0.3;

        const lineSpacing = 3.8;
        const codeFontSize = 8.0;
        const textFontSize = 7.0;
        const timeFontSize = 6.5;
        const roomFontSize = 6.5;

        let programDisplay: string;
        if (item._mergedPrograms && item._mergedPrograms.length > 1) {
          programDisplay =
            item._mergedPrograms.sort().reverse().join('/') +
            ` ${item.year_level} - ${item.section_name}`;
        } else {
          programDisplay =
            `${item.program_code} ${item.year_level} - ${item.section_name}`;
        }

        const formatTime = (minutes: number): string => {
          const h = Math.floor(minutes / 60);
          const m = minutes % 60;
          const suffix = h >= 12 ? 'PM' : 'AM';
          const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
          return `${displayH}:${m.toString().padStart(2, '0')} ${suffix}`;
        };

        const timeRange =
          `${formatTime(originalStart)} - ${formatTime(originalEnd)}`;

        const content = [
          item.course_details?.course_code || '',
          item.course_details?.course_title || '',
          programDisplay,
          timeRange
        ].filter(line => line !== '');

        const fontSizes = [
          codeFontSize,
          textFontSize,
          textFontSize,
          timeFontSize
        ];
        const fontStyles = ['bold', 'normal', 'normal', 'normal'];

        const isBridging =
          item.course_details?.offering_type === 'bridging';

        if (isBridging) {
          const badgeLabel = 'Bridging';
          const badgeFontSize = duration <= 2 ? 5.5 : 6;
          const badgePaddingX = 2;
          const badgePaddingY = 1.5;
          doc.setFontSize(badgeFontSize);
          doc.setFont('helvetica', 'bold');
          const badgeTextWidth = doc.getTextWidth(badgeLabel);
          const badgeW = badgeTextWidth + badgePaddingX * 2;
          const badgeH = badgeFontSize * 0.45 + badgePaddingY * 2;
          const badgeX = xPos + (subjColWidth - badgeW) / 2;
          const badgeY = yPos + 1;
          doc.setFillColor(128, 0, 0);
          doc.setDrawColor(128, 0, 0);
          doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 1, 1, 'FD');
          doc.setTextColor(255, 255, 255);
          doc.text(
            badgeLabel,
            badgeX + badgePaddingX,
            badgeY + badgeH - badgePaddingY - 0.2
          );
          doc.setTextColor(0, 0, 0);
        }

        let totalSubjectLines = 0;
        content.forEach(line => {
          totalSubjectLines +=
            doc.splitTextToSize(line, subjColWidth - 4).length;
        });

        const totalSubjectHeight = (totalSubjectLines - 1) * lineSpacing;
        let subjectStartY = yPos + (height / 2) - (totalSubjectHeight / 2);
        if (isBridging) subjectStartY += 2;

        const minTopPadding = 3.5;
        const maxBottomBoundary = yPos + height - 3;
        subjectStartY = Math.max(subjectStartY, yPos + minTopPadding);

        content.forEach((line, idx) => {
          doc.setFontSize(fontSizes[idx] ?? textFontSize);
          doc.setFont('helvetica', fontStyles[idx] ?? 'normal');
          doc.setTextColor(idx === content.length - 1 ? 128 : 0, 0, 0);

          const wrappedLines = doc.splitTextToSize(line, subjColWidth - 4);
          wrappedLines.forEach((wLine: string) => {
            if (subjectStartY <= maxBottomBoundary) {
              doc.text(wLine, xPos + subjColWidth / 2, subjectStartY, {
                align: 'center',
                baseline: 'middle'
              });
            }
            subjectStartY += lineSpacing;
          });
        });

        doc.setTextColor(0, 0, 0);

        const roomText =
          item.room_code && item.room_code.trim() !== ''
            ? item.room_code
            : 'TBA';
        doc.setFontSize(roomFontSize);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);

        const wrappedRoom = doc.splitTextToSize(roomText, roomColWidth - 2);
        const roomLineSpacing = 3.2;
        const totalRoomHeight = (wrappedRoom.length - 1) * roomLineSpacing;
        let roomStartY = yPos + (height / 2) - (totalRoomHeight / 2);

        roomStartY = Math.max(roomStartY, yPos + 3.2);
        const maxRoomBoundary = yPos + height - 3;

        wrappedRoom.forEach((rLine: string) => {
          if (roomStartY <= maxRoomBoundary) {
            doc.text(rLine, xPos + subjColWidth + roomColWidth / 2, roomStartY, {
              align: 'center',
              baseline: 'middle'
            });
          }
          roomStartY += roomLineSpacing;
        });
      });

      // PASS 2.5: Draw all text on top (Time Plots)
      timePlots.forEach(plot => {
        const dayIndex = days.indexOf(plot.day);
        if (dayIndex === -1) return;

        const originalStart = this.timeToMinutes(plot.start_time);
        const originalEnd = this.timeToMinutes(plot.end_time);
        const cappedStart = Math.max(originalStart, chunk.start);
        const cappedEnd = Math.min(originalEnd, chunk.end);
        if (cappedStart >= cappedEnd) return;

        const startSlot = chunkSlots.findIndex(
          slot => slot.minutes === cappedStart
        );
        if (startSlot === -1) return;

        const duration = Math.ceil((cappedEnd - cappedStart) / 30);
        const xPos = margin + timeColWidth + dayIndex * dayColumnWidth;
        const yPos = currentY + startSlot * rowHeight;
        const height = duration * rowHeight;

        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');

        if (plot.time_type === 'night_service') {
          doc.setTextColor(21, 101, 192);
        } else if (plot.time_type === 'official_time') {
          doc.setTextColor(230, 81, 0);
        } else {
          doc.setTextColor(74, 20, 140);
        }

        const typeLabel =
          this.getDisplayTypeName(plot.time_type).toUpperCase();
        const timeRange =
          `${this.formatTime(plot.start_time)} - ` +
          `${this.formatTime(plot.end_time)}`;

        doc.text(
          typeLabel,
          xPos + dayColumnWidth / 2,
          yPos + (height / 2) - 1.5,
          { align: 'center', baseline: 'middle' }
        );

        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'normal');
        doc.text(
          timeRange,
          xPos + dayColumnWidth / 2,
          yPos + (height / 2) + 2.5,
          { align: 'center', baseline: 'middle' }
        );
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
      height: 'auto', disableClose: false,
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
      height: 'auto', disableClose: false,
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
                const match = facultyAppeals.find(a => Number(a.scheduleId) === Number(sched.schedule_id));
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
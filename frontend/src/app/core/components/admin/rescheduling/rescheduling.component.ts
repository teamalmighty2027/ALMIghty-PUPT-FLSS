import { Component, OnInit, AfterViewInit, ViewChild, TemplateRef, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
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

  ngOnInit(): void {
    this.reportsService.clearAllCaches();
    this.isInitLoading = true;
    this.isLoading = true;

    this.generateTimeSlots();

    forkJoin({
      appeals: this.reschedulingService.getAllAppeals(),
      terms: this.reportsService.getAllTermsForDropdown()
    }).subscribe({
      next: ({ appeals, terms }) => {
        this.appeals = appeals;
        const mappedAppeals = appeals.map(a => this.mapAppeal(a));
        this.dataSource.data = mappedAppeals;

        this.availableTerms = terms;
        const activeTerm = terms.find((term: any) => term.is_active === 1);
        if (activeTerm) {
          this.selectedTermId = activeTerm.active_semester_id;
          this.academicYear = `${activeTerm.year_start}-${activeTerm.year_end}`;
          this.semester = this.getSemesterDisplay(activeTerm.semester);
          if (this.selectedTermId !== null) {
            this.loadValidationCaches(mappedAppeals);
            this.loadArrangementsForTerm(this.selectedTermId, mappedAppeals);
          } else {
            this.isLoading = false;
            this.isInitLoading = false;
          }
        } else {
          this.isLoading = false;
          this.isInitLoading = false;
        }
      },
      error: (err) => {
        console.error('Failed to initialize rescheduling data:', err);
        this.isLoading = false;
        this.isInitLoading = false;
      }
    });

    this.generateTimeOptions();
  }

  ngAfterViewInit(): void {
    this.dataSource.paginator = this.paginator;
    this.arrangementsDataSource.paginator = this.arrangementsPaginator;
  }

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

  getSemesterDisplay(semester: number): string {
    switch (semester) {
      case 1: return '1st Semester';
      case 2: return '2nd Semester';
      case 3: return 'Summer Semester';
      default: return 'Unknown Semester';
    }
  }

  onTermChange() {
    const selected = this.availableTerms.find(t => t.active_semester_id === this.selectedTermId);
    if (selected) {
      this.academicYear = `${selected.year_start}-${selected.year_end}`;
      this.semester = this.getSemesterDisplay(selected.semester);
      this.loadData();
    }
  }

  loadData(): void {
    if (!this.selectedTermId) return;

    this.isLoading = true;
    const mappedAppeals = this.dataSource.data;
    this.loadValidationCaches(mappedAppeals);
    this.loadArrangementsForTerm(this.selectedTermId, mappedAppeals);
  }

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

  private getRoomIdByCode(roomCode: string | null | undefined): number | null {
    if (!roomCode || !this.cachedRooms) return null;
    const normalized = roomCode.trim().toLowerCase();
    if (!normalized) return null;

    const match = this.cachedRooms.rooms.find(
      (room) => room.room_code.toLowerCase() === normalized
    );
    return match?.room_id ?? null;
  }

  private loadArrangementsForTerm(termId: number, mappedAppeals: ReschedulingAppeal[]): void {
    this.reportsService.getFacultySchedulesReport(termId).subscribe({
      next: (facultiesReq) => {
        const approvedAppeals = mappedAppeals.filter(a => a.appealVerification === 'Approved');
        const rawFaculties = facultiesReq.faculty_schedule_reports.faculties;

        const mergedFaculties: FacultyArrangement[] = rawFaculties.map((fac: any) => {
          const facultyAppeals = approvedAppeals.filter(a => a.facultyName === fac.faculty_name);

          const mergedSchedules = (fac.schedules || []).map((sched: any) => {
            const matchingAppeal = facultyAppeals.find(a => a.courseTitle === sched.course_details.course_title);
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
            facultyId: fac.faculty_id,
            facultyName: fac.faculty_name,
            facultyCode: fac.faculty_code,
            facultyType: fac.faculty_type,
            facultyUnits: fac.assigned_units || fac.units || 0,
            schedules: mergedSchedules,
            academicYear: this.academicYear,
            semester: this.semester,
            isAppealEnabled: !!fac.is_appeal_enabled, 
            hasAppealRequest: !!fac.has_appeal_request
          };
        });

        this.allFaculties = mergedFaculties;
        this.arrangementsDataSource.data = mergedFaculties;
        this.updateMasterToggleState(); // Determine if master toggle should be on/off
        this.cdr.detectChanges();
        this.hasAnyArrangements = mergedFaculties.some(f => f.schedules.length > 0);

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

  onInputChange(event: any): void {
    const searchTerm = (event?.search || event?.value || '').trim().toLowerCase();
    this.dataSource.filter = searchTerm;
  }

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

  getRowIndex(i: number): number {
    const pageIndex = this.paginator ? this.paginator.pageIndex : 0;
    const pageSize  = this.paginator ? this.paginator.pageSize  : 25;
    return i + 1 + pageIndex * pageSize;
  }

  getArrangementRowIndex(i: number): number {
    const pageIndex = this.arrangementsPaginator ? this.arrangementsPaginator.pageIndex : 0;
    const pageSize  = this.arrangementsPaginator ? this.arrangementsPaginator.pageSize  : 25;
    return i + 1 + pageIndex * pageSize;
  }

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

  updateMasterToggleState(): void {
    if (this.allFaculties.length === 0) {
      this.isAllAppealsEnabled = false;
      return;
    }
    // Only turn master toggle ON if EVERY faculty is enabled
    this.isAllAppealsEnabled = this.allFaculties.every(f => f.isAppealEnabled);
  }

  toggleAllAppeals(event: any): void {
    const isEnabled = event.checked;
    
    // 1. Instantly revert the toggle visually. It only stays changed if they hit 'Confirm' in the dialog.
    event.source.checked = !isEnabled;

    const dialogRef = this.dialog.open(DialogToggleAppealsComponent, {
      width: '500px',
      data: { 
        type: 'all_appeals', 
        academicYear: this.academicYear, 
        semester: this.semester,
        currentState: !isEnabled // If they clicked to turn ON (isEnabled=true), the current state was OFF (false).
      },
      disableClose: true,
      autoFocus: false
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        // Optimistic update
        this.isAllAppealsEnabled = isEnabled;
        this.allFaculties.forEach(f => {
          f.isAppealEnabled = isEnabled;
          if (isEnabled) f.hasAppealRequest = false;
        });
        this.arrangementsDataSource.data = [...this.allFaculties];
        this.cdr.detectChanges();

        this.reschedulingService.toggleAllFacultyAppealAccess(isEnabled, this.selectedTermId!, result.startDate, result.endDate, result.sendEmail)
          .subscribe({
            next: () => {
              const status = isEnabled ? 'scheduled' : 'disabled';
              this.snackBar.open(`Appeals ${status} for ALL faculty`, 'Close', { duration: 3000 });
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

  toggleAppealAccess(faculty: FacultyArrangement, event: any): void {
    const isEnabled = event.checked;
    
    // Revert visually until confirmed
    event.source.checked = !isEnabled;

    const dialogRef = this.dialog.open(DialogToggleAppealsComponent, {
      width: '500px',
      data: { 
        type: 'single_appeal', 
        facultyName: faculty.facultyName, 
        academicYear: this.academicYear, 
        semester: this.semester,
        currentState: !isEnabled,
      },
      disableClose: true,
      autoFocus: false
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        faculty.isAppealEnabled = isEnabled;
        if (isEnabled) faculty.hasAppealRequest = false;

        this.reschedulingService.toggleFacultyAppealAccess(faculty.facultyId, isEnabled, this.selectedTermId!, result.startDate, result.endDate, result.sendEmail)
          .subscribe({
            next: () => {
              const status = isEnabled ? 'scheduled' : 'disabled';
              this.snackBar.open(`Appeals ${status} for ${faculty.facultyName}`, 'Close', { duration: 3000 });
              this.updateMasterToggleState();
            },
            error: () => {
              faculty.isAppealEnabled = !isEnabled;
              event.source.checked = !isEnabled;
              this.updateMasterToggleState();
              this.snackBar.open('Failed to update appeal access.', 'Close', { duration: 3000 });
            }
          });
      }
    });
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

  viewFacultyArrangements(faculty: FacultyArrangement): void {
    const generatePdfFunction = (): Blob | void => {
      return this.createPdfBlob(faculty);
    };

    const formattedName = faculty.facultyName.replace(',', '').replace(/\s+/g, '_');
    const baseFileName = `${formattedName}_Arrangements_${faculty.academicYear}_${faculty.semester?.replace(/\s+/g, '_')}`;

    this.dialog.open(DialogViewScheduleComponent, {
      maxWidth: '90vw',
      width: '100%',
      data: {
        exportType: 'single',
        entity: 'faculty',
        entityData: faculty.schedules,
        customTitle: `${faculty.facultyName}`,
        academicYear: faculty.academicYear,
        semester: faculty.semester,
        generatePdfFunction: generatePdfFunction,
        generateExcelFunction: async () => {
          const excelBlob = await this.generateArrangementExcelBlob(faculty);
          saveAs(excelBlob, `${baseFileName}.xlsx`);
        },
        previewMode: true,
      },
      disableClose: true,
      autoFocus: true,
    });
  }

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

  private async generateArrangementExcelBlob(faculty: FacultyArrangement): Promise<Blob> {
    const workbook = new ExcelJS.Workbook();
    const tabName = faculty.facultyName.split(',')[0].substring(0, 31).replace(/[^\w\s-]/gi, '');
    const worksheet = workbook.addWorksheet(tabName);
    this.applyArrangementExcelLayout(worksheet, faculty);
    const buffer = await workbook.xlsx.writeBuffer();
    return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

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

  private drawHeader(doc: jsPDF, startY: number, pageWidth: number, margin: number, logoSize: number, title: string, subtitle: string): number {
    let currentY = startY;
    this.reportHeaderService.addHeader(doc, title, currentY, subtitle).subscribe((newY) => {
        currentY = newY;
    });
    return currentY;
  }

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

        let textY = yPos + startPadding; 
        
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

  private formatTime(time: string): string {
    const [hours, minutes] = time.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const formattedHours = hours % 12 || 12;
    return `${formattedHours}:${minutes.toString().padStart(2, '0')} ${period}`;
  }

  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private formatTimeTo12Hour(time: string): string {
    return this.formatTime(time);
  }

  private getAcademicYearSubtitle(faculty: { academicYear?: string, semester?: string }): string {
    return `For Academic Year ${faculty.academicYear}, ${faculty.semester}`;
  }

  // ── Original Data mapping ──────────────────────────────────────────────────
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

  onScheduleFieldChange(): void {
    this.debounceValidation();
  }

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

  private updateAvailableEndTimes(startTime: string): void {
    const startIndex = this.timeOptions.indexOf(startTime);
    if (startIndex >= 0 && startIndex < this.timeOptions.length - 1) {
      this.availableEndTimes = this.timeOptions.slice(startIndex + 1);
    } else {
      this.availableEndTimes = [];
    }
  }

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
  openViewDialog(appeal: ReschedulingAppeal): void {
    this.selectedAppeal = { ...appeal };
    this.dialog.open(this.viewDialog, {
      width: '55%', maxWidth: '1000px', maxHeight: '90vh',
      height: 'auto', disableClose: true,
      panelClass: 'custom-dialog-container',
      autoFocus: true,
    });
  }

  openEditDialog(appeal: ReschedulingAppeal): void {
    this.selectedAppeal = { ...appeal };
    this.newSchedule = this.selectedAppeal.appealVerification !== 'Pending'
      ? { ...this.selectedAppeal }
      : { ...appeal, preferredDay: undefined, preferredStartTime: undefined, preferredEndTime: undefined, room: undefined };
    this.adminRemarks = '';
    this.conflictMessages = [];
    
    // Load room options
    this.loadRoomOptions();
    
    // Initialize available end times
    this.availableEndTimes = [...this.timeOptions];
    if (this.newSchedule?.preferredStartTime) {
      this.updateAvailableEndTimes(this.newSchedule.preferredStartTime);
    }
    
    this.dialog.open(this.appealDialog, {
      width: '55%', maxWidth: '1000px', maxHeight: '90vh',
      height: 'auto', disableClose: true,
      panelClass: 'custom-dialog-container',
      autoFocus: true,
    });
  }

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
        this.updateLocalStatus(this.selectedAppeal!.id, 'Approved');
        this.closeDialog();
        this.loadData(); // Reload both APIs to update the arrangements tab immediately
        this.snackBar.open('Appeal approved successfully.', 'Close', { duration: 5000 });
      },
      error: (err) => {
        const errorMessage = this.getErrorMessage(err, 'Failed to approve appeal');
        this.snackBar.open(errorMessage, 'Close', { duration: 5000 });
        console.error('Failed to approve appeal:', err);
      },
    });
  }

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

  private updateLocalStatus(id: number, status: string): void {
    this.dataSource.data = this.dataSource.data.map(row =>
      row.id === id ? { ...row, appealVerification: status } : row
    );
  }

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

  onExportAll(): void { console.log('Export all appeals', this.dataSource.data); }

  getFileUrl(filePath: string | null | undefined): string {
    if (!filePath) return '#';
    return `http://127.0.0.1:8000/storage/${filePath}`;
  }

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
}
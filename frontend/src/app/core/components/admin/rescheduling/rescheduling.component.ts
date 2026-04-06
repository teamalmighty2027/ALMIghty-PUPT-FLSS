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

import { LoadingComponent } from '../../../../shared/loading/loading.component';
import { TableHeaderComponent } from '../../../../shared/table-header/table-header.component';
import { ReportsHeaderComponent } from '../../../../shared/reports-header/reports-header.component';
import { DialogViewScheduleComponent } from '../../../../shared/dialog-view-schedule/dialog-view-schedule.component';
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
  facultyName: string;
  facultyCode: string;
  facultyType: string;
  facultyUnits: number;
  schedules: any[];
  academicYear?: string;
  semester?: string;
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
    ReportsHeaderComponent
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

  // ── Tab 2: Internal Arrangements ──
  arrangementsInputFields: any[] = [{ type: 'text', label: 'Search Faculty', key: 'search' }];
  arrangementsColumns: string[] = ['index', 'facultyName', 'facultyCode', 'facultyType', 'facultyUnits', 'action'];
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

  @ViewChild('viewDialog') viewDialog!: TemplateRef<any>;
  @ViewChild('appealDialog') appealDialog!: TemplateRef<any>;

  daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  timeOptions: string[] = [];
  roomOptions: string[] = [];
  availableEndTimes: string[] = [];

  isListening = false;
  speechSupported = false;
  private destroy$ = new Subject<void>();
  private speechSession$ = new Subject<void>();

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
            facultyName: fac.faculty_name,
            facultyCode: fac.faculty_code,
            facultyType: fac.faculty_type,
            facultyUnits: fac.assigned_units || fac.units || 0,
            schedules: mergedSchedules,
            academicYear: this.academicYear,
            semester: this.semester
          };
        });

        this.allFaculties = mergedFaculties;
        this.arrangementsDataSource.data = mergedFaculties;
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

  // ── PDF Export Methods ─────────────────────────────────────
  
  onExportArrangements(): void {
    if (this.allFaculties.length === 0) {
      this.snackBar.open('No active arrangements available to export.', 'Close', { duration: 3000 });
      return;
    }

    const generatePdfFunction = (): Blob | void => {
      return this.generateAllSchedulesPdfBlob();
    };

    this.dialog.open(DialogViewScheduleComponent, {
      maxWidth: '90vw',
      width: '100%',
      data: {
        exportType: 'all',
        entity: 'faculty',
        entityData: this.allFaculties.map(f => f.schedules).flat(),
        customTitle: 'All Internal Arrangements',
        fileName: `All_Internal_Arrangements_${this.academicYear}_${this.semester.replace(/\s+/g, '_')}`,
        academicYear: this.academicYear,
        semester: this.semester,
        generatePdfFunction: generatePdfFunction,
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
        previewMode: true,
      },
      disableClose: true,
      autoFocus: true,
    });
  }

  downloadFacultyArrangements(faculty: FacultyArrangement): void {
    const pdfBlob = this.createPdfBlob(faculty);
    const blobUrl = URL.createObjectURL(pdfBlob);
    const a = document.createElement('a');
    a.href = blobUrl;

    const academicYear = faculty.academicYear || '';
    const semester = faculty.semester || '';
    const formattedName = faculty.facultyName.replace(',', '').replace(/\s+/g, '_');

    a.download = `${formattedName}_Arrangements_${academicYear}_${semester.replace(/\s+/g, '_')}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
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
      let currentY = this.drawHeader(
        doc, topMargin, pageWidth, margin, logoSize,
        `${faculty.facultyName} Schedule`,
        this.getAcademicYearSubtitle(faculty)
      );
      this.drawScheduleTable(doc, faculty.schedules, currentY, margin, pageWidth, faculty.facultyName);
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
      let currentY = this.drawHeader(
        doc, topMargin, pageWidth, margin, logoSize,
        `${faculty.facultyName}`,
        this.getAcademicYearSubtitle(faculty)
      );
      this.drawScheduleTable(doc, faculty.schedules, currentY, margin, pageWidth, faculty.facultyName);
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

  private drawScheduleTable(doc: jsPDF, scheduleData: any[], startY: number, margin: number, pageWidth: number, facultyName: string): void {
    const hasSchedules = scheduleData && scheduleData.length > 0;

    if (!hasSchedules) {
      doc.setFontSize(20);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(128, 128, 128);
      doc.text('No Assigned Schedule', pageWidth / 2, startY + 50, { align: 'center' });
      return;
    }

    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const dayColumnWidth = (pageWidth - margin * 2) / days.length;
    const pageHeight = doc.internal.pageSize.height;
    const maxContentHeight = pageHeight - 20;

    let currentY = startY;
    let maxYPosition = currentY;

    const startNewPage = () => {
      this.reportHeaderService.addStandardFooter(doc);
      doc.addPage();
      currentY = this.drawHeader(
        doc, 15, pageWidth, margin, 22,
        doc.getNumberOfPages() > 1 ? 'Faculty Schedule (Continued)' : 'Faculty Schedule',
        this.getAcademicYearSubtitle({ academicYear: this.academicYear, semester: this.semester } as any)
      );
      days.forEach((day, index) => {
        const xPosition = margin + index * dayColumnWidth;
        doc.setFillColor(128, 0, 0); doc.setTextColor(255, 255, 255);
        doc.rect(xPosition, currentY, dayColumnWidth, 10, 'F');
        doc.setFontSize(10); doc.setFont('helvetica', 'bold');
        doc.text(day, xPosition + dayColumnWidth / 2, currentY + 7, { align: 'center' });
      });
      currentY += 12;
      return currentY;
    };

    days.forEach((day, index) => {
      const xPosition = margin + index * dayColumnWidth;
      doc.setFillColor(128, 0, 0); doc.setTextColor(255, 255, 255);
      doc.rect(xPosition, currentY, dayColumnWidth, 10, 'F');
      doc.setFontSize(10); doc.setFont('helvetica', 'bold');
      doc.text(day, xPosition + dayColumnWidth / 2, currentY + 7, { align: 'center' });
    });

    currentY += 12; 

    days.forEach((day, dayIndex) => {
      const xPosition = margin + dayIndex * dayColumnWidth;
      let yPosition = currentY;

      const daySchedule = scheduleData
        .filter((item: any) => item.day === day)
        .sort((a: any, b: any) => this.timeToMinutes(a.start_time) - this.timeToMinutes(b.start_time));

      if (daySchedule.length > 0) {
        daySchedule.forEach((item: any) => {
          const courseContent = [
            item.course_details.course_code,
            item.course_details.course_title,
            `${item.program_code} ${item.year_level} - ${item.section_name}`,
            item.room_code && item.room_code.trim() !== '' ? item.room_code : 'TBA',
            `${this.formatTime(item.start_time)} - ${this.formatTime(item.end_time)}`,
          ];

          const boxHeight = this.calculateBoxHeight(doc, courseContent, dayColumnWidth);

          if (yPosition + boxHeight > maxContentHeight) {
            days.forEach((_, i) => {
              const lineX = margin + i * dayColumnWidth;
              doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.5);
              doc.line(lineX, startY, lineX, maxYPosition);
            });
            doc.line(pageWidth - margin, startY, pageWidth - margin, maxYPosition);
            yPosition = startNewPage();
            maxYPosition = yPosition;
          }

          doc.setFillColor(240, 240, 240);
          doc.rect(xPosition, yPosition, dayColumnWidth, boxHeight, 'F');

          let textYPosition = yPosition + 5;
          courseContent.forEach((line: string, index) => {
            doc.setTextColor(0); doc.setFontSize(9);
            doc.setFont(index <= 1 ? 'helvetica' : 'helvetica', index <= 1 ? 'bold' : 'normal');

            const wrappedLines = doc.splitTextToSize(line, dayColumnWidth - 10);
            wrappedLines.forEach((wrappedLine: string) => {
              doc.text(wrappedLine, xPosition + 5, textYPosition); textYPosition += 5;
            });

            if (index === courseContent.length - 1) {
              const timeTextWidth = doc.getTextWidth(line);
              doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.2);
              doc.line(xPosition + 5, textYPosition - 4, xPosition + 5 + timeTextWidth, textYPosition - 4);
            }
          });

          yPosition += boxHeight + 5;
          if (yPosition > maxYPosition) maxYPosition = yPosition;
        });
      }
    });

    days.forEach((_, i) => {
      const lineX = margin + i * dayColumnWidth;
      doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.5);
      doc.line(lineX, startY, lineX, maxYPosition);
    });
    doc.line(pageWidth - margin, startY, pageWidth - margin, maxYPosition);
    doc.line(margin, maxYPosition, pageWidth - margin, maxYPosition);
    
    // (Prepared By text deleted!)
  }


  private calculateBoxHeight(doc: jsPDF, content: string[], columnWidth: number): number {
    const padding = 10;
    let totalHeight = 5;
    content.forEach((line: string, index: number) => {
      doc.setFontSize(9);
      doc.setFont('helvetica', index <= 1 ? 'bold' : 'normal');
      const wrappedLines = doc.splitTextToSize(line, columnWidth - padding);
      totalHeight += wrappedLines.length * 5;
    });
    return totalHeight + 5;
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

  private getAcademicYearSubtitle(faculty: FacultyArrangement): string {
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
    this.dialog.closeAll();
    this.selectedAppeal = null;
    this.newSchedule    = null;
    this.adminRemarks   = '';
  }

  clearAll(): void {
    if (!this.newSchedule) return;
    this.newSchedule.preferredDay       = undefined;
    this.newSchedule.preferredStartTime = undefined;
    this.newSchedule.preferredEndTime   = undefined;
    this.newSchedule.room               = undefined;
    this.availableEndTimes = [...this.timeOptions];
    this.adminRemarks = '';
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
    if (!this.selectedAppeal) return;
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
    this.reschedulingService.denyAppeal(this.selectedAppeal.rawAppealId, this.adminRemarks)
      .subscribe({
        next: () => { 
          this.updateLocalStatus(this.selectedAppeal!.id, 'Denied'); 
          this.closeDialog();
          this.snackBar.open('Appeal denied successfully.', 'Close', { duration: 5000 });
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
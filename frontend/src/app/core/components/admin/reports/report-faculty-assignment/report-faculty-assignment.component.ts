import { Component, OnInit, ViewChild, AfterViewInit, AfterViewChecked, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil, filter } from 'rxjs/operators';

import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSymbolDirective } from '../../../../imports/mat-symbol.directive';

import { InputField } from '../../../../../shared/table-header/table-header.component';
import { ReportsHeaderComponent } from '../../../../../shared/reports-header/reports-header.component';
import { LoadingComponent } from '../../../../../shared/loading/loading.component';
import { DialogExportComponent } from '../../../../../shared/dialog-export/dialog-export.component';
import { DialogViewScheduleComponent } from '../../../../../shared/dialog-view-schedule/dialog-view-schedule.component';

import { ReportsService } from '../../../../services/admin/reports/reports.service';
import { fadeAnimation } from '../../../../animations/animations';
import { getFacultyTypeClass } from '../../../../../shared/utils/faculty-type.utils';

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AcademicYearService } from '../../../../services/admin/academic-year/academic-year.service';

@Component({
  selector: 'app-report-faculty-assignment',
  standalone: true,
  imports: [
    CommonModule,
    LoadingComponent,
    MatTableModule,
    MatPaginatorModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MatDialogModule,
    MatSymbolDirective,
    ReportsHeaderComponent
  ],
  templateUrl: './report-faculty-assignment.component.html',
  styleUrls: ['./report-faculty-assignment.component.scss'],
  animations: [fadeAnimation]
})
export class ReportFacultyAssignmentComponent implements OnInit, AfterViewInit, AfterViewChecked, OnDestroy {
  inputFields: InputField[] = [
    { type: 'text', label: 'Search Faculty', key: 'search' },
  ];

  displayedColumns: string[] = [
    'index',
    'facultyName',
    'facultyCode',
    'facultyType',
    'facultyUnits',
    'maxLoad',
    'action',
  ];

  dataSource = new MatTableDataSource<any>();
  filteredData: any[] = [];
  
  isLoading = true;
  isTermsLoading = true;
  hasAnySchedules = false;
  selectedTermId: number | null = null;
  availableTerms: any[] = [];

  academicYearLabel = '';
  semesterLabel = '';
  effectivityDate = ''; 
  activeTermStartDate = '';

  private searchInput$ = new Subject<string>();
  private destroy$ = new Subject<void>();

  @ViewChild(MatPaginator) paginator!: MatPaginator;

  constructor(
    private reportsService: ReportsService,
    private academicYearService: AcademicYearService,
    public dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.academicYearService.getActiveYearAndSemester().subscribe({
      next: (res: any) => {
        this.activeTermStartDate = res.startDate;
        this.updateEffectivityDate();
      }
    });

    this.reportsService.selectedTerm$
      .pipe(takeUntil(this.destroy$), filter((termId) => termId !== null))
      .subscribe((termId) => { 
        this.selectedTermId = termId;
        this.updateEffectivityDate();
        this.fetchFacultyData(termId); 
      });

    this.loadTerms();

    this.searchInput$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((searchQuery) => { this.performSearch(searchQuery); });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngAfterViewInit() { this.dataSource.paginator = this.paginator; }
  ngAfterViewChecked() { if (this.dataSource.paginator !== this.paginator) this.dataSource.paginator = this.paginator; }

  loadTerms() {
    this.isTermsLoading = true;
    this.reportsService.getAllTermsForDropdown().subscribe({
      next: (data) => {
        this.availableTerms = data;
        const currentTermId = this.reportsService.getSelectedTerm();
        const hasCurrentTerm = currentTermId !== null && data.some((term) => term.active_semester_id === currentTermId);
        
        if (hasCurrentTerm) {
          this.selectedTermId = currentTermId;
        } else {
          const activeTerm = data.find((term) => term.is_active === 1);
          if (activeTerm) {
            this.selectedTermId = activeTerm.active_semester_id;
            this.onTermChange();
          }
        }
        this.isTermsLoading = false;
        this.updateEffectivityDate();
      },
      error: (error) => {
        this.isTermsLoading = false; this.isLoading = false;
        console.error('Error loading terms:', error);
      },
    });
  }

  onTermChange() { 
    this.reportsService.setSelectedTerm(this.selectedTermId); 
    this.updateEffectivityDate();
  }

  updateEffectivityDate() {
    const term = this.availableTerms.find(t => t.active_semester_id === this.selectedTermId);
    const termStartDate = term?.start_date || term?.startDate;

    if (termStartDate) {
      this.effectivityDate = this.formatDateString(termStartDate);
    } else if (term && term.is_active === 1 && this.activeTermStartDate) {
      this.effectivityDate = this.formatDateString(this.activeTermStartDate);
    } else {
      this.effectivityDate = ''; 
    }
  }

  fetchFacultyData(termId: number | null = null): void {
    this.isLoading = true;
    this.reportsService.getFacultySchedulesReport(termId).subscribe({
      next: (res) => {
        const report = res.faculty_schedule_reports;
        this.academicYearLabel = `${report.year_start}-${report.year_end}`;
        this.semesterLabel = this.getSemesterName(report.semester);
        
        // ADD THIS MAPPING: Ensure assignmentType is initialized for the dropdowns
        const facultyData = report.faculties.map((f: any) => {
          if (f.schedules) {
            f.schedules = f.schedules.map((s: any) => ({
              ...s,
              assignmentType: s.assignment_type || 'Regular Load' // Default to Regular Load
            }));
          }
          return f;
        });

        this.hasAnySchedules = facultyData.some((faculty: any) => faculty.schedules && faculty.schedules.length > 0);
        this.dataSource.data = facultyData;
        this.filteredData = [...facultyData];
        this.dataSource.paginator = this.paginator;
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error fetching faculty data:', err);
        this.isLoading = false;
      }
    });
  }

  getSemesterName(semester: number | string): string {
    if (semester == 1) return 'First Semester';
    if (semester == 2) return 'Second Semester';
    if (semester == 3) return 'Summer Semester';
    return `${semester} Semester`;
  }

  onInputChange(changes: { [key: string]: any }) {
    const searchQuery = changes['search'] ? changes['search'].trim().toLowerCase() : '';
    this.searchInput$.next(searchQuery);
  }

  performSearch(searchQuery: string) {
    if (searchQuery === '') {
      this.dataSource.data = this.filteredData;
    } else {
      this.dataSource.data = this.filteredData.filter(
        (faculty) =>
          faculty.faculty_name.toLowerCase().includes(searchQuery) ||
          faculty.faculty_code.toLowerCase().includes(searchQuery) ||
          faculty.faculty_type.toLowerCase().includes(searchQuery)
      );
    }
  }

  getRowIndex(index: number): number {
    return this.paginator ? index + 1 + this.paginator.pageIndex * this.paginator.pageSize : index + 1;
  }

  getFacultyTypeClass(facultyType: string): Record<string, boolean> {
    return getFacultyTypeClass(facultyType);
  }

  updateDisplayedData() {}

  hasSchedules(faculty: any): boolean {
      return faculty.schedules && faculty.schedules.length > 0;
  }

  // --- MODAL AND EXPORT LOGIC ---

  onView(faculty: any): void {
    const dayOrder: Record<string, number> = { 
      'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6, 'Sunday': 7 
    };

    // Always work off the latest data by ID, not the row's captured reference
    const facultyId = faculty.faculty_id;

    const getLatestFaculty = () => this.filteredData.find(f => f.faculty_id === facultyId) || faculty;

    const currentFaculty = getLatestFaculty();

    if (currentFaculty.schedules) {
      currentFaculty.schedules.forEach((s: any) => {
        s.assignmentType = s.assignmentType || s.assignment_type || 'Regular Load';
      });

      currentFaculty.schedules.sort((a: any, b: any) => {
        const dayA = dayOrder[a.day] || 99;
        const dayB = dayOrder[b.day] || 99;
        if (dayA !== dayB) return dayA - dayB;
        return this.timeToMinutes(a.start_time) - this.timeToMinutes(b.start_time);
      });
    }

    const dialogRef = this.dialog.open(DialogViewScheduleComponent, {
      maxWidth: '95vw',
      width: '95vw',
      height: 'auto',
      maxHeight: '95vh',
      panelClass: 'pdf-fullscreen-dialog',
      autoFocus: true, 
      data: {
        exportType: 'single', 
        entity: 'faculty', 
        entityData: currentFaculty.schedules, 
        customTitle: `${currentFaculty.faculty_name}`, 
        academicYear: this.academicYearLabel, 
        semester: this.semesterLabel,
        showViewToggle: false,
        showAssignmentSummary: true, 
        generatePdfFunction: (preview: boolean, currentDialogData?: any[]) => {
          // Always re-fetch latest faculty at generation time too
          const latest = getLatestFaculty();
          if (currentDialogData) {
            latest.schedules = [...currentDialogData]; 
          }
          return this.generateAssignmentPdfBlob(latest);
        }
      },
    });

    dialogRef.afterClosed().subscribe((wasSaved: boolean) => {
      if (wasSaved) {
        this.reportsService.clearCache('faculty');
        this.fetchFacultyData(this.selectedTermId);
      }
    });
  }

  onExportSingle(faculty: any): void {
    const facultyId = faculty.faculty_id;
    const getLatestFaculty = () => this.filteredData.find(f => f.faculty_id === facultyId) || faculty;

    const baseFileName = `${faculty.faculty_name.replace(/\s+/g, '_')}_Assignment_SY_${this.academicYearLabel}`;
    this.dialog.open(DialogExportComponent, {
      width: '90vw', maxWidth: '1200px',
      data: {
        exportType: 'single', customTitle: faculty.faculty_name,
        subtitle: `For Academic Year ${this.academicYearLabel}, ${this.semesterLabel}`,
        generatePdfFunction: () => this.generateAssignmentPdfBlob(getLatestFaculty()),
        generateFileNameFunction: () => `${baseFileName}.pdf`
      }
    });
  }

  onExportAll(): void {
    if (this.filteredData.length === 0) {
      this.snackBar.open('No faculty data available to export.', 'Close', { duration: 3000 });
      return;
    }
    const baseFileName = `All_Faculty_Assignments_${this.academicYearLabel}_${this.semesterLabel.replace(/\s+/g, '_')}`;
    this.dialog.open(DialogExportComponent, {
      width: '90vw', maxWidth: '1200px',
      data: {
        exportType: 'all', customTitle: 'All Faculty Assignments',
        subtitle: `For Academic Year ${this.academicYearLabel}, ${this.semesterLabel}`,
        generatePdfFunction: () => this.generateAllAssignmentsPdfBlob(),
        generateFileNameFunction: () => `${baseFileName}.pdf`
      }
    });
  }

  // --- HELPER LOGIC: REGULAR VS PART-TIME & MERGING MULTIPLE DAYS ---

  private mergeSchedules(schedules: any[]): any[] {
    if (!schedules || !Array.isArray(schedules)) return [];
    
    const dayOrder: Record<string, number> = { 'M': 1, 'T': 2, 'W': 3, 'TH': 4, 'F': 5, 'S': 6, 'SU': 7 };

    // STEP 1: Group by Course + Section to aggregate all blocks for a single class instance
    const sectionMap = new Map();

    schedules.forEach(sched => {
      const courseCode = sched.course_details?.course_code || 'UNKNOWN';
      const cleanProgram = (sched.program_code || '').replace('-TG', '');
      const sectionKey = `${courseCode}_${cleanProgram}_${sched.year_level}_${sched.section_name}`;

      if (!sectionMap.has(sectionKey)) {
        sectionMap.set(sectionKey, { ...sched, _rawSchedules: [sched] });
      } else {
        sectionMap.get(sectionKey)._rawSchedules.push(sched);
      }
    });

    // STEP 2: Use Physical Schedule Signatures to definitively identify combined classes
    const combinedMap = new Map();

    sectionMap.forEach((sectionData, sectionKey) => {
      
      // Create a unique, order-independent signature of all physical schedule blocks for this section
      const physicalBlocks = sectionData._rawSchedules.map((raw: any) => {
          return `${this.mapDayCode(raw.day) || 'TBA'}_${raw.start_time || 'TBA'}_${raw.end_time || 'TBA'}`;
      });
      physicalBlocks.sort(); // Ensure order doesn't prevent matching
      const scheduleSignature = physicalBlocks.join('|');

      // The definitive grouping key: Same Course + Exact same times/days.
      const combinedKey = `${sectionData.course_details?.course_code}_${scheduleSignature}`;

      const cleanProgram = (sectionData.program_code || '').replace('-TG', '');
      const isExplicitlyCombined = sectionData.combined_with_program_id != null || sectionData.is_combined || cleanProgram.includes('/');

      if (!combinedMap.has(combinedKey)) {
        sectionData.is_combined = isExplicitlyCombined;
        combinedMap.set(combinedKey, sectionData);
      } else {
        // Dynamic match! Two different programs share the exact same course and physical schedules.
        // Merge them and force the combined flag to render 1TGBRANCH correctly.
        const existing = combinedMap.get(combinedKey);
        existing.is_combined = true; 
        existing._rawSchedules.push(...sectionData._rawSchedules);
      }
    });

    // STEP 3: Format the time/day pairings properly for the PDF display
    return Array.from(combinedMap.values()).map((mergedData: any) => {
      
      // Deduplicate the raw schedules internally so merged classes don't print double times
      const uniquePhysicalSchedules = new Map();
      mergedData._rawSchedules.forEach((raw: any) => {
          const key = `${this.mapDayCode(raw.day)}_${raw.start_time}_${raw.end_time}_${raw.room_code}`;
          if (!uniquePhysicalSchedules.has(key)) {
              uniquePhysicalSchedules.set(key, raw);
          }
      });
      
      const uniqueSchedulesArray = Array.from(uniquePhysicalSchedules.values());

      // Sort unique schedules by day first, then by start time
      uniqueSchedulesArray.sort((a: any, b: any) => {
        const dayA = dayOrder[this.mapDayCode(a.day)] || 99;
        const dayB = dayOrder[this.mapDayCode(b.day)] || 99;
        if (dayA !== dayB) return dayA - dayB;
        return (a.start_time || '').localeCompare(b.start_time || '');
      });

      // Group exactly by Time + Room blocks
      const timeBlocks = new Map();

      uniqueSchedulesArray.forEach((raw: any) => {
        const t = (raw.start_time && raw.end_time) ? `${this.formatTime(raw.start_time)}-${this.formatTime(raw.end_time)}` : 'TBA';
        const d = this.mapDayCode(raw.day) || 'TBA';
        const r = (raw.room_code || '').replace(/^TG/, '') || 'TBA';

        const blockKey = `${t}_${r}`;

        if (!timeBlocks.has(blockKey)) {
          timeBlocks.set(blockKey, { time: t, room: r, days: [d] });
        } else {
          if (!timeBlocks.get(blockKey).days.includes(d)) {
             timeBlocks.get(blockKey).days.push(d);
          }
        }
      });

      // Assemble the final display strings
      const displayTimes: string[] = [];
      const displayDays: string[] = [];
      const displayRooms: string[] = [];

      timeBlocks.forEach(block => {
        displayTimes.push(block.time);
        displayDays.push(block.days.join('')); // Combines MTW without slashes
        displayRooms.push(block.room);
      });

      // Join different time blocks with a slash (/)
      mergedData._displayTime = displayTimes.join('/');
      mergedData._displayDay = displayDays.join('/');

      // Check if every room mapped to these time slots is exactly the same. 
      const allSameRoom = displayRooms.length > 0 && displayRooms.every(r => r === displayRooms[0]);
      mergedData._displayRoom = allSameRoom ? (displayRooms[0] || 'TBA') : displayRooms.join('/');

      return mergedData;
    });
  }

  // Calculates the total teaching hours for a merged schedule row.
  getRowHours(row: any): number {
    if (!row._rawSchedules || row._rawSchedules.length === 0) {
      const tuition = Number(row.course_details?.tuition_hours);
      const units = Number(row.course_details?.units || 0);
      return tuition > 0 ? tuition : units;
    }

    const uniquePhysicalSchedules = new Map();
    row._rawSchedules.forEach((rawSched: any) => {
      const physicalKey = `${rawSched.day}_${rawSched.start_time}_${rawSched.end_time}`;
      if (!uniquePhysicalSchedules.has(physicalKey)) {
        uniquePhysicalSchedules.set(physicalKey, rawSched);
      }
    });

    let totalHours = 0;
    uniquePhysicalSchedules.forEach((rawSched: any) => {
      let diff = this.getHoursDiff(rawSched.start_time, rawSched.end_time);
      if (isNaN(diff) || diff <= 0) {
        const tuition = Number(rawSched.course_details?.tuition_hours);
        const units = Number(rawSched.course_details?.units || 0);
        diff = tuition > 0 ? tuition : units;
      }
      totalHours += diff;
    });

    return totalHours;
  }

  // Splits faculty schedules into regular and part-time load based on weekly hours.
  getSplitSchedules(
    facultyType: string,
    schedules: any[],
    regularUnitsAllowed: number = 15
  ) {
    const regular: any[] = [];
    const partTime: any[] = [];
    const tempSub: any[] = [];
    let currentHours = 0;

    const isSummerSemester = (this.semesterLabel || '')
      .toLowerCase().includes('summer');
    const isPartTimeFaculty = (facultyType || '')
      .toLowerCase().includes('part-time') || isSummerSemester;

    schedules.forEach((sched: any) => {
      // Look at the assignmentType changed from the UI
      const type = sched.assignment_type || sched.assignmentType || 'Regular Load';
      const hours = this.getRowHours(sched);

      if (type === 'Part Time') {
        partTime.push(sched);
      } else if (type === 'Temporary Substitution') {
        tempSub.push(sched);
      } else {
        regular.push(sched);
        if (currentHours + hours <= regularUnitsAllowed) {
          regular.push(sched);
          currentHours += hours;
        } else {
          partTime.push(sched);
        }
      }
    });
    
    return { regular, partTime, tempSub };
  }

  getTotalHours(schedules: any[]): number {
    return schedules.reduce(
      (acc, curr) => acc + this.getRowHours(curr),
      0
    );
  }

  // --- HELPER LOGIC: TIME AND DAYS ---

  private timeToMinutes(time: string): number {
    if (!time) return 0;
    const parts = time.split(':');
    if (parts.length < 2) return 0;
    const hours = Number(parts[0]);
    const minutes = Number(parts[1]);
    return (hours * 60) + minutes;
  }

  private formatDateString(dateString: string): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    const y = date.getFullYear();
    return `${m}/${d}/${y}`;
  }

  private formatTime(time: string): string {
    if (!time) return '';
    const parts = time.split(':');
    if (parts.length < 2) return '';
    const hours = Number(parts[0]);
    const minutes = Number(parts[1]);
    const period = hours >= 12 ? 'PM' : 'AM';
    const formattedHours = hours % 12 || 12;
    return `${formattedHours}:${minutes.toString().padStart(2, '0')}${period}`;
  }

  private getHoursDiff(startTime: string, endTime: string): number {
    if (!startTime || !endTime) return 0;
    try {
      const parseTime = (t: string) => {
        const parts = t.split(':');
        if (parts.length < 2) return NaN;
        return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
      };
      const startMins = parseTime(startTime);
      const endMins = parseTime(endTime);
      if (isNaN(startMins) || isNaN(endMins)) return 0;
      
      const diff = (endMins - startMins) / 60;
      return diff > 0 ? diff : 0;
    } catch {
      return 0;
    }
  }

  private mapDayToCol(day: string): string {
    const d = (day || '').trim().toLowerCase();
    if (d.startsWith('mo')) return 'MON';
    if (d.startsWith('tu')) return 'TUE';
    if (d.startsWith('we')) return 'WED';
    if (d.startsWith('th')) return 'THUR';
    if (d.startsWith('fr')) return 'FRI';
    if (d.startsWith('sa')) return 'SAT';
    if (d.startsWith('su')) return 'SUN';
    return '';
  }

  private mapDayCode(day: string): string {
    const d = (day || '').trim().toLowerCase();
    if (d.startsWith('mo')) return 'M';
    if (d.startsWith('tu')) return 'T';
    if (d.startsWith('we')) return 'W';
    if (d.startsWith('th')) return 'TH';
    if (d.startsWith('fr')) return 'F';
    if (d.startsWith('sa')) return 'S';
    if (d.startsWith('su')) return 'SU';
    return '';
  }

  // --- PDF GENERATION (OVPAA Form No. 1) ---

  private generateAllAssignmentsPdfBlob(): Blob {
    const doc = new jsPDF('p', 'mm', 'letter');
    let isFirst = true;

    this.filteredData.forEach((faculty) => {
      if (faculty.schedules && faculty.schedules.length > 0) {
        if (!isFirst) doc.addPage();
        this.drawOVPAAForm(doc, faculty);
        isFirst = false;
      }
    });
    return doc.output('blob');
  }

  private generateAssignmentPdfBlob(faculty: any): Blob {
    const doc = new jsPDF('p', 'mm', 'letter');
    this.drawOVPAAForm(doc, faculty);
    return doc.output('blob');
  }

  private drawOVPAAForm(doc: jsPDF, faculty: any) {
    // 1. HEADER
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text('OVPAA Form No. 1\nApril, 1989', 14, 15);

    doc.setFontSize(10);
    doc.text('Polytechnic University of the Philippines\nSta. Mesa, Manila', 105, 15, { align: 'center' });

    doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.text('FACULTY ASSIGNMENT', 105, 24, { align: 'center' });

    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(`${this.semesterLabel}, SY ${this.academicYearLabel}`, 105, 28, { align: 'center' });

    // TAGUIG CAMPUS Stamp Box
    doc.setDrawColor(0); doc.setLineWidth(0.3);
    doc.rect(160, 15, 40, 8);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(100, 100, 100);
    doc.text('TAGUIG CAMPUS', 180, 20.5, { align: 'center' });
    doc.setTextColor(0);

    // 2. INFO TABLE
    autoTable(doc, {
      startY: 32,
      theme: 'grid',
      styles: { fontSize: 8.5, cellPadding: 1.5, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.2 },
      body: [
        [{ content: 'EMP NO', fontStyle: 'bold' }, faculty.faculty_code, { content: 'COLLEGE', fontStyle: 'bold' }, 'TAGUIG CAMPUS'],
        [{ content: 'EMP NAME', fontStyle: 'bold' }, faculty.faculty_name.toUpperCase(), { content: 'DEPT CODE', fontStyle: 'bold' }, ''],
        [{ content: 'EMP STATUS', fontStyle: 'bold' }, faculty.faculty_type, { content: 'DEPARTMENT', fontStyle: 'bold' }, 'TAGUIG CAMPUS'],
        [
          { content: 'REG LOAD LIMIT', fontStyle: 'bold' },
          `${faculty.regular_units || 0} Hours`,
          { content: 'PT LOAD LIMIT', fontStyle: 'bold' },
          `${faculty.additional_units || 0} Hours`
        ]
      ],
      columnStyles: { 
        0: { cellWidth: 28, fillColor: [240, 240, 240] }, 
        1: { cellWidth: 70 }, 
        2: { cellWidth: 28, fillColor: [240, 240, 240] }, 
        3: { cellWidth: 62 } 
      }
    });

    // Merge logic applied to faculty schedules
    const mergedSchedules = this.mergeSchedules(faculty.schedules || []);
    const splitSchedules = this.getSplitSchedules(
      faculty.faculty_type,
      mergedSchedules,
      Number(faculty.regular_units) ?? 15
    );

    // Trackers
    let regDailyHours: any = { MON: 0, TUE: 0, WED: 0, THUR: 0, FRI: 0, SAT: 0, SUN: 0, TBA: 0, TOTAL: 0 };
    let ptDailyHours: any = { MON: 0, TUE: 0, WED: 0, THUR: 0, FRI: 0, SAT: 0, SUN: 0, TBA: 0, TOTAL: 0 };
    let tsDailyHours: any = { MON: 0, TUE: 0, WED: 0, THUR: 0, FRI: 0, SAT: 0, SUN: 0, TBA: 0, TOTAL: 0 };

    const headers = [['SUBJECT\nCODE', 'SUBJECT DESCRIPTION', 'UNITS', 'YEAR &\nSECTION', 'SUBJ\nREF', 'TIME', 'TIME\nCODE', 'DAY/S', 'ROOM', 'EFFTVTY.']];

    const mapRowAndTrackHours = (row: any, tracker: any) => {
      const uniquePhysicalSchedules = new Map();
      row._rawSchedules.forEach((rawSched: any) => {
        const physicalKey = `${rawSched.day}_${rawSched.start_time}_${rawSched.end_time}`;
        if (!uniquePhysicalSchedules.has(physicalKey)) {
          uniquePhysicalSchedules.set(physicalKey, rawSched);
        }
      });

      uniquePhysicalSchedules.forEach((rawSched: any) => {
        let col = this.mapDayToCol(rawSched.day);
        if (!col) col = 'TBA'; 

        let diff = this.getHoursDiff(rawSched.start_time, rawSched.end_time);
        
        if (isNaN(diff) || diff <= 0) {
          const tuition = Number(rawSched.course_details?.tuition_hours);
          const units = Number(rawSched.course_details?.units || 0);
          diff = tuition > 0 ? tuition : units;
        }

        if (tracker[col] !== undefined) {
          tracker[col] += diff;
          tracker['TOTAL'] += diff;
        }
      });

      const cleanProgram = (row.program_code || '').replace('-TG', '');
      const subjRef = (row.course_details?.offering_type === 'ITech' || cleanProgram.includes('DIT')) ? 'T' : 'C';

      let yearSection = `${cleanProgram} ${row.year_level}-${row.section_name}`;
      if (row.is_combined) {
        const courseCode = row.course_details?.course_code || '';
        yearSection = `1TGBRANCH\n${courseCode}`; 
      }

      return [
        row.course_details?.course_code || '',
        row.course_details?.course_title || '',
        row.course_details?.units || 0,
        yearSection,
        subjRef,
        row._displayTime, 
        '', 
        row._displayDay, 
        row._displayRoom,
        this.effectivityDate
      ];
    };

    const fixedColumnStyles: any = {
      0: { cellWidth: 20 }, 1: { cellWidth: 46, halign: 'left' }, 2: { cellWidth: 11 }, 
      3: { cellWidth: 22 }, 4: { cellWidth: 10 }, 5: { cellWidth: 27 }, 6: { cellWidth: 11 }, 
      7: { cellWidth: 11 }, 8: { cellWidth: 13 }, 9: { cellWidth: 17 }  
    };

    const tableStyles = { fontSize: 8.5, cellPadding: 1.5, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.2, halign: 'center', valign: 'middle' };
    const headerStyles = { fillColor: [225, 225, 225], textColor: [0,0,0], fontSize: 7.5 };

    // 3. REGULAR LOAD TABLE
    let currentY = (doc as any).lastAutoTable.finalY + 4;
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('REGULAR LOAD', 14, currentY);

    let regularBody = splitSchedules.regular.map((s: any) => mapRowAndTrackHours(s, regDailyHours));
    while (regularBody.length < 5) regularBody.push(Array(10).fill('')); 

    autoTable(doc, {
      startY: currentY + 1.5, head: headers, body: regularBody, theme: 'grid',
      styles: tableStyles as any, headStyles: headerStyles as any, columnStyles: fixedColumnStyles 
    });

    currentY = (doc as any).lastAutoTable.finalY + 4;
    doc.setFontSize(8); doc.text(`Total REGULAR LOAD: ${this.getTotalHours(splitSchedules.regular)}`, 14, currentY);

    // 4. PART-TIME TABLE
    currentY += 6;
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('PART-TIME', 14, currentY);

    let partTimeBody = splitSchedules.partTime.map((s: any) => mapRowAndTrackHours(s, ptDailyHours));
    while (partTimeBody.length < 5) partTimeBody.push(Array(10).fill(''));

    autoTable(doc, {
      startY: currentY + 1.5, head: headers, body: partTimeBody, theme: 'grid',
      styles: tableStyles as any,
      headStyles: headerStyles as any,
      columnStyles: fixedColumnStyles
    });

    currentY = (doc as any).lastAutoTable.finalY + 4;
    doc.setFontSize(8); doc.text(`Total PART-TIME: ${this.getTotalHours(splitSchedules.partTime)}`, 14, currentY);

    // 5. TEMPORARY SUBSTITUTION TABLE (NEW)
    currentY += 6;
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('TEMPORARY SUBSTITUTION', 14, currentY);

    let tempSubBody = splitSchedules.tempSub.map((s: any) => mapRowAndTrackHours(s, tsDailyHours));
    while (tempSubBody.length < 3) tempSubBody.push(Array(10).fill('')); // Shorter minimum rows to save space

    autoTable(doc, {
      startY: currentY + 1.5, head: headers, body: tempSubBody, theme: 'grid',
      styles: tableStyles as any, headStyles: headerStyles as any, columnStyles: fixedColumnStyles
    });

    currentY = (doc as any).lastAutoTable.finalY + 4;
    doc.setFontSize(8); doc.text(`Total TEMP. SUBSTITUTION: ${this.getTotalHours(splitSchedules.tempSub)}`, 14, currentY);

    // 6. HOURS GRIDS
    currentY += 7;
    
    // Page break prevention for the bottom tables
    if (currentY + 40 > doc.internal.pageSize.getHeight()) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('TEACHING LOAD PER DAY (HOURS)', 105, currentY, { align: 'center' });

    const formatHour = (val: number) => val > 0 ? parseFloat(val.toFixed(2)).toString() : '';
    const days = ['MON', 'TUE', 'WED', 'THUR', 'FRI', 'SAT', 'SUN', 'TOTAL']; 

    const regRow = ['REGULAR', ...days.map(d => formatHour(regDailyHours[d]))];
    const ptRow = ['PART-TIME', ...days.map(d => formatHour(ptDailyHours[d]))];
    const tsRow = ['TEMP. SUB.', ...days.map(d => formatHour(tsDailyHours[d]))];
    const totalRow = ['TOTAL', ...days.map(d => formatHour(regDailyHours[d] + ptDailyHours[d] + tsDailyHours[d]))];

    autoTable(doc, {
      startY: currentY + 1.5, theme: 'grid',
      head: [['', 'MON', 'TUE', 'WED', 'THUR', 'FRI', 'SAT', 'SUN', 'TOTAL']],
      body: [regRow, ptRow, tsRow, totalRow],
      styles: { fontSize: 8, cellPadding: 1.5, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.2, halign: 'center' },
      headStyles: { fillColor: [225, 225, 225], textColor: [0,0,0], fontSize: 7.5 },
      columnStyles: { 0: { fillColor: [240, 240, 240], fontStyle: 'bold', halign: 'left', cellWidth: 26 } }
    });

    currentY = (doc as any).lastAutoTable.finalY + 6;
    doc.text('OFFICIAL TIME / ADVISING TIME', 105, currentY, { align: 'center' });

    autoTable(doc, {
      startY: currentY + 1.5, theme: 'grid',
      head: [['', 'MON', 'TUE', 'WED', 'THUR', 'FRI', 'SAT', 'SUN', 'TOTAL']],
      body: [
        ['OFFICIAL TIME', '', '', '', '', '', '', '', ''],
        ['ADVISING TIME', '', '', '', '', '', '', '', '']
      ],
      styles: { fontSize: 8, cellPadding: 2, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.2, halign: 'center' },
      headStyles: { fillColor: [225, 225, 225], textColor: [0,0,0], fontSize: 7.5 },
      columnStyles: { 0: { fillColor: [240, 240, 240], fontStyle: 'bold', halign: 'left', cellWidth: 26 } }
    });

    // 7. FOOTER
    currentY = (doc as any).lastAutoTable.finalY + 8;
    
    if (currentY + 25 > doc.internal.pageSize.getHeight()) {
      doc.addPage();
      currentY = 20;
    }
    
    doc.setFontSize(9.5); doc.setFont('helvetica', 'bold');
    doc.text('SUBJECT REFERENCE LEGEND:', 14, currentY);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    const legendText = '(C) - College, (OU) - Open University, (GS) - Graduate School, (PB) - Post Bac, (L) - Law, (T) - ITech';
    const wrappedLegend = doc.splitTextToSize(legendText, 100);
    doc.text(wrappedLegend, 14, currentY + 5);

    // Signature Area
    doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    doc.text('DR. MANUEL M. MUHI', 165, currentY + 15, { align: 'center' });
    doc.line(135, currentY + 16, 195, currentY + 16);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text('President', 165, currentY + 20, { align: 'center' });
  }
}
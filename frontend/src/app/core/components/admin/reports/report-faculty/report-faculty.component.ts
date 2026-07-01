import { Component, OnInit, ViewChild, AfterViewInit, AfterViewChecked, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil, filter } from 'rxjs/operators';

import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSymbolDirective } from '../../../../imports/mat-symbol.directive';

import { InputField } from '../../../../../shared/table-header/table-header.component';
import { ReportsHeaderComponent } from "../../../../../shared/reports-header/reports-header.component";
import { LoadingComponent } from '../../../../../shared/loading/loading.component';
import { DialogActionComponent } from '../../../../../shared/dialog-action/dialog-action.component';
import { DialogViewScheduleComponent } from '../../../../../shared/dialog-view-schedule/dialog-view-schedule.component';
import { DialogExportComponent } from '../../../../../shared/dialog-export/dialog-export.component';

import { ReportsService } from '../../../../services/admin/reports/reports.service';
import { ReportHeaderService } from '../../../../services/report-header/report-header.service';

import { fadeAnimation } from '../../../../animations/animations';
import { getFacultyTypeClass } from '../../../../../shared/utils/faculty-type.utils';

import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

interface Faculty {
  facultyName: string;
  facultyCode: string;
  facultyType: string;
  facultyUnits: number;
  isEnabled: boolean;
  facultyId: number;
  schedules?: any[];
  academicYear?: string;
  semester?: string;
}

interface TimeSlot {
  time: string;
  minutes: number;
}

@Component({
  selector: 'app-report-faculty',
  imports: [
    CommonModule,
    LoadingComponent,
    MatTableModule,
    MatPaginatorModule,
    MatIconModule,
    MatSlideToggleModule,
    MatButtonModule,
    MatTooltipModule,
    FormsModule,
    MatDialogModule,
    MatSelectModule,
    MatFormFieldModule,
    MatSymbolDirective,
    ReportsHeaderComponent
],
  templateUrl: './report-faculty.component.html',
  styleUrl: './report-faculty.component.scss',
  animations: [fadeAnimation],
})
export class ReportFacultyComponent implements OnInit, AfterViewInit, AfterViewChecked, OnDestroy {
  inputFields: InputField[] = [
    {
      type: 'text',
      label: 'Search Faculty',
      key: 'search',
    },
  ];

  displayedColumns: string[] = [
    'index',
    'facultyName',
    'facultyCode',
    'facultyType',
    'facultyUnits',
    'maxLoad',
    'action',
    'toggle',
  ];

  dataSource = new MatTableDataSource<Faculty>();
  filteredData: Faculty[] = [];
  hasSchedulesForToggleAll = false;
  isToggleAllChecked = false;
  isLoading = true;
  isTermsLoading = true;
  hasAnySchedules = false;
  sendEmail = true;
  availableTerms: any[] = [];
  selectedTermId: number | null = null;
  timeSlots: TimeSlot[] = [];

  private searchInput$ = new Subject<string>();

  @ViewChild(MatPaginator) paginator!: MatPaginator;

  private destroy$ = new Subject<void>();

  constructor(
    private reportsService: ReportsService,
    public dialog: MatDialog,
    private snackBar: MatSnackBar,
    private reportHeaderService: ReportHeaderService,
  ) {}

  ngOnInit(): void {
    this.generateTimeSlots();

    this.reportsService.selectedTerm$
      .pipe(
        takeUntil(this.destroy$),
        filter((termId) => termId !== null),
      )
      .subscribe((termId) => {
        this.fetchFacultyData(termId);
      });

    this.loadTerms();

    this.searchInput$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((searchQuery) => {
        this.performSearch(searchQuery);
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
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

  loadTerms() {
    this.isTermsLoading = true;
    this.reportsService.getAllTermsForDropdown().subscribe({
      next: (data) => {
        this.availableTerms = data;
        const currentTermId = this.reportsService.getSelectedTerm();
        const hasCurrentTerm = currentTermId !== null && data.some(
          (term) => term.active_semester_id === currentTermId,
        );

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
      },
      error: (error) => {
        this.isTermsLoading = false;
        this.isLoading = false;
        console.error('Error loading terms:', error);
      },
    });
  }

  onTermChange() {
    this.reportsService.setSelectedTerm(this.selectedTermId);
  }

  getSemesterLabel(semesterNumber: number): string {
    switch (semesterNumber) {
      case 1: return '1st Semester';
      case 2: return '2nd Semester';
      case 3: return 'Summer';
      default: return `Sem ${semesterNumber}`;
    }
  }

  ngAfterViewInit() {
    this.dataSource.paginator = this.paginator;
  }

  ngAfterViewChecked() {
    if (this.dataSource.paginator !== this.paginator) {
      this.dataSource.paginator = this.paginator;
    }
  }

  isMismatchedSemester = false;

  fetchFacultyData(termId: number | null = null): void {
    this.isLoading = true;
    this.reportsService.getFacultySchedulesReport(termId).subscribe({
      next: (response) => {
        this.isMismatchedSemester = response.faculty_schedule_reports.isMismatchedSemester ?? false;
        
        const facultyData = response.faculty_schedule_reports.faculties.map(
          (faculty: any) => ({
            facultyName: faculty.faculty_name,
            facultyCode: faculty.faculty_code,
            facultyType: faculty.faculty_type,
            facultyUnits: faculty.assigned_units,
            regularUnits: faculty.regular_units,
            additionalUnits: faculty.additional_units,
            isEnabled: faculty.is_published === 1,
            facultyId: faculty.faculty_id,
            schedules: faculty.schedules || [],
            academicYear: `${response.faculty_schedule_reports.year_start}-${response.faculty_schedule_reports.year_end}`,
            semester: this.getSemesterDisplay(response.faculty_schedule_reports.semester),
          }),
        );

        this.isLoading = false;
        this.dataSource.data = facultyData;
        this.filteredData = [...facultyData];
        this.dataSource.paginator = this.paginator;

        this.hasSchedulesForToggleAll = 
          facultyData.length > 0 && 
          facultyData.every((
            faculty: { schedules: string | any[] }
          ) => faculty.schedules && faculty.schedules.length > 0);

        this.hasAnySchedules = facultyData.some((
          faculty: { schedules: string | any[] }
        ) => faculty.schedules && faculty.schedules.length > 0);

        this.isToggleAllChecked = this.dataSource.data.length > 0 && 
          this.dataSource.data.every((faculty) => faculty.isEnabled);
      },
      error: (error) => {
        this.isLoading = false;
        console.error('Error fetching faculty data:', error);
      },
    });
  }

  getSemesterDisplay(semester: number): string {
    switch (semester) {
      case 1: return '1st Semester';
      case 2: return '2nd Semester';
      case 3: return 'Summer Semester';
      default: return 'Unknown Semester';
    }
  }

  getRowIndex(index: number): number {
    if (this.paginator) {
      return index + 1 + this.paginator.pageIndex * this.paginator.pageSize;
    }
    return index + 1;
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
          faculty.facultyName.toLowerCase().includes(searchQuery) ||
          faculty.facultyCode.toLowerCase().includes(searchQuery) ||
          faculty.facultyType.toLowerCase().includes(searchQuery),
      );
    }

    this.hasSchedulesForToggleAll = this.dataSource.data.length > 0 && 
      this.dataSource.data.every((faculty) => faculty.schedules && 
        faculty.schedules.length > 0);
    this.isToggleAllChecked = this.dataSource.data.length > 0 && 
      this.dataSource.data.every((faculty) => faculty.isEnabled);
  }

  onView(faculty: Faculty): void {
    // 1. Mutate the original schedule references directly instead of creating a shallow copy
    if (faculty.schedules) {
      faculty.schedules.forEach((s: any) => {
        s.day = s.day || 'TBA';
        s.start_time = s.start_time || '07:00';
        s.end_time = s.end_time || '08:00';
        s.assignmentType = s.assignmentType || s.assignment_type || 'Regular Load';
      });
    }

    const generatePdfFunction = (): Blob | void => {
      return this.createPdfBlob(faculty);
    };

    const dialogRef = this.dialog.open(DialogViewScheduleComponent, {
      maxWidth: '90vw',
      width: '100%',
      autoFocus: true,
      data: {
        exportType: 'single',
        entity: 'faculty',
        // 2. Pass the direct reference to the dialog
        entityData: faculty.schedules, 
        customTitle: `${faculty.facultyName}`,
        academicYear: faculty.academicYear,
        semester: faculty.semester,
        generatePdfFunction: generatePdfFunction,
        generateExcelFunction: async () => {
          const excelBlob = await this.generateExcelBlob(faculty);
          const formattedName = faculty.facultyName.replace(',', '').replace(/\s+/g, '_');
          saveAs(excelBlob, `${formattedName}_Schedule.xlsx`);
        },
        previewMode: true,
        showAssignmentSummary: true
      },
    });

    dialogRef.afterClosed().subscribe((wasSaved: boolean) => {
      if (wasSaved) {
        this.reportsService.clearCache('faculty');
        this.fetchFacultyData(this.selectedTermId);
      }
    });
  }

  onExportAll(): void {
    if (this.filteredData.length === 0) {
      this.snackBar.open('No faculty data available to export.', 'Close', { duration: 3000 });
      return;
    }

    const academicYear = this.filteredData[0]?.academicYear || '';
    const semester = this.filteredData[0]?.semester || '';
    const baseFileName = `All_Faculty_Schedules_${academicYear}_${semester?.replace(/\s+/g, '_')}`;

    const sanitizedSchedules = this.filteredData
      .filter(f => f.schedules && f.schedules.length > 0)
      .flatMap(f => f.schedules)
      .map((s: any) => ({
        ...s,
        day: s.day || 'TBA',
        start_time: s.start_time || '07:00',
        end_time: s.end_time || '08:00'
      }));

    this.dialog.open(DialogViewScheduleComponent, {
      maxWidth: '90vw',
      width: '100%',
      autoFocus: true,
      data: {
        exportType: 'all',
        entity: 'faculty',
        entityData: sanitizedSchedules,
        customTitle: 'All Faculty Schedules',
        fileName: baseFileName,
        academicYear: academicYear,
        semester: semester,
        generatePdfFunction: () => this.generateAllSchedulesPdfBlob(),
        generateExcelFunction: async () => {
          const excelBlob = await this.generateExcelBlobAll();
          saveAs(excelBlob, `${baseFileName}.xlsx`);
        },
        previewMode: true,
        showViewToggle: false,
      },
    });
  }

  onExportSingle(faculty: Faculty): void {
    const academicYear = faculty.academicYear || '';
    const semester = faculty.semester || '';
    const formattedName = faculty.facultyName.replace(',', '').replace(/\s+/g, '_');
    const baseFileName = `${formattedName}_Schedules_${academicYear}_${semester.replace(/\s+/g, '_')}`;

    this.dialog.open(DialogExportComponent, {
      width: '90vw',
      maxWidth: '1200px',
      data: {
        exportType: 'single',
        customTitle: faculty.facultyName,
        subtitle: `For Academic Year ${academicYear}, ${semester}`,
        generatePdfFunction: () => this.createPdfBlob(faculty),
        generateExcelFunction: async () => {
          const excelBlob = await this.generateExcelBlob(faculty);
          saveAs(excelBlob, `${baseFileName}.xlsx`);
        },
        generateFileNameFunction: () => `${baseFileName}.pdf`
      }
    });
  }

  // --- EXCEL GENERATION METHODS ---

  private getValidTabName(workbook: ExcelJS.Workbook, facultyName: string): string {
    let safeName = facultyName.split(',')[0].replace(/[^\w\s-]/gi, '').trim() || 'Faculty';
    safeName = safeName.substring(0, 25);
    
    let uniqueName = safeName;
    let counter = 1;
    
    while (workbook.getWorksheet(uniqueName)) {
      uniqueName = `${safeName}_${counter}`;
      counter++;
    }
    return uniqueName;
  }

  // --- EXCEL MERGING HELPER (FACULTY) ---
  private groupSchedulesByCourseCode(schedules: any[]): any[] {
    const mergedMap = new Map<string, any>();
    
    for (const item of schedules) {
      const courseCode = (item.course_details?.course_code || 'UNKNOWN').trim().toUpperCase();

      // Group by Course Code ONLY — merge all sections and times under one row
      const key = courseCode;
      
      if (mergedMap.has(key)) {
        const existing = mergedMap.get(key);
        existing._rawSchedules.push(item);
      } else {
        mergedMap.set(key, { ...item, _rawSchedules: [item] });
      }
    }
    
    return Array.from(mergedMap.values()).map(merged => {
      // Collect unique section strings
      const sectionsSet = new Set<string>();
      merged._rawSchedules.forEach((s: any) => {
        let sec = `${s.program_code || ''} ${s.year_level || ''}-${s.section_name || ''}`.trim();
        if (sec === '-') sec = 'Section TBA';
        sectionsSet.add(sec);
      });

      // Build unique day+time strings, deduplicated
      const timeSet = new Set<string>();
      merged._rawSchedules.forEach((s: any) => {
        let dayAbbr = 'TBA';
        if (s.day) {
          const d = s.day.toUpperCase();
          if (d.startsWith('MO')) dayAbbr = 'M';
          else if (d.startsWith('TU')) dayAbbr = 'TUE';
          else if (d.startsWith('WE')) dayAbbr = 'W';
          else if (d.startsWith('TH')) dayAbbr = 'TH';
          else if (d.startsWith('FR')) dayAbbr = 'F';
          else if (d.startsWith('SA')) dayAbbr = 'S';
          else if (d.startsWith('SU')) dayAbbr = 'SU';
          else dayAbbr = d.substring(0, 3);
        }
        const start = this.formatTimeTo12Hour(s.start_time || '').replace(/\s+/g, '') || 'TBA';
        const end = this.formatTimeTo12Hour(s.end_time || '').replace(/\s+/g, '') || 'TBA';
        timeSet.add(`${dayAbbr} ${start}-${end}`);
      });

      // Unique days
      const daysSet = new Set<string>();
      merged._rawSchedules.forEach((s: any) => {
        if (!s.day) { daysSet.add('TBA'); return; }
        const d = s.day.toUpperCase();
        if (d.startsWith('MO')) daysSet.add('M');
        else if (d.startsWith('TU')) daysSet.add('TUE');
        else if (d.startsWith('WE')) daysSet.add('W');
        else if (d.startsWith('TH')) daysSet.add('TH');
        else if (d.startsWith('FR')) daysSet.add('F');
        else if (d.startsWith('SA')) daysSet.add('S');
        else if (d.startsWith('SU')) daysSet.add('SU');
        else daysSet.add(d.substring(0, 3));
      });

      const rooms = Array.from(new Set(merged._rawSchedules.map((s: any) => s.room_code || 'TBA')));

      return {
        ...merged,
        displayDay: Array.from(daysSet).join('/'),
        displayTime: Array.from(timeSet).join('\n'),
        displaySection: Array.from(sectionsSet).sort().join(' / '),
        displayRoom: rooms.join('\n')
      };
    });
  }

  private async generateExcelBlobAll(): Promise<Blob> {
    const workbook = new ExcelJS.Workbook();

    for (const faculty of this.filteredData) {
      if (faculty.schedules && faculty.schedules.length > 0) {
        const tabName = this.getValidTabName(workbook, faculty.facultyName);
        const worksheet = workbook.addWorksheet(tabName);
        this.applyFacultyExcelLayout(worksheet, faculty);
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  private async generateExcelBlob(faculty: Faculty): Promise<Blob> {
    const workbook = new ExcelJS.Workbook();
    const tabName = this.getValidTabName(workbook, faculty.facultyName);
    const worksheet = workbook.addWorksheet(tabName);
    
    this.applyFacultyExcelLayout(worksheet, faculty);

    const buffer = await workbook.xlsx.writeBuffer();
    return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  private applyFacultyExcelLayout(worksheet: ExcelJS.Worksheet, faculty: Faculty) {
    worksheet.pageSetup = {
      orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 }
    };

    worksheet.columns = [
      { width: 18 }, { width: 35 }, { width: 8 }, { width: 8 }, 
      { width: 10 }, { width: 15 }, { width: 15 }, { width: 25 }
    ];

    worksheet.mergeCells('A1:D1'); worksheet.mergeCells('E1:H1');
    worksheet.mergeCells('A2:D2'); worksheet.mergeCells('E2:H2');

    worksheet.getCell('A1').value = `Faculty: ${faculty.facultyName.toUpperCase()}`;
    worksheet.getCell('E1').value = `Faculty Type: ${faculty.facultyType}`;
    worksheet.getCell('A2').value = `School Year: ${faculty.academicYear} | Semester: ${faculty.semester}`;
    const maxLoadStr = faculty.additionalUnits > 0
      ? `${faculty.regularUnits} Reg / ${faculty.additionalUnits} PT`
      : `${faculty.regularUnits}`;
    worksheet.getCell('E2').value =
      `Total Load: ${faculty.facultyUnits} / Max: ${maxLoadStr} Hours`;

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
      const groupedSchedules = this.groupSchedulesByCourseCode(faculty.schedules);

      groupedSchedules.forEach((schedule: any) => {
        const isBridging = schedule.course_details?.offering_type === 'bridging';
        const courseCode = schedule.course_details?.course_code || '';
        const displayCourseCode = isBridging ? `${courseCode}\n[Bridging]` : courseCode;
        
        const row = worksheet.addRow([
          displayCourseCode,
          schedule.course_details?.course_title || '',
          schedule.course_details?.lec || 0,
          schedule.course_details?.lab || 0,
          schedule.course_details?.units || 0,
          schedule.displaySection,
          schedule.displayRoom,
          `${schedule.displayDay}\n${schedule.displayTime}`
        ]);

        row.eachCell((cell, colNum) => {
          cell.alignment = { vertical: 'middle', horizontal: colNum === 2 ? 'left' : 'center', wrapText: true };
          cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
        });
      });
    }
  }

  // --- TOGGLES & PDF GENERATION ---
  
  onToggleAllSchedules(event: any) {
    event.source.checked = this.isToggleAllChecked;
    const intendedState = !this.isToggleAllChecked;

    // Check if all displayed faculty have schedules
    const allHaveSchedules = this.dataSource.data.every(
      (faculty) =>
        faculty.schedules && faculty.schedules.length > 0
    );

    const dialogRef = this.dialog.open(DialogActionComponent, {
      data: {
        type: 'all_publish',
        currentState: !intendedState,
        academicYear: this.filteredData[0]?.academicYear || '',
        semester: this.filteredData[0]?.semester || '',
        hasSecondaryText: false,
        sendEmail: this.sendEmail,
        isMismatchedSemester: this.isMismatchedSemester,
        incompleteScheduleWarning: !allHaveSchedules && intendedState,
      },
      autoFocus: true,
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result === true) {
        this.isToggleAllChecked = intendedState;
        this.dataSource.data.forEach((faculty) => {
          if (faculty.schedules && faculty.schedules.length > 0) faculty.isEnabled = intendedState;
        });
        this.filteredData = [...this.dataSource.data];
        this.hasSchedulesForToggleAll = this.dataSource.data.length > 0 && 
          this.dataSource.data.every((faculty) => faculty.schedules && 
            faculty.schedules.length > 0);
      }
      event.source.checked = this.isToggleAllChecked;
    });
  }

  onToggleSingleSchedule(element: Faculty, event: any): void {
    const intendedState = event.checked;
    event.source.checked = element.isEnabled;
    const dialogRef = this.dialog.open(DialogActionComponent, {
      data: {
        type: 'single_publish', currentState: element.isEnabled,
        facultyName: element.facultyName, faculty_id: element.facultyId,
        academicYear: element.academicYear, semester: element.semester,
        isMismatchedSemester: this.isMismatchedSemester,
      },
      autoFocus: true,
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result === true) {
        element.isEnabled = intendedState;
        this.isToggleAllChecked = this.dataSource.data.every((faculty) => faculty.isEnabled);
      } else {
        event.source.checked = element.isEnabled;
      }
    });
  }

  updateDisplayedData() { console.log('Paginator updated'); }

  generateAllSchedulesPdfBlob(): Blob {
    const doc = new jsPDF('landscape', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.width;
    const margin = 10;
    const topMargin = 15;
    const logoSize = 22;

    let hasPages = false;

    this.filteredData.forEach((faculty) => {
      if (faculty.schedules && faculty.schedules.length > 0) {
        if (hasPages) {
          this.reportHeaderService.addStandardFooter(doc);
          doc.addPage();
        }
        hasPages = true;

        const title = `${faculty.facultyName} Schedule`;
        const subtitle = this.getAcademicYearSubtitle(faculty);

        let currentY = this.drawHeader(doc, topMargin, pageWidth, margin, logoSize, title, subtitle);
        this.drawScheduleTable(doc, faculty.schedules, title, subtitle, currentY, margin, pageWidth);
      }
    });

    if (hasPages) {
      this.reportHeaderService.addStandardFooter(doc);
    } else {
      doc.text("No schedules available.", 10, 20);
    }

    return doc.output('blob');
  }

  createPdfBlob(faculty: Faculty): Blob {
    const doc = new jsPDF('landscape', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.width;
    const margin = 10;
    const topMargin = 15;
    const logoSize = 22;

    if (faculty.schedules && faculty.schedules.length > 0) {
      const title = `${faculty.facultyName}`;
      const subtitle = this.getAcademicYearSubtitle(faculty);

      let currentY = this.drawHeader(doc, topMargin, pageWidth, margin, logoSize, title, subtitle);
      this.drawScheduleTable(doc, faculty.schedules, title, subtitle, currentY, margin, pageWidth);
    }
    
    this.reportHeaderService.addStandardFooter(doc);
    return doc.output('blob');
  }

  private drawHeader(doc: jsPDF, startY: number, pageWidth: number, margin: number, logoSize: number, title: string, subtitle: string): number {
    let currentY = startY;
    this.reportHeaderService.addHeader(doc, title, currentY, subtitle).subscribe((newY) => { currentY = newY; });
    return currentY;
  }

  drawScheduleTable(doc: jsPDF, scheduleData: any[], title: string, subtitle: string, startY: number, margin: number, pageWidth: number): void {
    const hasSchedules = scheduleData && scheduleData.length > 0;
    if (!hasSchedules) return;

    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const timeColWidth = 22;
    const dayColumnWidth = (pageWidth - margin * 2 - timeColWidth) / days.length;
    
    // FIX 1: Reduced to 8.5 so the table physically fits on the A4 page without hitting the footer
    const rowHeight = 8.5; 

    const chunks = [
      { name: 'Morning (7:30 AM - 2:00 PM)', start: 450, end: 840 },
      { name: 'Afternoon (2:00 PM - 9:00 PM)', start: 840, end: 1260 }
    ];

    const activeChunks = chunks.filter(chunk => {
      return scheduleData.some(s => {
        if (!s.start_time || !s.end_time || !s.day) return false;
        const sStart = this.timeToMinutes(s.start_time);
        const sEnd = this.timeToMinutes(s.end_time);
        return Math.max(sStart, chunk.start) < Math.min(sEnd, chunk.end);
      });
    });

    if (activeChunks.length === 0) return;

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
      doc.text('Time', margin + timeColWidth / 2, currentY + (totalHeaderHeight / 2) + 1.5, { align: 'center' });

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
        doc.text(day, xPos + dayColumnWidth / 2, currentY + 4.5, { align: 'center' });

        // Bottom row: Subject sub-header
        doc.setFillColor(160, 20, 20);
        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(0.4);
        doc.rect(xPos, currentY + headerHeight, subjColWidth, subHeaderHeight, 'FD');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.text('Subject', xPos + subjColWidth / 2, currentY + headerHeight + 3.5, { align: 'center' });

        // Bottom row: Room sub-header
        doc.setFillColor(160, 20, 20);
        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(0.4);
        doc.rect(xPos + subjColWidth, currentY + headerHeight, roomColWidth, subHeaderHeight, 'FD');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.text('Room', xPos + subjColWidth + roomColWidth / 2, currentY + headerHeight + 3.5, { align: 'center' });
      });

      currentY += totalHeaderHeight;

      // --- 2. DRAW TIME GRID ---
      doc.setTextColor(0, 0, 0);
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.5);

      // FIX 2: Removed the maxRows truncation so it draws all slots normally
      const chunkSlots = this.timeSlots.filter(s => s.minutes >= chunk.start && s.minutes < chunk.end);

      chunkSlots.forEach((slot, index) => {
        const yPos = currentY + index * rowHeight;
        const isTopRow = index === 0;
        const isThreeHourGap = slot.minutes >= 450 && (slot.minutes - 450) % 180 === 0;

        if (isTopRow || isThreeHourGap) {
          if (!isTopRow) {
            doc.setDrawColor(200, 200, 200);
            doc.setLineWidth(0.5);
            doc.line(margin, yPos, pageWidth - margin, yPos);
          }
          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(0, 0, 0);
          doc.text(slot.time, margin + timeColWidth / 2, yPos + 5, { align: 'center' });
        }
      });

      // Draw the last time label at finalY
      const finalY = currentY + chunkSlots.length * rowHeight;
      const lastSlot = chunkSlots[chunkSlots.length - 1];
      if (lastSlot) {
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.5);
        doc.line(margin, finalY, pageWidth - margin, finalY);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text(lastSlot.time, margin + timeColWidth / 2, finalY - rowHeight + 5, { align: 'center' });
      } else {
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.5);
        doc.line(margin, finalY, pageWidth - margin, finalY);
      }

      // Vertical grid lines
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
          if (!existing._mergedPrograms) existing._mergedPrograms = [existing.program_code];
          if (!existing._mergedPrograms.includes(item.program_code)) {
            existing._mergedPrograms.push(item.program_code);
          }
        } else {
          mergedMap.set(key, { ...item });
        }
      }

      const sortedScheduleData = [...mergedMap.values()].sort(
        (a, b) => this.timeToMinutes(a.start_time) - this.timeToMinutes(b.start_time)
      );

      // --- PASS 1: Draw all block backgrounds ---
      sortedScheduleData.forEach(item => {
        const dayIndex = days.indexOf(item.day);
        if (dayIndex === -1) return;

        const cappedStart = Math.max(this.timeToMinutes(item.start_time), chunk.start);
        const cappedEnd = Math.min(this.timeToMinutes(item.end_time), chunk.end);
        if (cappedStart >= cappedEnd) return;

        const startSlot = chunkSlots.findIndex(slot => slot.minutes === cappedStart);
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

      // --- PASS 2: Draw all text on top ---
      sortedScheduleData.forEach(item => {
        const dayIndex = days.indexOf(item.day);
        if (dayIndex === -1) return;

        const originalStart = this.timeToMinutes(item.start_time);
        const originalEnd = this.timeToMinutes(item.end_time);
        const cappedStart = Math.max(originalStart, chunk.start);
        const cappedEnd = Math.min(originalEnd, chunk.end);
        if (cappedStart >= cappedEnd) return;

        const startSlot = chunkSlots.findIndex(slot => slot.minutes === cappedStart);
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

        // Build content
        let programDisplay: string;
        if (item._mergedPrograms && item._mergedPrograms.length > 1) {
          programDisplay = item._mergedPrograms.sort().reverse().join('/') + ` ${item.year_level} - ${item.section_name}`;
        } else {
          programDisplay = `${item.program_code} ${item.year_level} - ${item.section_name}`;
        }

        // Format time range from original uncapped times
        const formatTime = (minutes: number): string => {
          const h = Math.floor(minutes / 60);
          const m = minutes % 60;
          const suffix = h >= 12 ? 'PM' : 'AM';
          const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
          return `${displayH}:${m.toString().padStart(2, '0')} ${suffix}`;
        };
        const timeRange = `${formatTime(originalStart)} - ${formatTime(originalEnd)}`;

        const content = [
          item.course_details?.course_code || '',
          item.course_details?.course_title || '',
          programDisplay,
          timeRange
        ].filter(line => line !== '');

        const fontSizes = [codeFontSize, textFontSize, textFontSize, timeFontSize];
        const fontStyles = ['bold', 'normal', 'normal', 'normal'];

        // Bridging badge
        const isBridging = item.course_details?.offering_type === 'bridging';
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
          doc.text(badgeLabel, badgeX + badgePaddingX, badgeY + badgeH - badgePaddingY - 0.2);
          doc.setTextColor(0, 0, 0);
        }

        // Subject content — vertically centered with top/bottom clamp
        let totalSubjectLines = 0;
        content.forEach(line => {
          totalSubjectLines += doc.splitTextToSize(line, subjColWidth - 4).length;
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
              doc.text(wLine, xPos + subjColWidth / 2, subjectStartY, { align: 'center', baseline: 'middle' });
            }
            subjectStartY += lineSpacing;
          });
        });

        doc.setTextColor(0, 0, 0);

        // Room text — vertically centered with top/bottom clamp
        const roomText = item.room_code && item.room_code.trim() !== '' ? item.room_code : 'TBA';
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
            doc.text(rLine, xPos + subjColWidth + roomColWidth / 2, roomStartY, { align: 'center', baseline: 'middle' });
          }
          roomStartY += roomLineSpacing;
        });
      });

    }); // end activeChunks.forEach

    // ✅ Always draw footer on the last page
    this.reportHeaderService.addStandardFooter(doc);
  }

  private formatTime(time: string): string {
    if (!time) return ''; // Safety check
    const [hours, minutes] = time.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const formattedHours = hours % 12 || 12;
    return `${formattedHours}:${minutes.toString().padStart(2, '0')} ${period}`;
  }

  private timeToMinutes(time: string): number {
    if (!time) return 0; // Safety check
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private formatTimeTo12Hour(time: string): string {
    return this.formatTime(time);
  }

  private getAcademicYearSubtitle(faculty: Faculty): string {
    return `For Academic Year ${faculty.academicYear}, ${faculty.semester}`;
  }

  getSingleToggleTooltip(faculty: Faculty): string {
    if (!faculty.schedules || faculty.schedules.length === 0) return `Cannot publish/unpublish empty schedule for ${faculty.facultyName}`;
    return `${faculty.isEnabled ? 'Unpublish' : 'Publish'} schedule for ${faculty.facultyName}`;
  }

  getAllToggleTooltip(isEnabled: boolean): string {
    if (!this.hasSchedulesForToggleAll) return 'Must not be toggled unless all faculty has schedule';
    return `${isEnabled ? 'Unpublish' : 'Publish'} schedules for all applicable faculty`;
  }

  hasSchedules(faculty: Faculty): boolean {
    return (faculty.schedules ?? []).length > 0;
  }

  getFacultyTypeClass(facultyType: string): Record<string, boolean> {
    return getFacultyTypeClass(facultyType);
  }

}
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
export class ReportFacultyComponent implements OnInit, AfterViewInit, 
AfterViewChecked, OnDestroy {
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

  fetchFacultyData(termId: number | null = null): void {
    this.isLoading = true;
    this.reportsService.getFacultySchedulesReport(termId).subscribe({
      next: (response) => {
        const facultyData = response.faculty_schedule_reports.faculties.map(
          (faculty: any) => ({
            facultyName: faculty.faculty_name,
            facultyCode: faculty.faculty_code,
            facultyType: faculty.faculty_type,
            facultyUnits: faculty.assigned_units,
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

        this.hasSchedulesForToggleAll = facultyData.length > 0 && facultyData.every((faculty: { schedules: string | any[] }) => faculty.schedules && faculty.schedules.length > 0);
        this.hasAnySchedules = facultyData.some((faculty: { schedules: string | any[] }) => faculty.schedules && faculty.schedules.length > 0);
        this.isToggleAllChecked = this.dataSource.data.length > 0 && this.dataSource.data.every((faculty) => faculty.isEnabled);
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

    this.hasSchedulesForToggleAll = this.dataSource.data.length > 0 && this.dataSource.data.every((faculty) => faculty.schedules && faculty.schedules.length > 0);
    this.isToggleAllChecked = this.dataSource.data.length > 0 && this.dataSource.data.every((faculty) => faculty.isEnabled);
  }

  onView(faculty: Faculty): void {
    const generatePdfFunction = (): Blob | void => {
      return this.createPdfBlob(faculty);
    };

    this.dialog.open(DialogViewScheduleComponent, {
      maxWidth: '90vw',
      width: '100%',
      autoFocus: true,
      data: {
        exportType: 'single',
        entity: 'faculty',
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
      },
      disableClose: true,
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

    this.dialog.open(DialogViewScheduleComponent, {
      maxWidth: '90vw',
      width: '100%',
      autoFocus: true,
      data: {
        exportType: 'all',
        entity: 'faculty',
        entityData: this.filteredData.filter(f => f.schedules && f.schedules.length > 0).map(f => f.schedules).flat(),
        customTitle: 'All Faculty Schedules',
        fileName: baseFileName,
        academicYear: academicYear,
        semester: semester,
        generatePdfFunction: () => this.generateAllSchedulesPdfBlob(),
        generateExcelFunction: async () => {
          const excelBlob = await this.generateExcelBlobAll();
          saveAs(excelBlob, `${baseFileName}.xlsx`);
        },
        showViewToggle: false,
      },
      disableClose: true,
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
      disableClose: true,
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

  private async generateExcelBlobAll(): Promise<Blob> {
    const workbook = new ExcelJS.Workbook();

    for (const faculty of this.filteredData) {
      if (faculty.schedules && faculty.schedules.length > 0) {
        // Create a safe, short name for the tab
        const tabName = faculty.facultyName.split(',')[0].substring(0, 31).replace(/[^\w\s-]/gi, '');
        const worksheet = workbook.addWorksheet(tabName);
        this.applyFacultyExcelLayout(worksheet, faculty);
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  private async generateExcelBlob(faculty: Faculty): Promise<Blob> {
    const workbook = new ExcelJS.Workbook();
    const tabName = faculty.facultyName.split(',')[0].substring(0, 31).replace(/[^\w\s-]/gi, '');
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
      { width: 15 }, { width: 35 }, { width: 8 }, { width: 8 }, 
      { width: 10 }, { width: 15 }, { width: 15 }, { width: 25 }
    ];

    worksheet.mergeCells('A1:D1'); worksheet.mergeCells('E1:H1');
    worksheet.mergeCells('A2:D2'); worksheet.mergeCells('E2:H2');

    worksheet.getCell('A1').value = `Faculty: ${faculty.facultyName.toUpperCase()}`;
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
        const timeRange = `${this.formatTimeTo12Hour(schedule.start_time)} - ${this.formatTimeTo12Hour(schedule.end_time)}`;
        
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

  // --- TOGGLES & PDF GENERATION ---
  
  onToggleAllSchedules(event: any) {
    event.source.checked = this.isToggleAllChecked;
    const intendedState = !this.isToggleAllChecked;
    const dialogRef = this.dialog.open(DialogActionComponent, {
      data: {
        type: 'all_publish', currentState: !intendedState,
        academicYear: this.filteredData[0]?.academicYear || '',
        semester: this.filteredData[0]?.semester || '',
        hasSecondaryText: false, sendEmail: this.sendEmail,
      },
      disableClose: true, autoFocus: true,
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result === true) {
        this.isToggleAllChecked = intendedState;
        this.dataSource.data.forEach((faculty) => {
          if (faculty.schedules && faculty.schedules.length > 0) faculty.isEnabled = intendedState;
        });
        this.filteredData = [...this.dataSource.data];
        this.hasSchedulesForToggleAll = this.dataSource.data.length > 0 && this.dataSource.data.every((faculty) => faculty.schedules && faculty.schedules.length > 0);
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
      },
      disableClose: true, autoFocus: true,
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

        let currentY = this.drawHeader(
          doc, topMargin, pageWidth, margin, logoSize,
          `${faculty.facultyName} Schedule`,
          this.getAcademicYearSubtitle(faculty)
        );
        this.drawScheduleTable(doc, faculty.schedules, currentY, margin, pageWidth, faculty.facultyName);
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
    this.reportHeaderService.addHeader(doc, title, currentY, subtitle).subscribe((newY) => { currentY = newY; });
    return currentY;
  }

  private drawScheduleTable(doc: jsPDF, scheduleData: any[], startY: number, margin: number, pageWidth: number, facultyName: string): void {
    const hasSchedules = scheduleData && scheduleData.length > 0;
    if (!hasSchedules) return;

    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const dayColumnWidth = (pageWidth - margin * 2) / days.length;
    const pageHeight = doc.internal.pageSize.height;
    const maxContentHeight = pageHeight - 20;

    let currentY = startY;
    let maxYPosition = currentY;

    const startNewPage = () => {
      this.reportHeaderService.addStandardFooter(doc);
      doc.addPage();
      currentY = this.drawHeader(doc, 15, pageWidth, margin, 22, doc.getNumberOfPages() > 1 ? 'Faculty Schedule (Continued)' : 'Faculty Schedule', this.getAcademicYearSubtitle(scheduleData[0]));

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

      const daySchedule = scheduleData.filter((item: any) => item.day === day)
        .sort((a: any, b: any) => this.timeToMinutes(a.start_time) - this.timeToMinutes(b.start_time));

      if (daySchedule.length > 0) {
        daySchedule.forEach((item: any) => {
          const courseContent = [
            item.course_details.course_code, item.course_details.course_title,
            `${item.program_code} ${item.year_level} - ${item.section_name}`,
            item.room_code && item.room_code.trim() !== '' ? item.room_code : 'TBA',
            `${this.formatTime(item.start_time)} - ${this.formatTime(item.end_time)}`,
          ];

          const boxHeight = this.calculateBoxHeight(doc, courseContent, dayColumnWidth);

          if (yPosition + boxHeight > maxContentHeight) {
            days.forEach((_, i) => {
              const lineX = margin + i * dayColumnWidth;
              doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.5); doc.line(lineX, startY, lineX, maxYPosition);
            });
            doc.line(pageWidth - margin, startY, pageWidth - margin, maxYPosition);
            yPosition = startNewPage(); maxYPosition = yPosition;
          }

          doc.setFillColor(240, 240, 240);
          doc.rect(xPosition, yPosition, dayColumnWidth, boxHeight, 'F');

          let textYPosition = yPosition + 5;
          courseContent.forEach((line: string, index) => {
            doc.setTextColor(0); doc.setFontSize(9); doc.setFont('helvetica', index <= 1 ? 'bold' : 'normal');
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

  private getAcademicYearSubtitle(faculty: Faculty): string {
    return `For Academic Year ${faculty.academicYear}, ${faculty.semester}`;
  }

  getSingleToggleTooltip(faculty: Faculty): string {
    if (!faculty.schedules || faculty.schedules.length === 0) return `Cannot publish/unpublish empty schedule for ${faculty.facultyName}`;
    return `${faculty.isEnabled ? 'Unpublish' : 'Publish'} schedule for ${faculty.facultyName}`;
  }

  getAllToggleTooltip(isEnabled: boolean): string {
    if (!this.hasSchedulesForToggleAll) return 'Cannot be toggled unless all faculty has schedule';
    return `${isEnabled ? 'Unpublish' : 'Publish'} schedules for all applicable faculty`;
  }

  hasSchedules(faculty: Faculty): boolean {
    return (faculty.schedules ?? []).length > 0;
  }

  getFacultyTypeClass(facultyType: string): Record<string, boolean> {
    const type = facultyType.toLowerCase();
    return {
      'full-time': type.includes('full-time'), designee: type.includes('designee'),
      'part-time': type.includes('part-time'), temporary: type.includes('temporary'),
    };
  }

  private calculateBoxHeight(doc: jsPDF, content: string[], columnWidth: number): number {
    const padding = 10; let totalHeight = 5;
    content.forEach((line: string, index: number) => {
      doc.setFontSize(9); doc.setFont('helvetica', index <= 1 ? 'bold' : 'normal');
      const wrappedLines = doc.splitTextToSize(line, columnWidth - padding);
      totalHeight += wrappedLines.length * 5;
    });
    return totalHeight + 5;
  }
}
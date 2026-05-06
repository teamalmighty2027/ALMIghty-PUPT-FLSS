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

  displayedColumns: string[] = ['index', 'facultyName', 'facultyCode', 'facultyType', 'facultyUnits', 'action'];

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
        
        const facultyData = report.faculties;
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
    const type = facultyType.toLowerCase();
    return {
      'full-time': type.includes('full-time'), designee: type.includes('designee'),
      'part-time': type.includes('part-time'), temporary: type.includes('temporary'),
    };
  }

  updateDisplayedData() {}

  hasSchedules(faculty: any): boolean {
    return faculty.schedules && faculty.schedules.length > 0;
  }

  // --- MODAL AND EXPORT LOGIC ---

  onView(faculty: any): void {
    this.dialog.open(DialogViewScheduleComponent, {
      maxWidth: '95vw',
      width: '95vw',
      height: 'auto',
      maxHeight: '95vh',
      panelClass: 'pdf-fullscreen-dialog', // Ensure this class is here!
      autoFocus: true, 
      disableClose: true,
      data: {
        exportType: 'single', 
        entity: 'faculty', 
        entityData: faculty.schedules,
        customTitle: `${faculty.faculty_name}`, 
        academicYear: this.academicYearLabel, 
        semester: this.semesterLabel,
        generatePdfFunction: () => this.generateAssignmentPdfBlob(faculty)
      },
    });
  }

  onExportSingle(faculty: any): void {
    const baseFileName = `${faculty.faculty_name.replace(/\s+/g, '_')}_Assignment_SY_${this.academicYearLabel}`;
    this.dialog.open(DialogExportComponent, {
      width: '90vw', maxWidth: '1200px', disableClose: true,
      data: {
        exportType: 'single', customTitle: faculty.faculty_name,
        subtitle: `For Academic Year ${this.academicYearLabel}, ${this.semesterLabel}`,
        generatePdfFunction: () => this.generateAssignmentPdfBlob(faculty),
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
      width: '90vw', maxWidth: '1200px', disableClose: true,
      data: {
        exportType: 'all', customTitle: 'All Faculty Assignments',
        subtitle: `For Academic Year ${this.academicYearLabel}, ${this.semesterLabel}`,
        generatePdfFunction: () => this.generateAllAssignmentsPdfBlob(),
        generateFileNameFunction: () => `${baseFileName}.pdf`
      }
    });
  }

  // --- HELPER LOGIC: REGULAR VS PART-TIME ---

  getSplitSchedules(faculty: any) {
    const regular: any[] = [];
    const partTime: any[] = [];
    let currentUnits = 0;
    
    const isPartTimeFaculty = (faculty.faculty_type || '').toLowerCase().includes('part-time');

    if (faculty.schedules) {
      faculty.schedules.forEach((sched: any) => {
        const units = Number(sched.course_details?.units) || 0;

        if (isPartTimeFaculty) {
          partTime.push(sched);
        } else {
          if (currentUnits + units <= 15) {
            regular.push(sched);
            currentUnits += units;
          } else {
            partTime.push(sched);
          }
        }
      });
    }
    return { regular, partTime };
  }

  getTotalUnits(schedules: any[]): number {
    return schedules.reduce((acc, curr) => acc + (Number(curr.course_details?.units) || 0), 0);
  }

  // --- HELPER LOGIC: TIME AND DAYS (FIXED MATH BUGS) ---

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
      ],
      columnStyles: { 
        0: { cellWidth: 28, fillColor: [240, 240, 240] }, 
        1: { cellWidth: 70 }, 
        2: { cellWidth: 28, fillColor: [240, 240, 240] }, 
        3: { cellWidth: 62 } 
      }
    });

    const splitSchedules = this.getSplitSchedules(faculty);

    // Trackers: Added 'TBA' for missing days and 'TOTAL' for row sum calculation
    let regDailyHours: any = { MON: 0, TUE: 0, WED: 0, THUR: 0, FRI: 0, SAT: 0, SUN: 0, TBA: 0, TOTAL: 0 };
    let ptDailyHours: any = { MON: 0, TUE: 0, WED: 0, THUR: 0, FRI: 0, SAT: 0, SUN: 0, TBA: 0, TOTAL: 0 };

    const headers = [['SUBJECT\nCODE', 'SUBJECT DESCRIPTION', 'UNITS', 'YEAR &\nSECTION', 'SUBJ\nREF', 'TIME', 'TIME\nCODE', 'DAY/S', 'ROOM', 'EFFTVTY.']];

    const mapRowAndTrackHours = (row: any, tracker: any) => {
      let col = this.mapDayToCol(row.day);
      if (!col) col = 'TBA'; // Fallback for empty/invalid days

      let diff = this.getHoursDiff(row.start_time, row.end_time);
      
      // Fallback hours if time is missing or invalid
      if (isNaN(diff) || diff <= 0) {
        const tuition = Number(row.course_details?.tuition_hours);
        const lecLab = Number(row.course_details?.lec || 0) + Number(row.course_details?.lab || 0);
        const units = Number(row.course_details?.units || 0);
        diff = tuition > 0 ? tuition : (lecLab > 0 ? lecLab : units);
      }

      // Add to tracking objects
      if (tracker[col] !== undefined) {
        tracker[col] += diff;
        tracker['TOTAL'] += diff;
      }
      
      const cleanProgram = (row.program_code || '').replace('-TG', '');
      const cleanRoom = (row.room_code || '').replace(/^TG/, '');
      const subjRef = (row.course_details?.offering_type === 'ITech' || cleanProgram.includes('DIT')) ? 'T' : 'C';

      return [
        row.course_details?.course_code || '',
        row.course_details?.course_title || '',
        row.course_details?.units || 0,
        `${cleanProgram} ${row.year_level}-${row.section_name}`,
        subjRef,
        (row.start_time && row.end_time) ? `${this.formatTime(row.start_time)}-${this.formatTime(row.end_time)}` : 'TBA',
        '', 
        this.mapDayCode(row.day) || 'TBA',
        cleanRoom || 'TBA',
        this.effectivityDate
      ];
    };

    const fixedColumnStyles: any = {
      0: { cellWidth: 20 },                      
      1: { cellWidth: 46, halign: 'left' },      
      2: { cellWidth: 11 },                      
      3: { cellWidth: 22 },                      
      4: { cellWidth: 10 },                      
      5: { cellWidth: 27 },                      
      6: { cellWidth: 11 },                      
      7: { cellWidth: 11 },                      
      8: { cellWidth: 13 },                      
      9: { cellWidth: 17 }                       
    };

    // 3. REGULAR LOAD TABLE
    let currentY = (doc as any).lastAutoTable.finalY + 4;
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('REGULAR LOAD', 14, currentY);

    let regularBody = splitSchedules.regular.map((s: any) => mapRowAndTrackHours(s, regDailyHours));
    
    while (regularBody.length < 5) {
      regularBody.push(Array(10).fill('')); 
    }

    autoTable(doc, {
      startY: currentY + 1.5, head: headers, body: regularBody, theme: 'grid',
      styles: { fontSize: 8.5, cellPadding: 1.5, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.2, halign: 'center', valign: 'middle' },
      headStyles: { fillColor: [225, 225, 225], textColor: [0,0,0], fontSize: 7.5 },
      columnStyles: fixedColumnStyles 
    });

    currentY = (doc as any).lastAutoTable.finalY + 4;
    doc.setFontSize(8); doc.text(`Total REGULAR LOAD: ${this.getTotalUnits(splitSchedules.regular)}`, 14, currentY);

    // 4. PART-TIME TABLE
    currentY += 6;
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('PART-TIME', 14, currentY);

    let partTimeBody = splitSchedules.partTime.map((s: any) => mapRowAndTrackHours(s, ptDailyHours));

    while (partTimeBody.length < 5) {
      partTimeBody.push(Array(10).fill(''));
    }

    autoTable(doc, {
      startY: currentY + 1.5, head: headers, body: partTimeBody, theme: 'grid',
      styles: { fontSize: 8.5, cellPadding: 1.5, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.2, halign: 'center', valign: 'middle' },
      headStyles: { fillColor: [225, 225, 225], textColor: [0,0,0], fontSize: 7.5 },
      columnStyles: fixedColumnStyles
    });

    currentY = (doc as any).lastAutoTable.finalY + 4;
    doc.setFontSize(8); doc.text(`Total PART-TIME: ${this.getTotalUnits(splitSchedules.partTime)}`, 14, currentY);

    // 5. HOURS GRIDS
    currentY += 7;
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('TEACHING LOAD PER DAY (HOURS)', 105, currentY, { align: 'center' });

    const formatHour = (val: number) => val > 0 ? parseFloat(val.toFixed(2)).toString() : '';
    const daysWithTBA = ['MON', 'TUE', 'WED', 'THUR', 'FRI', 'SAT', 'SUN', 'TBA'];

    const regRow = ['REGULAR', ...daysWithTBA.map(d => formatHour(regDailyHours[d])), formatHour(regDailyHours.TOTAL)];
    const ptRow = ['PART-TIME', ...daysWithTBA.map(d => formatHour(ptDailyHours[d])), formatHour(ptDailyHours.TOTAL)];
    const totalRow = ['TOTAL', ...daysWithTBA.map(d => formatHour(regDailyHours[d] + ptDailyHours[d])), formatHour(regDailyHours.TOTAL + ptDailyHours.TOTAL)];

    autoTable(doc, {
      startY: currentY + 1.5, theme: 'grid',
      head: [['', 'MON', 'TUE', 'WED', 'THUR', 'FRI', 'SAT', 'SUN', 'TBA', 'TOTAL']],
      body: [regRow, ptRow, totalRow],
      styles: { fontSize: 8, cellPadding: 1.5, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.2, halign: 'center' },
      headStyles: { fillColor: [225, 225, 225], textColor: [0,0,0], fontSize: 7.5 },
      columnStyles: { 0: { fillColor: [240, 240, 240], fontStyle: 'bold', halign: 'left', cellWidth: 26 } }
    });

    currentY = (doc as any).lastAutoTable.finalY + 6;
    doc.text('OFFICIAL TIME / ADVISING TIME', 105, currentY, { align: 'center' });

    autoTable(doc, {
      startY: currentY + 1.5, theme: 'grid',
      head: [['', 'MON', 'TUE', 'WED', 'THUR', 'FRI', 'SAT', 'SUN', 'TBA', 'TOTAL']],
      body: [
        ['OFFICIAL TIME', '', '', '', '', '', '', '', '', ''],
        ['ADVISING TIME', '', '', '', '', '', '', '', '', '']
      ],
      styles: { fontSize: 8, cellPadding: 2, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.2, halign: 'center' },
      headStyles: { fillColor: [225, 225, 225], textColor: [0,0,0], fontSize: 7.5 },
      columnStyles: { 0: { fillColor: [240, 240, 240], fontStyle: 'bold', halign: 'left', cellWidth: 26 } }
    });

    // 6. FOOTER
    currentY = (doc as any).lastAutoTable.finalY + 8;
    
    // CRITICAL FIX: Check if we have enough space (approx 25mm) for the signature block.
    // If we exceed the page height, create a new page and reset the Y coordinate.
    const pageHeight = doc.internal.pageSize.getHeight();
    if (currentY + 25 > pageHeight) {
      doc.addPage();
      currentY = 20; // Start near the top of the new page
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
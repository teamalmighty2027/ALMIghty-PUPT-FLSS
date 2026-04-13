import { Component, OnInit, ViewChild, AfterViewInit, AfterViewChecked, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil, filter } from 'rxjs/operators';

import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSymbolDirective } from '../../../../imports/mat-symbol.directive';

import { InputField } from '../../../../../shared/table-header/table-header.component';
import { ReportsHeaderComponent } from "../../../../../shared/reports-header/reports-header.component";
import { LoadingComponent } from '../../../../../shared/loading/loading.component';
import { DialogViewScheduleComponent } from '../../../../../shared/dialog-view-schedule/dialog-view-schedule.component';
import { DialogExportComponent } from '../../../../../shared/dialog-export/dialog-export.component';

import { ReportsService } from '../../../../services/admin/reports/reports.service';
import { ReportHeaderService } from '../../../../services/report-header/report-header.service';

import { fadeAnimation } from '../../../../animations/animations';

import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

interface Room {
  academicYear: any;
  semester: any;
  roomId: number;
  roomCode: string;
  location: string;
  floorLevel: string;
  capacity: number;
  schedules: any[];
}

@Component({
  selector: 'app-report-rooms',
  imports: [
    CommonModule,
    LoadingComponent,
    MatTableModule,
    MatPaginatorModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    FormsModule,
    MatDialogModule,
    MatSelectModule,
    MatFormFieldModule,
    MatSymbolDirective,
    ReportsHeaderComponent
],
  templateUrl: './report-rooms.component.html',
  styleUrls: ['./report-rooms.component.scss'],
  animations: [fadeAnimation],
})
export class ReportRoomsComponent implements OnInit, AfterViewInit, AfterViewChecked, OnDestroy {
  inputFields: InputField[] = [
    {
      type: 'text',
      label: 'Search Rooms',
      key: 'search',
    },
  ];

  displayedColumns: string[] = [
    'index',
    'roomCode',
    'location',
    'floor',
    'capacity',
    'action',
  ];

  dataSource = new MatTableDataSource<Room>();
  filteredData: Room[] = [];
  isLoading = true;
  isTermsLoading = true;
  hasAnySchedules = false;
  availableTerms: any[] = [];
  selectedTermId: number | null = null;

  private searchInput$ = new Subject<string>();

  @ViewChild(MatPaginator) paginator!: MatPaginator;

  private destroy$ = new Subject<void>();

  constructor(
    private reportsService: ReportsService,
    public dialog: MatDialog,
    private reportHeaderService: ReportHeaderService,
  ) {}

  ngOnInit(): void {
    this.reportsService.selectedTerm$
      .pipe(
        takeUntil(this.destroy$),
        filter((termId) => termId !== null),
      )
      .subscribe((termId) => {
        this.fetchRoomData(termId);
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

  fetchRoomData(termId: number | null = null): void {
    this.isLoading = true;
    this.reportsService.getRoomSchedulesReport(termId).subscribe({
      next: (response) => {
        const rooms = response.room_schedule_reports.rooms.map((room: any) => ({
          roomId: room.room_id,
          roomCode: room.room_code && room.room_code.trim() !== '' ? room.room_code : 'TBA',
          location: room.location,
          floorLevel: room.floor_level,
          capacity: room.capacity,
          schedules: room.schedules,
          academicYear: `${response.room_schedule_reports.year_start}-${response.room_schedule_reports.year_end}`,
          semester: this.getSemesterDisplay(response.room_schedule_reports.semester),
        }));

        const regularRooms = rooms.filter((r: Room) => r.roomCode !== 'TBA');
        const tbaRoom = rooms.find((r: Room) => r.roomCode === 'TBA');

        const sortedRooms = regularRooms.sort((a: Room, b: Room) =>
          a.roomCode.localeCompare(b.roomCode)
        );

        const finalRooms = tbaRoom ? [...sortedRooms, tbaRoom] : sortedRooms;

        this.isLoading = false;
        this.dataSource.data = finalRooms;
        this.filteredData = [...finalRooms];
        this.dataSource.paginator = this.paginator;

        this.hasAnySchedules = this.filteredData.some((room) => this.hasSchedules(room));
      },
      error: (error) => {
        this.isLoading = false;
        console.error('Error fetching room data:', error);
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
        (room) =>
          room.roomCode.toLowerCase().includes(searchQuery) ||
          room.location.toLowerCase().includes(searchQuery) ||
          room.floorLevel.toLowerCase().includes(searchQuery),
      );
    }
  }

  onView(element: Room): void {
    this.dialog.open(DialogViewScheduleComponent, {
      maxWidth: '90vw',
      width: '100%',
      autoFocus: true,
      data: {
        exportType: 'single',
        entity: 'room',
        entityData: element.schedules,
        customTitle: `Room ${element.roomCode}`,
        academicYear: element.academicYear,
        semester: element.semester,
        generatePdfFunction: (preview: boolean) => this.createPdfBlob(element),
        generateExcelFunction: async () => {
          const excelBlob = await this.generateExcelBlob(element);
          saveAs(excelBlob, `${element.roomCode.replace(/\s+/g, '_')}_Schedule.xlsx`);
        },
      },
      disableClose: true,
    });
  }

  onExportAll() {
    const academicYear = this.filteredData[0]?.academicYear;
    const semester = this.filteredData[0]?.semester;
    const baseFileName = `All_Room_Schedules_${academicYear}_${semester?.replace(/\s+/g, '_')}`;

    this.dialog.open(DialogViewScheduleComponent, {
      maxWidth: '90vw',
      width: '100%',
      autoFocus: true,
      data: {
        exportType: 'all',
        entity: 'room',
        entityData: this.filteredData.filter(r => r.schedules && r.schedules.length > 0).map(r => r.schedules).flat(),
        customTitle: 'All Room Schedules',
        fileName: baseFileName,
        academicYear: academicYear,
        semester: semester,
        generatePdfFunction: () => this.generateAllRoomsPdfBlob(),
        generateExcelFunction: async () => {
          const excelBlob = await this.generateExcelBlobAll();
          saveAs(excelBlob, `${baseFileName}.xlsx`);
        },
        showViewToggle: false,
      },
      disableClose: true,
    });
  }

  onExportSingle(element: Room): void {
    const baseFileName = `${element.roomCode.replace(/\s+/g, '_')}_Schedules_${element.academicYear}_${element.semester.replace(/\s+/g, '_')}`;

    this.dialog.open(DialogExportComponent, {
      width: '90vw',
      maxWidth: '1200px',
      disableClose: true,
      data: {
        exportType: 'single',
        customTitle: `Room ${element.roomCode}`,
        subtitle: `For Academic Year ${element.academicYear}, ${element.semester}`,
        generatePdfFunction: () => this.createPdfBlob(element),
        generateExcelFunction: async () => {
          const excelBlob = await this.generateExcelBlob(element);
          saveAs(excelBlob, `${baseFileName}.xlsx`);
        },
        generateFileNameFunction: () => `${baseFileName}.pdf`
      }
    });
  }

  // --- EXCEL GENERATION METHODS ---

  private async generateExcelBlobAll(): Promise<Blob> {
    const workbook = new ExcelJS.Workbook();

    for (const room of this.filteredData) {
      if (room.schedules && room.schedules.length > 0) {
        // Create a safe name for the tab
        const tabName = `Room ${room.roomCode}`.substring(0, 31).replace(/[^\w\s-]/gi, '');
        const worksheet = workbook.addWorksheet(tabName);
        this.applyRoomExcelLayout(worksheet, room);
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  private async generateExcelBlob(room: Room): Promise<Blob> {
    const workbook = new ExcelJS.Workbook();
    const tabName = `Room ${room.roomCode}`.substring(0, 31).replace(/[^\w\s-]/gi, '');
    const worksheet = workbook.addWorksheet(tabName);
    
    this.applyRoomExcelLayout(worksheet, room);

    const buffer = await workbook.xlsx.writeBuffer();
    return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  private applyRoomExcelLayout(worksheet: ExcelJS.Worksheet, room: Room) {
    worksheet.pageSetup = {
      orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 }
    };

    worksheet.columns = [
      { width: 15 }, { width: 40 }, { width: 20 }, { width: 25 }, { width: 25 }
    ];

    worksheet.mergeCells('A1:C1'); worksheet.mergeCells('D1:E1');
    worksheet.mergeCells('A2:C2'); worksheet.mergeCells('D2:E2');

    worksheet.getCell('A1').value = `Room: ${room.roomCode} (${room.location})`;
    worksheet.getCell('D1').value = `Floor: ${room.floorLevel} | Capacity: ${room.capacity}`;
    worksheet.getCell('A2').value = `School Year: ${room.academicYear}`;
    worksheet.getCell('D2').value = `Semester: ${room.semester}`;

    ['A1', 'D1', 'A2', 'D2'].forEach(c => {
      const cell = worksheet.getCell(c);
      cell.font = { bold: true };
      cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
    });

    worksheet.addRow([]);

    const headerRow = worksheet.addRow(['Subject Code', 'Description', 'Section', 'Professor', 'Schedule']);
    headerRow.height = 25;
    headerRow.eachCell(cell => {
      cell.font = { bold: true };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
    });

    if (room.schedules && room.schedules.length > 0) {
      room.schedules.forEach((schedule: any) => {
        const dayShort = schedule.day.substring(0, 3).toUpperCase();
        const timeRange = `${this.formatTimeTo12Hour(schedule.start_time)} - ${this.formatTimeTo12Hour(schedule.end_time)}`;
        
        const row = worksheet.addRow([
          schedule.course_details?.course_code || '',
          schedule.course_details?.course_title || '',
          `${schedule.program_code} ${schedule.year_level}-${schedule.section_name}`,
          schedule.faculty_name || '',
          `${dayShort}\n${timeRange}`
        ]);

        row.eachCell((cell, colNum) => {
          cell.alignment = { vertical: 'middle', horizontal: colNum === 2 ? 'left' : 'center', wrapText: true };
          cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
        });
      });
    }
  }

  // --- PDF GENERATION ---

  updateDisplayedData() { console.log('Paginator updated'); }

  generateAllRoomsPdfBlob(): Blob {
    const doc = new jsPDF('landscape', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.width;
    const margin = 10;
    const topMargin = 15;
    const logoSize = 22;

    let hasPages = false;

    this.filteredData.forEach((room) => {
      if (room.schedules && room.schedules.length > 0) {
        if (hasPages) {
          this.reportHeaderService.addStandardFooter(doc);
          doc.addPage();
        }
        hasPages = true;

        const subtitle = this.getAcademicYearSubtitle(room);
        let currentY = this.drawHeader(
          doc, topMargin, pageWidth, margin, logoSize,
          `Room ${room.roomCode} Schedule`, subtitle,
        );
        this.drawScheduleTable(doc, room.schedules, subtitle, currentY, margin, pageWidth);
      }
    });

    if (hasPages) {
      this.reportHeaderService.addStandardFooter(doc);
    } else {
      doc.text("No schedules available.", 10, 20);
    }

    return doc.output('blob');
  }

  createPdfBlob(room: Room): Blob {
    const doc = new jsPDF('landscape', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.width;
    const margin = 10;
    const topMargin = 15;
    const logoSize = 22;
    const subtitle = this.getAcademicYearSubtitle(room);

    if (room.schedules && room.schedules.length > 0) {
      let currentY = this.drawHeader(
        doc, topMargin, pageWidth, margin, logoSize,
        `Room ${room.roomCode}`, subtitle,
      );
      this.drawScheduleTable(doc, room.schedules, subtitle, currentY, margin, pageWidth);
    }

    this.reportHeaderService.addStandardFooter(doc);
    return doc.output('blob');
  }

  drawHeader(doc: jsPDF, startY: number, pageWidth: number, margin: number, logoSize: number, title: string, subtitle: string): number {
    let currentY = startY;
    this.reportHeaderService.addHeader(doc, title, currentY, subtitle).subscribe((newY) => { currentY = newY; });
    return currentY;
  }

  drawScheduleTable(doc: jsPDF, scheduleData: any[], subtitle: string, startY: number, margin: number, pageWidth: number): void {
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
      currentY = this.drawHeader(doc, 15, pageWidth, margin, 22, doc.getNumberOfPages() > 1 ? 'Room Schedule (Continued)' : 'Room Schedule', subtitle);

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
          const scheduleContent = [
            item.course_details?.course_code || '',
            item.course_details?.course_title || '',
            `${item.program_code} ${item.year_level} - ${item.section_name}`,
            item.faculty_name || '',
            `${this.formatTimeTo12Hour(item.start_time)} - ${this.formatTimeTo12Hour(item.end_time)}`,
          ];

          const boxHeight = this.calculateBoxHeight(doc, scheduleContent, dayColumnWidth);

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
          scheduleContent.forEach((line: string, index) => {
            doc.setTextColor(0); doc.setFontSize(9); doc.setFont('helvetica', index <= 1 ? 'bold' : 'normal');
            const wrappedLines = doc.splitTextToSize(line, dayColumnWidth - 10);
            wrappedLines.forEach((wrappedLine: string) => {
              doc.text(wrappedLine, xPosition + 5, textYPosition); textYPosition += 5;
            });
            if (index === scheduleContent.length - 1) {
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

  getAcademicYearSubtitle(room: Room): string {
    return `For Academic Year ${room.academicYear}, ${room.semester}`;
  }

  hasSchedules(room: Room): boolean {
    return room.schedules && room.schedules.length > 0;
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
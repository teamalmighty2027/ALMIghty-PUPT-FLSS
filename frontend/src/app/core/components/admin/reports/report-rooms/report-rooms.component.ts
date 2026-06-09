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

interface TimeSlot {
  time: string;
  minutes: number;
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
  timeSlots: TimeSlot[] = [];

  private searchInput$ = new Subject<string>();

  @ViewChild(MatPaginator) paginator!: MatPaginator;

  private destroy$ = new Subject<void>();

  constructor(
    private reportsService: ReportsService,
    public dialog: MatDialog,
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
    });
  }

  onExportSingle(element: Room): void {
    const baseFileName = `${element.roomCode.replace(/\s+/g, '_')}_Schedules_${element.academicYear}_${element.semester.replace(/\s+/g, '_')}`;

    this.dialog.open(DialogExportComponent, {
      width: '90vw',
      maxWidth: '1200px',
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

  private groupRoomSchedules(schedules: any[]): any[] {
    const mergedMap = new Map<string, any>();

    for (const item of schedules) {
      const courseCode = (item.course_details?.course_code || 'UNKNOWN').trim().toUpperCase();
      const sectionStr = `${item.program_code || ''} ${item.year_level || ''}-${item.section_name || ''}`.trim();
      const facultyName = (item.faculty_name || '').trim().toUpperCase() === 'N/A' || !(item.faculty_name || '').trim()
        ? 'Faculty TBA'
        : (item.faculty_name || '').trim();

      // Group by course code + section + faculty — same course for same class merges days/times
      const key = `${courseCode}|${sectionStr}|${facultyName}`;

      if (mergedMap.has(key)) {
        mergedMap.get(key)._rawSchedules.push(item);
      } else {
        mergedMap.set(key, { ...item, _rawSchedules: [item], _displayFaculty: facultyName });
      }
    }

    return Array.from(mergedMap.values()).map(merged => {
      // Unique day+time strings
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

      // Section display
      const sectionsSet = new Set<string>();
      merged._rawSchedules.forEach((s: any) => {
        let sec = `${s.program_code || ''} ${s.year_level || ''}-${s.section_name || ''}`.trim();
        if (sec === '-') sec = 'Section TBA';
        sectionsSet.add(sec);
      });

      return {
        ...merged,
        displayDay: Array.from(daysSet).join('/'),
        displayTime: Array.from(timeSet).join('\n'),
        displaySection: Array.from(sectionsSet).sort().join(' / '),
        displayFaculty: merged._displayFaculty,
      };
    });
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
      const groupedSchedules = this.groupRoomSchedules(room.schedules);

      groupedSchedules.forEach((schedule: any) => {
        const isBridging = schedule.course_details?.offering_type === 'bridging';
        const courseCode = schedule.course_details?.course_code || '';
        const displayCourseCode = isBridging ? `${courseCode}\n[Bridging]` : courseCode;

        const row = worksheet.addRow([
          displayCourseCode,
          schedule.course_details?.course_title || '',
          schedule.displaySection,
          schedule.displayFaculty,
          `${schedule.displayDay}\n${schedule.displayTime}`
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

        const title = `Room ${room.roomCode} Schedule`;
        const subtitle = this.getAcademicYearSubtitle(room);
        let currentY = this.drawHeader(doc, topMargin, pageWidth, margin, logoSize, title, subtitle);
        
        this.drawScheduleTable(doc, room.schedules, title, subtitle, currentY, margin, pageWidth);
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
    
    if (room.schedules && room.schedules.length > 0) {
      const title = `Room ${room.roomCode}`;
      const subtitle = this.getAcademicYearSubtitle(room);

      let currentY = this.drawHeader(doc, topMargin, pageWidth, margin, logoSize, title, subtitle);
      this.drawScheduleTable(doc, room.schedules, title, subtitle, currentY, margin, pageWidth);
    }

    this.reportHeaderService.addStandardFooter(doc);
    return doc.output('blob');
  }

  drawHeader(doc: jsPDF, startY: number, pageWidth: number, margin: number, logoSize: number, title: string, subtitle: string): number {
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
      // Group same-slot bridging entries into one merged block
      const mergedMap = new Map<string, any>();
      for (const item of scheduleData) {
        const key = `${item.day}|${item.start_time}|${item.end_time}`;
        if (mergedMap.has(key)) {
          const existing = mergedMap.get(key);
          if (!existing._mergedFaculty) {
            existing._mergedFaculty = [existing.faculty_name];
          }
          if (!existing._mergedFaculty.includes(item.faculty_name)) {
            existing._mergedFaculty.push(item.faculty_name);
          }
        } else {
          mergedMap.set(key, { ...item });
        }
      }
      const sortedScheduleData = [...mergedMap.values()].sort(
        (a, b) => this.timeToMinutes(a.start_time) - this.timeToMinutes(b.start_time)
      );

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

        doc.setFillColor(240, 240, 240);
        doc.setDrawColor(128, 0, 0);
        doc.setLineWidth(0.3);
        doc.rect(xPos, yPos, dayColumnWidth, height, 'FD');

        let startPadding = 5;
        let lineSpacing = 4.2;
        let bottomBoundary = 6;
        let codeFontSize = 10;
        let textFontSize = 9;
        let timeFontSize = 9.5;
        let timeBottomPadding = 2;

        if (duration <= 2) {
          startPadding = 3.5; lineSpacing = 2.8; bottomBoundary = 3.5;
          codeFontSize = 7.5; textFontSize = 6.5; timeFontSize = 7; timeBottomPadding = 1.2;
        } else if (duration === 3) {
          startPadding = 4; lineSpacing = 3.4; bottomBoundary = 4.5;
          codeFontSize = 8.5; textFontSize = 7.5; timeFontSize = 8; timeBottomPadding = 1.5;
        } else if (duration === 4) {
          startPadding = 5; lineSpacing = 4; bottomBoundary = 5;
          codeFontSize = 9.5; textFontSize = 8.5; timeFontSize = 9; timeBottomPadding = 1.8;
        }

        const timeString = `${this.formatTimeTo12Hour(item.start_time)} - ${this.formatTimeTo12Hour(item.end_time)}`;
        doc.setTextColor(0);
        doc.setFontSize(timeFontSize);
        doc.setFont('helvetica', 'normal');
        doc.text(timeString, xPos + dayColumnWidth / 2, yPos + height - timeBottomPadding, { align: 'center' });

        let facultyName = item.faculty_name || '';
        if (facultyName.trim().toUpperCase() === 'N/A') facultyName = 'Faculty TBA';

        const isBridging = item.course_details?.offering_type === 'bridging';

        const content = [
          item.course_details?.course_code || '',
          item.course_details?.course_title || '',
          facultyName,
          item.room_code && item.room_code.trim() !== '' ? item.room_code : 'Room TBA'
        ].filter(line => line !== '');

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
}
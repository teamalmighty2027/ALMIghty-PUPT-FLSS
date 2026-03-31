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

import { ReportsService } from '../../../../services/admin/reports/reports.service';
import { ReportHeaderService } from '../../../../services/report-header/report-header.service';

import { fadeAnimation } from '../../../../animations/animations';

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
export class ReportRoomsComponent
  implements OnInit, AfterViewInit, AfterViewChecked, OnDestroy
{
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
      case 1:
        return '1st Semester';
      case 2:
        return '2nd Semester';
      case 3:
        return 'Summer';
      default:
        return `Sem ${semesterNumber}`;
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
          semester: this.getSemesterDisplay(
            response.room_schedule_reports.semester,
          ),
        }));

        // ===== Separate TBA from regular rooms and sort alphabetically =====
        const regularRooms = rooms.filter((r: Room) => r.roomCode !== 'TBA');
        const tbaRoom = rooms.find((r: Room) => r.roomCode === 'TBA');

        // Sort regular rooms alphabetically by room code
        const sortedRooms = regularRooms.sort((a: Room, b: Room) =>
          a.roomCode.localeCompare(b.roomCode)
        );

        // Add TBA at the end if it exists
        const finalRooms = tbaRoom ? [...sortedRooms, tbaRoom] : sortedRooms;

        this.isLoading = false;
        this.dataSource.data = finalRooms;
        this.filteredData = [...finalRooms];
        this.dataSource.paginator = this.paginator;

        this.hasAnySchedules = this.filteredData.some((room) =>
          this.hasSchedules(room),
        );
      },
      error: (error) => {
        this.isLoading = false;
        console.error('Error fetching room data:', error);
      },
    });
  }

  getSemesterDisplay(semester: number): string {
    switch (semester) {
      case 1:
        return '1st Semester';
      case 2:
        return '2nd Semester';
      case 3:
        return 'Summer Semester';
      default:
        return 'Unknown Semester';
    }
  }

  getRowIndex(index: number): number {
    if (this.paginator) {
      return index + 1 + this.paginator.pageIndex * this.paginator.pageSize;
    }
    return index + 1;
  }

  onInputChange(changes: { [key: string]: any }) {
    const searchQuery = changes['search']
      ? changes['search'].trim().toLowerCase()
      : '';
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
      data: {
        exportType: 'single',
        entity: 'room',
        entityData: element.schedules,
        customTitle: `Room ${element.roomCode}`,
        academicYear: element.academicYear,
        semester: element.semester,

        generatePdfFunction: (preview: boolean) => this.createPdfBlob(element),
      },
      disableClose: true,
    });
  }

  onExportAll() {
    const generatePdfFunction = (preview: boolean): Blob | void => {
      return this.generateAllRoomsPdfBlob();
    };

    this.dialog.open(DialogViewScheduleComponent, {
      maxWidth: '90vw',
      width: '100%',
      data: {
        exportType: 'all',
        entity: 'room',
        entityData: this.filteredData,
        customTitle: 'All Room Schedules',
        fileName: `All_Room_Schedules_${
          this.filteredData[0]?.academicYear
        }_${this.filteredData[0]?.semester.replace(/\s+/g, '_')}`,
        academicYear: this.filteredData[0]?.academicYear,
        semester: this.filteredData[0]?.semester,
        generatePdfFunction: generatePdfFunction,
        showViewToggle: false,
      },
      disableClose: true,
    });
  }

  onExportSingle(element: Room): void {
    const pdfBlob = this.createPdfBlob(element);
    const blobUrl = URL.createObjectURL(pdfBlob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `${element.roomCode.replace(/\s+/g, '_')}_Schedules_${
      element.academicYear
    }_${element.semester.replace(/\s+/g, '_')}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  }

  updateDisplayedData() {
    console.log('Paginator updated');
  }

  generateAllRoomsPdfBlob(): Blob {
    const doc = new jsPDF('landscape', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.width;
    const margin = 10;
    const topMargin = 15;
    const logoSize = 22;

    if (this.filteredData.length === 0) {
      console.error('No data available to export.');
      return new Blob();
    }

    this.filteredData.forEach((room, index) => {
      if (index > 0) {
        this.reportHeaderService.addStandardFooter(doc);
        doc.addPage();
      }

      const subtitle = this.getAcademicYearSubtitle(room);
      let currentY = this.drawHeader(
        doc, topMargin, pageWidth, margin, logoSize,
        `Room ${room.roomCode} Schedule`, subtitle,
      );

      this.drawScheduleTable(doc, room.schedules ?? [], subtitle, currentY, margin, pageWidth);
    });

    this.reportHeaderService.addStandardFooter(doc);
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

  drawHeader(
    doc: jsPDF,
    startY: number,
    pageWidth: number,
    margin: number,
    logoSize: number,
    title: string,
    subtitle: string,
  ): number {
    let currentY = startY;

    // Use the report header service with subtitle
    this.reportHeaderService
      .addHeader(doc, title, currentY, subtitle)
      .subscribe((newY) => {
        currentY = newY;
      });

    return currentY;
  }

  drawScheduleTable(
    doc: jsPDF,
    scheduleData: any[],
    subtitle: string,
    startY: number,
    margin: number,
    pageWidth: number,
  ): void {
    const hasSchedules = scheduleData && scheduleData.length > 0;

    if (!hasSchedules) {
      doc.setFontSize(20);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(128, 128, 128);
      doc.text('No Assigned Schedule', pageWidth / 2, startY + 50, {
        align: 'center',
      });
      return;
    }

    const days = [
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ];
    const dayColumnWidth = (pageWidth - margin * 2) / days.length;
    const pageHeight = doc.internal.pageSize.height;
    const maxContentHeight = pageHeight - 20; // Adjusted for footer space

    let currentY = startY;
    let maxYPosition = currentY;

    // Helper to trigger a new page
    const startNewPage = () => {
      this.reportHeaderService.addStandardFooter(doc); // Add footer before page break
      doc.addPage();
      currentY = this.drawHeader(
        doc,
        15,
        pageWidth,
        margin,
        22,
        doc.getNumberOfPages() > 1 ? 'Room Schedule (Continued)' : 'Room Schedule',
        subtitle,
      );

      days.forEach((day, index) => {
        const xPosition = margin + index * dayColumnWidth;
        doc.setFillColor(128, 0, 0);
        doc.setTextColor(255, 255, 255);
        doc.rect(xPosition, currentY, dayColumnWidth, 10, 'F');
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(day, xPosition + dayColumnWidth / 2, currentY + 7, {
          align: 'center',
        });
      });

      currentY += 12;
      return currentY;
    };

    // Draw initial day headers
    days.forEach((day, index) => {
      const xPosition = margin + index * dayColumnWidth;
      doc.setFillColor(128, 0, 0);
      doc.setTextColor(255, 255, 255);
      doc.rect(xPosition, currentY, dayColumnWidth, 10, 'F');
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(day, xPosition + dayColumnWidth / 2, currentY + 7, {
        align: 'center',
      });
    });

    currentY += 12;

    // Loop through each day and display schedules
    days.forEach((day, dayIndex) => {
      const xPosition = margin + dayIndex * dayColumnWidth;
      let yPosition = currentY;

      const daySchedule = scheduleData
        .filter((item: any) => item.day === day)
        .sort(
          (a: any, b: any) =>
            this.timeToMinutes(a.start_time) - this.timeToMinutes(b.start_time),
        );

      if (daySchedule.length > 0) {
        daySchedule.forEach((item: any) => {
          
          // IMPORTANT: Clean array with NO functions inside it
          const scheduleContent = [
            item.course_details.course_code,
            item.course_details.course_title,
            `${item.program_code} ${item.year_level} - ${item.section_name}`,
            item.faculty_name,
            `${this.formatTimeTo12Hour(item.start_time)} - ${this.formatTimeTo12Hour(item.end_time)}`,
          ];

          const boxHeight = this.calculateBoxHeight(doc, scheduleContent, dayColumnWidth);

          if (yPosition + boxHeight > maxContentHeight) {
            days.forEach((_, i) => {
              const lineX = margin + i * dayColumnWidth;
              doc.setDrawColor(200, 200, 200);
              doc.setLineWidth(0.5);
              doc.line(lineX, startY, lineX, maxYPosition);
            });
            doc.line(pageWidth - margin, startY, pageWidth - margin, maxYPosition);

            yPosition = startNewPage();
            maxYPosition = yPosition;
          }

          doc.setFillColor(240, 240, 240);
          doc.rect(xPosition, yPosition, dayColumnWidth, boxHeight, 'F');

          let textYPosition = yPosition + 5;
          scheduleContent.forEach((line: string, index) => {
            doc.setTextColor(0);
            doc.setFontSize(9);
            doc.setFont('helvetica', index <= 1 ? 'bold' : 'normal');

            const wrappedLines = doc.splitTextToSize(line, dayColumnWidth - 10);
            wrappedLines.forEach((wrappedLine: string) => {
              doc.text(wrappedLine, xPosition + 5, textYPosition);
              textYPosition += 5;
            });

            if (index === scheduleContent.length - 1) {
              const timeTextWidth = doc.getTextWidth(line);
              doc.setDrawColor(0, 0, 0);
              doc.setLineWidth(0.2);
              doc.line(
                xPosition + 5,
                textYPosition - 4,
                xPosition + 5 + timeTextWidth,
                textYPosition - 4,
              );
            }
          });

          yPosition += boxHeight + 5;
          if (yPosition > maxYPosition) {
            maxYPosition = yPosition;
          }
        });
      }
    });

    days.forEach((_, i) => {
      const lineX = margin + i * dayColumnWidth;
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.5);
      doc.line(lineX, startY, lineX, maxYPosition);
    });

    doc.line(pageWidth - margin, startY, pageWidth - margin, maxYPosition);
    doc.line(margin, maxYPosition, pageWidth - margin, maxYPosition);
    
    // (Old "Prepared By" code is completely gone from here)
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

  private calculateBoxHeight(
    doc: jsPDF,
    content: string[],
    columnWidth: number,
  ): number {
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
}

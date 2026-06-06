import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';

import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSymbolDirective } from '../../../imports/mat-symbol.directive';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs'; 

import { FacultyScheduleTimetableComponent } from '../../../../shared/faculty-schedule-timetable/faculty-schedule-timetable.component';
import { DialogScheduleHistoryComponent } from '../../../../shared/dialog-schedule-history/dialog-schedule-history.component';
import { DialogAppealScheduleComponent } from '../../../../shared/dialog-appeal-schedule/dialog-appeal-schedule.component';
import { DialogMyAppealsComponent } from '../../../../shared/dialog-my-appeals/dialog-my-appeals.component';
import { DialogRequestAccessComponent } from '../../../../shared/dialog-request-access/dialog-request-access.component';
import { LoadingComponent } from '../../../../shared/loading/loading.component';

import { ReportsService } from '../../../services/admin/reports/reports.service';
import { AuthService } from '../../../services/auth/auth.service';
import { ReschedulingService } from '../../../services/faculty/rescheduling/rescheduling.service'; 

import { fadeAnimation } from '../../../animations/animations';

import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

type ScheduleView = 'official' | 'internal';

export interface ScheduleBlock {
  schedule_id: number;
  course_code: string;
  course_title: string;
  program_code: string;
  year_level: number | string;
  section: string;
  day: string;
  start_time: string;
  end_time: string;
  room_code: string;
}

@Component({
  selector: 'app-load-and-schedule',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatTooltipModule,
    MatButtonToggleModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    FacultyScheduleTimetableComponent,
    LoadingComponent,
    MatSymbolDirective,
  ],
  templateUrl: './load-and-schedule.component.html',
  styleUrl: './load-and-schedule.component.scss',
  animations: [fadeAnimation],
})
export class LoadAndScheduleComponent implements OnInit {
  @ViewChild(FacultyScheduleTimetableComponent) timetableComponent!: FacultyScheduleTimetableComponent;

  facultySchedule: any;
  myAppeals: any[] = []; 
  isLoading = true;
  isPublished = false;
  isAppealEnabled = false;
  hasAppealRequest = false;

  activeView: ScheduleView = 'official';
  readonly timeOptions: string[] = this.generateTimeOptions();

  constructor(
    private reportsService: ReportsService,
    private authService: AuthService,
    private reschedulingService: ReschedulingService, 
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
  ) {}

  ngOnInit() {
    this.loadFacultySchedule();
  }

  loadFacultySchedule() {
    const facultyId = this.authService.getUserFacultyId();
    if (facultyId) {
      forkJoin({
        scheduleReq: this.reportsService.getSingleFacultySchedule(+facultyId),
        appealsReq: this.reschedulingService.getMyAppeals()
      }).subscribe({
        next: (res: any) => {
          // 1. Assign the main schedule data
          this.facultySchedule = res.scheduleReq.faculty_schedule;
          this.myAppeals = res.appealsReq;
          
          // 2. Map the publication status
          this.isPublished = this.facultySchedule.is_published === 1;
          
          // 3. Map the Appeal Flags (Check if they are in the root or inside faculty_status)
          // Map from the new root-level properties we added to the backend response
          this.isAppealEnabled = !!res.scheduleReq.is_appeal_enabled;
          this.hasAppealRequest = !!res.scheduleReq.has_appeal_request;
          
          this.isLoading = false;
        },
        error: () => { this.isLoading = false; }
      });
    } else {
      this.isLoading = false;
    }
  }

  onViewToggle(view: ScheduleView): void {
    this.activeView = view;
  }

  get isOfficialView(): boolean  { return this.activeView === 'official'; }
  get isInternalView(): boolean  { return this.activeView === 'internal'; }

  openScheduleHistory(): void {
    this.dialog.open(DialogScheduleHistoryComponent, {
      maxWidth: '90vw', width: '100%', autoFocus: true,
    });
  }

  openAppealDialog(block: any): void {
    if (!this.isPublished) {
      this.snackBar.open('No official schedule published yet.', 'Close', { duration: 3000 });
      return;
    }

    // Intercept if appeals are disabled
    if (!this.isAppealEnabled) {
      this.openRequestAppealAccessDialog();
      return;
    }

    const formattedStart = this.formatTo12Hour(block.start_time);
    const startIndex = this.timeOptions.indexOf(formattedStart);
    const endTimeOptions = this.timeOptions.slice(
      this.timeOptions.indexOf(this.formatTo12Hour(block.start_time)) + 1
    );

    const dialogRef = this.dialog.open(DialogAppealScheduleComponent, {
      width: '520px', maxWidth: '95vw', maxHeight: '90vh',
      autoFocus: true,
      data: {
        isEditMode: true,
        facultyName: this.facultySchedule?.faculty_name ?? '',
        appealFile: null,
        appealDay: block.day,
        appealStartTime: '',
        appealEndTime: '',
        appealRoom: '',
        reason: '',
        options: { timeOptions: this.timeOptions, endTimeOptions },
        original: {
          scheduleId:  block.schedule_id,
          courseCode:  block.course_details.course_code,
          courseTitle: block.course_details.course_title,
          program:     block.program_code,
          yearLevel:   String(block.year_level),
          section:     block.section_name,
          day:         block.day,
          roomCode:    block.room_code,
          timeRange:   `${this.formatTo12Hour(block.start_time)} - ${this.formatTo12Hour(block.end_time)}`,
        },
      },
    });

    dialogRef.afterClosed().subscribe(res => {
      if (res) this.loadFacultySchedule();
    });
  }

  openRequestAppealAccessDialog(): void {
  const dialogRef = this.dialog.open(DialogRequestAccessComponent, {
    data: {
      has_request: this.hasAppealRequest,
      facultyId: this.authService.getUserFacultyId(),
      requestType: 'appeal'
    },
  });

  dialogRef.afterClosed().subscribe((result) => {
    if (result === true) {
      // Faculty just SENT a request
      this.hasAppealRequest = true;
      // DO NOT reload - keep local state, avoid re-triggering popup
    } else if (result === false) {
      // Faculty just CANCELLED their request
      this.hasAppealRequest = false;
      // DO NOT reload here either
    }
    // Only reload if result is undefined (dialog closed via X / Close button with no action)
    // Even then, don't reload — just trust local state
  });
}

  openMyAppealsDialog(block: any): void {
    this.dialog.open(DialogMyAppealsComponent, {
      width: '620px', maxWidth: '95vw', maxHeight: '90vh',
      autoFocus: true,
      data: { scheduleId: block.schedule_id },
    });
  }

  get academicYear(): string {
    return this.facultySchedule ? `${this.facultySchedule.year_start}-${this.facultySchedule.year_end}` : '';
  }

  get semester(): string {
    if (!this.facultySchedule) return '';
    switch (this.facultySchedule.semester) {
      case 1: return '1st Semester';
      case 2: return '2nd Semester';
      case 3: return 'Summer Semester';
      default: return '';
    }
  }

  get internalArrangementSchedule(): any {
    if (!this.facultySchedule) return null;
    
    const clone = JSON.parse(JSON.stringify(this.facultySchedule));
    const approvedAppeals = this.myAppeals?.filter(a => a.is_approved === 1 || a.is_approved === true) || [];

    if (Array.isArray(clone.schedules)) {
      clone.schedules = clone.schedules.map((sched: any) => {
        const matchingAppeal = approvedAppeals.find(a => a.schedule_id === sched.schedule_id);
        if (matchingAppeal) {
          return {
            ...sched,
            day: matchingAppeal.appeal_day,
            start_time: matchingAppeal.appeal_start_time,
            end_time: matchingAppeal.appeal_end_time,
            room_code: matchingAppeal.appeal_room || sched.room_code,
          };
        }
        return sched;
      });
    }

    return clone;
  }

  get hasInternalArrangements(): boolean {
    return (this.internalArrangementSchedule?.schedules?.length ?? 0) > 0;
  }

  private generateTimeOptions(): string[] {
    const options: string[] = [];
    for (let hour = 7; hour <= 21; hour++) {
      for (const minute of [0, 30]) {
        const period      = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
        const displayMin  = minute === 0 ? '00' : '30';
        options.push(`${displayHour}:${displayMin} ${period}`);
      }
    }
    return options;
  }

  private formatTo12Hour(time: string | null | undefined): string {
    if (!time) return '—';
    if (time.includes('AM') || time.includes('PM')) return time;
    const [hourStr, minuteStr] = time.split(':');
    let hours = parseInt(hourStr, 10);
    const minutes = minuteStr ?? '00';
    const period  = hours >= 12 ? 'PM' : 'AM';
    if (hours === 0) hours = 12;
    else if (hours > 12) hours -= 12;
    return `${hours}:${minutes} ${period}`;
  }

  onExportPdf() {
    if (this.timetableComponent) {
      this.timetableComponent.onExportPdf(); 
    }
  }

  async onExportExcel() {
    if (!this.facultySchedule) {
      this.snackBar.open('No schedule data available to export.', 'Close', { duration: 3000 });
      return;
    }

    const scheduleToExport = this.isOfficialView ? this.facultySchedule : this.internalArrangementSchedule;
    const schedulesArray = scheduleToExport?.schedules || [];

    if (schedulesArray.length === 0) {
      this.snackBar.open('No classes found in the selected schedule view.', 'Close', { duration: 3000 });
      return;
    }

    const workbook = new ExcelJS.Workbook();
    
    const viewLabel = this.isOfficialView ? 'Official' : 'Arrangement';
    const tabName = `Schedule (${viewLabel})`;
    const worksheet = workbook.addWorksheet(tabName);

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

    worksheet.getCell('A1').value = `Faculty Name: ${scheduleToExport.faculty_name.toUpperCase()}`;
    worksheet.getCell('E1').value = `Faculty Type: ${scheduleToExport.faculty_type}`;
    worksheet.getCell('A2').value = `School Year: ${this.academicYear} | Semester: ${this.semester}`;
    worksheet.getCell('E2').value = `Total Load: ${scheduleToExport.assigned_units} Units`;

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

    const daysOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const sortedSchedules = [...schedulesArray].sort((a, b) => {
      return daysOrder.indexOf(a.day) - daysOrder.indexOf(b.day);
    });

    sortedSchedules.forEach((schedule: any) => {
      const dayShort = schedule.day.substring(0, 3).toUpperCase();
      const timeRange = `${this.formatTo12Hour(schedule.start_time)} - ${this.formatTo12Hour(schedule.end_time)}`;
      
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

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    
    const safeName = scheduleToExport.faculty_name.split(',')[0].replace(/[^\w\s]/gi, '_');
    const fileName = `${safeName}_${viewLabel}_Schedule_${this.academicYear.replace('-', '_')}.xlsx`;
    
    saveAs(blob, fileName);
  }
}
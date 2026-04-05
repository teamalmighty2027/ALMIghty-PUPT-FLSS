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
import { LoadingComponent } from '../../../../shared/loading/loading.component';

import { ReportsService } from '../../../services/admin/reports/reports.service';
import { AuthService } from '../../../services/auth/auth.service';
import { ReschedulingService } from '../../../services/faculty/rescheduling/rescheduling.service'; 

import { fadeAnimation } from '../../../animations/animations';

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
        next: ({ scheduleReq, appealsReq }) => {
          this.facultySchedule = scheduleReq.faculty_schedule;
          this.myAppeals = appealsReq;
          this.isPublished = this.facultySchedule.is_published === 1;
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
      maxWidth: '90vw', width: '100%', disableClose: true, autoFocus: true,
    });
  }

  openAppealDialog(block: any): void {
    if (!this.isPublished) {
      this.snackBar.open('No official schedule published yet.', 'Close', { duration: 3000 });
      return;
    }

    // Safeguard against indexOf returning -1
    const formattedStart = this.formatTo12Hour(block.start_time);
    const startIndex = this.timeOptions.indexOf(formattedStart);
    const endTimeOptions = this.timeOptions.slice(
      this.timeOptions.indexOf(this.formatTo12Hour(block.start_time)) + 1
    );

    const dialogRef = this.dialog.open(DialogAppealScheduleComponent, {
      width: '520px', maxWidth: '95vw', maxHeight: '90vh', disableClose: true,
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

  openMyAppealsDialog(block: any): void {
    this.dialog.open(DialogMyAppealsComponent, {
      width: '620px', maxWidth: '95vw', maxHeight: '90vh', disableClose: true,
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

  // Directly checks if there are approved appeals overriding the official schedule
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
      // Tells the child component to run the PDF code it already has
      this.timetableComponent.onExportPdf(); 
    }
  }
}
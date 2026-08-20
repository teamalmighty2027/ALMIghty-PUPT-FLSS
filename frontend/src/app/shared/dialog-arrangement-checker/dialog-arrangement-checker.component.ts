import { Component, Inject, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import {
  PopulateSchedulesResponse,
  Room,
  ScheduleArrangementOverride,
} from '../../core/models/scheduling.model';
import { ScheduleValidationService } from '../../core/services/admin/scheduling/schedule-validation.service';

export interface CourseOption {
  course_id: number;
  course_code: string;
  course_title: string;
  schedule_id?: number;
  faculty_id?: number | null;
  faculty_name?: string | null;
  room_id?: number | null;
  room_code?: string | null;
  day?: string | null;
  start_time?: string | null;
  end_time?: string | null;
}

export interface SectionItem {
  section_id: number;
  section_name: string;
  display_name: string;
  courses: CourseOption[];
}

export interface DialogArrangementCheckerData {
  cachedSchedules: PopulateSchedulesResponse;
  cachedRooms: { rooms: Room[] };
  cachedArrangements: ScheduleArrangementOverride[];
  faculties: { facultyId: number; facultyName: string }[];
  rooms: Room[];
}

@Component({
  selector: 'app-dialog-arrangement-checker',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
  ],
  templateUrl: './dialog-arrangement-checker.component.html',
  styleUrls: ['./dialog-arrangement-checker.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DialogArrangementCheckerComponent implements OnInit {
  checkerForm: FormGroup;

  programsList: { program_id: number; program_code: string; program_title: string }[] = [];
  availableYearLevels: number[] = [];
  availableSections: SectionItem[] = [];
  availableCourses: CourseOption[] = [];

  days: string[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  timeOptions: string[] = [];
  endTimeOptions: string[] = [];

  hasRunCheck = false;
  hasConflicts = false;
  conflictMessages: string[] = [];
  warningMessages: string[] = [];

  selectedScheduleId: number | null = null;

  constructor(
    public dialogRef: MatDialogRef<DialogArrangementCheckerComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DialogArrangementCheckerData,
    private fb: FormBuilder,
    private scheduleValidationService: ScheduleValidationService,
    private cdr: ChangeDetectorRef
  ) {
    this.checkerForm = this.fb.group({
      program_id: [null, Validators.required],
      year_level: [null, Validators.required],
      section_id: [null, Validators.required],
      course_id: [null, Validators.required],
      faculty_id: [null],
      room_id: [null],
      day: ['Monday', Validators.required],
      start_time: ['', Validators.required],
      end_time: ['', Validators.required],
    });
  }

  ngOnInit(): void {
    this.generateTimeOptions();
    this.extractProgramsFromCache();
    this.setupFormListeners();
  }

  private generateTimeOptions(): void {
    const startHour = 7;
    const endHour = 21;
    const options: string[] = [];

    for (let hour = startHour; hour < endHour; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        options.push(this.formatTime(hour, minute));
      }
    }
    options.push(this.formatTime(endHour, 0));
    this.timeOptions = options;
    this.endTimeOptions = [...options];
  }

  private formatTime(hour: number, minute: number): string {
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    const displayMinute = minute === 0 ? '00' : minute.toString().padStart(2, '0');
    return `${displayHour}:${displayMinute} ${period}`;
  }

  private extractProgramsFromCache(): void {
    if (!this.data.cachedSchedules?.programs) return;

    this.programsList = this.data.cachedSchedules.programs.map(p => ({
      program_id: p.program_id,
      program_code: p.program_code,
      program_title: p.program_title,
    })).sort((a, b) => a.program_code.localeCompare(b.program_code));
  }

  private setupFormListeners(): void {
    // 1. Program selected -> populate Year Levels
    this.checkerForm.get('program_id')?.valueChanges.subscribe((progId: number) => {
      const prog = this.data.cachedSchedules?.programs.find(p => p.program_id === progId);
      if (prog) {
        this.availableYearLevels = prog.year_levels
          .map(yl => yl.year_level)
          .sort((a, b) => a - b);
      } else {
        this.availableYearLevels = [];
      }

      this.availableSections = [];
      this.availableCourses = [];
      this.checkerForm.patchValue({
        year_level: null,
        section_id: null,
        course_id: null,
      }, { emitEvent: false });

      this.evaluateAutoCheck();
      this.cdr.markForCheck();
    });

    // 2. Year Level selected -> populate Sections
    this.checkerForm.get('year_level')?.valueChanges.subscribe((yearLevel: number) => {
      const progId = this.checkerForm.get('program_id')?.value;
      const prog = this.data.cachedSchedules?.programs.find(p => p.program_id === progId);
      const ylObj = prog?.year_levels.find(yl => yl.year_level === yearLevel);

      if (ylObj && prog) {
        const sectionsList: SectionItem[] = [];

        ylObj.semesters.forEach(sem => {
          sem.sections.forEach(sec => {
            const courseItems: CourseOption[] = sec.courses.map(c => ({
              course_id: c.course_id,
              course_code: c.course_code,
              course_title: c.course_title,
              schedule_id: c.schedule?.schedule_id,
              faculty_id: c.faculty_id || null,
              faculty_name: c.professor || null,
              room_id: c.room?.room_id || c.schedule?.room_id || null,
              room_code: c.room?.room_code || null,
              day: c.schedule?.day || null,
              start_time: c.schedule?.start_time || null,
              end_time: c.schedule?.end_time || null,
            }));

            sectionsList.push({
              section_id: sec.section_per_program_year_id,
              section_name: sec.section_name,
              display_name: `${prog.program_code} ${yearLevel}-${sec.section_name}`,
              courses: courseItems,
            });
          });
        });

        this.availableSections = sectionsList.sort((a, b) => a.display_name.localeCompare(b.display_name));
      } else {
        this.availableSections = [];
      }

      this.availableCourses = [];
      this.checkerForm.patchValue({
        section_id: null,
        course_id: null,
      }, { emitEvent: false });

      this.evaluateAutoCheck();
      this.cdr.markForCheck();
    });

    // 3. Section selected -> populate Courses
    this.checkerForm.get('section_id')?.valueChanges.subscribe((sectionId: number) => {
      const sec = this.availableSections.find(s => s.section_id === sectionId);
      if (sec) {
        this.availableCourses = sec.courses;
      } else {
        this.availableCourses = [];
      }

      this.checkerForm.patchValue({ course_id: null }, { emitEvent: false });
      this.evaluateAutoCheck();
      this.cdr.markForCheck();
    });

    // 4. Course selected -> auto-fill Faculty & Room
    this.checkerForm.get('course_id')?.valueChanges.subscribe((courseId: number) => {
      const selectedCourse = this.availableCourses.find(c => c.course_id === courseId);
      if (selectedCourse) {
        this.selectedScheduleId = selectedCourse.schedule_id || null;
        this.checkerForm.patchValue({
          faculty_id: selectedCourse.faculty_id || null,
          room_id: selectedCourse.room_id || null,
        }, { emitEvent: false });
      } else {
        this.selectedScheduleId = null;
      }
      this.evaluateAutoCheck();
      this.cdr.markForCheck();
    });

    // 5. Start Time selected -> filter End Time
    this.checkerForm.get('start_time')?.valueChanges.subscribe((startTime: string) => {
      this.updateEndTimeOptions(startTime);
      this.evaluateAutoCheck();
      this.cdr.markForCheck();
    });

    // Automatically check conflicts whenever all required fields are valid & changed
    this.checkerForm.valueChanges.subscribe(() => {
      this.evaluateAutoCheck();
    });
  }

  private evaluateAutoCheck(): void {
    if (this.checkerForm.valid) {
      this.runCheck();
    } else {
      this.resetResults();
    }
  }

  private updateEndTimeOptions(startTime: string): void {
    const startIndex = this.timeOptions.indexOf(startTime);
    if (startIndex === -1) {
      this.endTimeOptions = [...this.timeOptions];
      return;
    }

    this.endTimeOptions = this.timeOptions.slice(startIndex + 1);

    const currentEndTime = this.checkerForm.get('end_time')?.value;
    if (currentEndTime) {
      const endIndex = this.timeOptions.indexOf(currentEndTime);
      if (endIndex <= startIndex) {
        this.checkerForm.patchValue({ end_time: '' }, { emitEvent: false });
      }
    }
  }

  private to24Hour(timeStr: string): string {
    if (!timeStr) return '';
    const parts = timeStr.trim().split(' ');
    if (parts.length < 2) return timeStr;
    const time = parts[0];
    const period = parts[1].toUpperCase();
    let [hours, minutes] = time.split(':').map(Number);
    if (period === 'PM' && hours < 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }

  runCheck(): void {
    if (this.checkerForm.invalid) {
      this.resetResults();
      return;
    }

    const val = this.checkerForm.value;

    const validationResult = this.scheduleValidationService.validateScheduleConflictsWithArrangements(
      this.data.cachedSchedules,
      this.data.cachedRooms,
      this.data.cachedArrangements,
      {
        course_id: val.course_id,
        schedule_id: this.selectedScheduleId || 0,
        program_id: val.program_id,
        year_level: val.year_level,
        day: val.day,
        start_time: this.to24Hour(val.start_time),
        end_time: this.to24Hour(val.end_time),
        section_id: val.section_id,
        faculty_id: val.faculty_id || null,
        room_id: val.room_id || null,
      }
    );

    this.hasRunCheck = true;
    this.hasConflicts = validationResult.hasConflicts;
    this.conflictMessages = validationResult.messages || [];
    this.warningMessages = validationResult.warnings || [];
    this.cdr.markForCheck();
  }

  resetResults(): void {
    this.hasRunCheck = false;
    this.hasConflicts = false;
    this.conflictMessages = [];
    this.warningMessages = [];
  }

  close(): void {
    this.dialogRef.close();
  }
}

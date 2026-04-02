import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatOptionModule } from '@angular/material/core';
import { MatButtonModule } from '@angular/material/button';
import { MatRippleModule } from '@angular/material/core';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { PreferencesService } from '../../core/services/faculty/preference/preferences.service';
import { showHideFieldsAnimation } from '../../core/animations/animations';

interface DayButton {
  name: string;
  shortName: string;
  selected: boolean;
  startTime: string;
  endTime: string;
  endTimeOptions: string[];
}

interface DialogData {
  selectedDays: Array<{ day: string; start_time: string; end_time: string }>;
  courseCode: string;
  courseTitle: string;
  facultyId: string;
  activeSemesterId: number;
  courseAssignmentId?: number | null;
  temporaryCourseOfferingId?: number | null;
  section_id: number;
  allSelectedCourses: any[];
}

@Component({
  selector: 'app-dialog-time',
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatSelectModule,
    MatOptionModule,
    MatButtonModule,
    MatRippleModule,
    MatSlideToggleModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './dialog-day-time.component.html',
  styleUrls: ['./dialog-day-time.component.scss'],
  animations: [showHideFieldsAnimation],
})
export class DialogDayTimeComponent implements OnInit {
  courseCode = '';
  courseTitle = '';
  timeOptions: string[] = [];
  dayButtons: DayButton[] = [];
  isSaving = false;
  anyDayMode = false;
  anyTimeMode = false;

  private readonly daysOfWeek = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ];

  constructor(
    public dialogRef: MatDialogRef<DialogDayTimeComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DialogData,
    private preferencesService: PreferencesService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.initializeDialog();
  }

  // ===========================
  // Initialization Methods
  // ===========================

  private initializeDialog(): void {
    this.courseCode = this.data.courseCode || '';
    this.courseTitle = this.data.courseTitle || '';
    this.timeOptions = this.generateTimeOptions();
    this.dayButtons = this.createDayButtons();

    if (this.data.selectedDays && this.data.selectedDays.length > 0) {
      this.setSelectedDays(this.data.selectedDays);
    }
  }

  private createDayButtons(): DayButton[] {
    return this.daysOfWeek.map((day) => ({
      name: day,
      shortName: day.substring(0, 3),
      selected: false,
      startTime: '',
      endTime: '',
      endTimeOptions: [...this.timeOptions],
    }));
  }

  private generateTimeOptions(): string[] {
    const options = [];
    for (let hour = 7; hour <= 21; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        if (hour === 21 && minute === 30) break;
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const hour12 = hour % 12 || 12;
        options.push(
          `${hour12.toString().padStart(2, '0')}:${minute
            .toString()
            .padStart(2, '0')} ${ampm}`
        );
      }
    }
    return options;
  }

  // ===========================
  // Data Manipulation Methods
  // ===========================

  private setSelectedDays(
    selectedDays: Array<{ day: string; start_time: string; end_time: string }>
  ): void {
    if (!selectedDays) return;
    selectedDays.forEach((selectedDay) => {
      const dayButton = this.dayButtons.find((d) => d.name === selectedDay.day);
      if (dayButton) {
        if (selectedDay.start_time && selectedDay.end_time) {
          dayButton.selected = true;
          dayButton.startTime = this.convertTo12HourFormat(
            selectedDay.start_time
          );
          dayButton.endTime = this.convertTo12HourFormat(selectedDay.end_time);
          this.updateEndTimeOptions(dayButton);
        } else {
          dayButton.selected = false;
          dayButton.startTime = '';
          dayButton.endTime = '';
        }
      }
    });
  }

  private convertTo12HourFormat(time24: string): string {
    if (!time24 || time24.includes('AM') || time24.includes('PM'))
      return time24;

    const [hours, minutes] = time24.split(':').map(Number);
    const hour12 = hours % 12 || 12;
    const ampm = hours < 12 || hours === 24 ? 'AM' : 'PM';
    return `${hour12.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')} ${ampm}`;
  }

  private updateEndTimeOptions(day: DayButton): void {
    const startIndex = this.timeOptions.indexOf(day.startTime);
    day.endTimeOptions =
      startIndex !== -1
        ? this.timeOptions.slice(startIndex + 1)
        : [...this.timeOptions];
  }

  // ===========================
  // Event Handlers
  // ===========================

  /**
   * Sets selected state of a day button and clears times if deselected
   * @param day 
   */
  toggleDay(day: DayButton): void {
    day.selected = !day.selected;
    if (day.selected && this.anyTimeMode) {
      // If Any Time mode is on and we're selecting a day, apply the time range
      day.startTime = '07:00 AM';
      day.endTime = '09:00 PM';
      this.updateEndTimeOptions(day);
    } else if (!day.selected) {
      day.startTime = '';
      day.endTime = '';
    }
  }

  /**
   * Enable/Disable all days when toggling "Any Day" mode
   */
  toggleAnyDay(): void {
    if (this.anyDayMode) {
      // Enable: Select all days and apply default times
      this.dayButtons.forEach((day) => {
        day.selected = true;
        // Apply default times to ensure Confirm button stays enabled
        day.startTime = '07:00 AM';
        day.endTime = '09:00 PM';
        this.updateEndTimeOptions(day);
      });
    } else {
      // Disable: Deselect all days and clear times
      this.dayButtons.forEach((day) => {
        day.selected = false;
        day.startTime = '';
        day.endTime = '';
        day.endTimeOptions = [...this.timeOptions];
      });
    }
  }

  /**
   * Apply 07:00 AM - 09:00 PM to already-selected days only
   * Or if anyDayMode is on, apply to all days
   */
  toggleAnyTime(): void {
    if (this.anyTimeMode) {
      const daysToUpdate = this.anyDayMode 
        ? this.dayButtons 
        : this.dayButtons.filter(day => day.selected);
      
      daysToUpdate.forEach((day) => {
        day.startTime = '07:00 AM';
        day.endTime = '09:00 PM';
        this.updateEndTimeOptions(day);
      });
    } else {
      // Disable: Keep current times, allow manual editing
      // No action needed on disable
    }
  }

  /**
   * Apply the first day's times to all other days
   */
  applyTimeToAllDays(): void {
    if (this.dayButtons.length > 0 && this.dayButtons[0].startTime && this.dayButtons[0].endTime) {
      const startTime = this.dayButtons[0].startTime;
      const endTime = this.dayButtons[0].endTime;

      this.dayButtons.forEach((day) => {
        day.startTime = startTime;
        day.endTime = endTime;
        this.updateEndTimeOptions(day);
      });
    }
  }

  /**
   * Updates end time options when start time changes
   * @param day 
   */
  onStartTimeChange(day: DayButton): void {
    this.updateEndTimeOptions(day);
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  /**
   * Builds the payload for preferred days based on the current selection
   * @returns 
   */
  private buildPreferredDaysPayload(): Array<{ day: string; start_time: string; end_time: string }> {
    let daysToProcess: DayButton[] = [];

    if (this.anyDayMode) {
      // Use all days
      daysToProcess = this.dayButtons;
    } else if (this.anyTimeMode) {
      // Use only selected days (any time applies to those specific days)
      daysToProcess = this.dayButtons.filter((day) => day.selected);
    } else {
      // Use only selected days
      daysToProcess = this.dayButtons.filter((day) => day.selected);
    }

    return daysToProcess
      .filter((day) => day.startTime && day.endTime)
      .map((day) => ({
        day: day.name,
        start_time: String(this.convertTo24HourFormat(day.startTime)),
        end_time: String(this.convertTo24HourFormat(day.endTime)),
      }));
  }

  /**
   * Handles the confirmation of preferred days and submits the data
   * @returns 
   */
  onConfirm(): void {
    this.isSaving = true;
    const selectedDays = this.buildPreferredDaysPayload();

    if (selectedDays.length === 0) {
      this.snackBar.open('Please select at least one day with times.', 'Close', {
        duration: 3000,
      });
      this.isSaving = false;
      return;
    }

    const preferenceData: any = {
      faculty_id: parseInt(this.data.facultyId),
      active_semester_id: this.data.activeSemesterId,
      sections_per_program_year_id: this.data.section_id,
      preferred_days: selectedDays,
    };

    if (this.data.temporaryCourseOfferingId) {
      preferenceData.temporary_course_offering_id =
        this.data.temporaryCourseOfferingId;
    } else {
      preferenceData.course_assignment_id = this.data.courseAssignmentId;
    }

    // Include "any" flags if modifiers are enabled
    if (this.anyDayMode) {
      preferenceData.any_day = true;
    }
    if (this.anyTimeMode) {
      preferenceData.any_time = true;
    }

    this.preferencesService.submitSinglePreference(preferenceData).subscribe({
      next: () => {
        this.snackBar.open(
          'Your preferences has been saved successfully.',
          'Close',
          {
            duration: 3000,
          }
        );
        this.isSaving = false;
        this.dialogRef.close({ days: selectedDays });
      },
      error: (error) => {
        const message =
          error.status === 403 && error.error && error.error.message
            ? error.error.message
            : 'Error submitting preference.';
        this.snackBar.open(message, 'Close', {
          duration: 5000,
        });
        this.isSaving = false;
      },
    });
  }

  // ===========================
  // Utility Methods
  // ===========================

    /**
   * Helper method to convert 12-hour time format to 24-hour format for API submission
   * @param time12 
   * @returns 
   */
  convertTo24HourFormat(time12: string): string {
    const [time, modifier] = time12.split(' ');
    let [hours, minutes] = time.split(':').map(Number);

    if (hours === 12) {
      hours = 0;
    }

    if (modifier === 'PM') {
      hours += 12;
    }

    // Format time to HH:mm:ss with leading zeros
    const formattedHours = hours.toString().padStart(2, '0');
    const formattedMinutes = minutes.toString().padStart(2, '0');
    const formattedSeconds = '00';

    return `${formattedHours}:${formattedMinutes}:${formattedSeconds}`;
  }

  isAnyDaySelected(): boolean {
    // If Any Day mode is enabled, we need times set
    if (this.anyDayMode) {
      return this.dayButtons[0].startTime !== '' && this.dayButtons[0].endTime !== '';
    }
    
    // If Any Time mode is enabled without Any Day, need at least one day selected
    if (this.anyTimeMode) {
      return this.dayButtons.some((day) => day.selected);
    }

    // Normal mode: need at least one day with both times set
    const anyDaySelected = this.dayButtons.some((day) => day.selected);
    if (!anyDaySelected) {
      return false;
    }
    return this.dayButtons
      .filter((day) => day.selected)
      .every((day) => day.startTime !== '' && day.endTime !== '');
  }
}

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
import { MatSymbolDirective } from '../../core/imports/mat-symbol.directive';

interface TimeSlot {
  startTime: string;
  endTime: string;
  endTimeOptions: string[];
}

interface DayButton {
  name: string;
  shortName: string;
  selected: boolean;
  timeSlots: TimeSlot[];
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
    MatSymbolDirective,
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
      timeSlots: [
        {
          startTime: '',
          endTime: '',
          endTimeOptions: [...this.timeOptions],
        },
      ],
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

    // First clear existing time slots for selected days to build from fresh list
    const daysToClear = new Set(selectedDays.map((sd) => sd.day));
    this.dayButtons.forEach((dayButton) => {
      if (daysToClear.has(dayButton.name)) {
        dayButton.timeSlots = [];
        dayButton.selected = false;
      }
    });

    selectedDays.forEach((selectedDay) => {
      const dayButton = this.dayButtons.find((d) => d.name === selectedDay.day);
      if (dayButton) {
        if (selectedDay.start_time && selectedDay.end_time) {
          dayButton.selected = true;
          const start12 = this.convertTo12HourFormat(selectedDay.start_time);
          const end12 = this.convertTo12HourFormat(selectedDay.end_time);

          const slot: TimeSlot = {
            startTime: start12,
            endTime: end12,
            endTimeOptions: [],
          };
          this.updateSlotEndTimeOptions(slot);
          dayButton.timeSlots.push(slot);
        }
      }
    });

    // Ensure all days have at least one slot for UI inputs
    this.dayButtons.forEach((dayButton) => {
      if (dayButton.timeSlots.length === 0) {
        dayButton.timeSlots.push({
          startTime: '',
          endTime: '',
          endTimeOptions: [...this.timeOptions],
        });
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

  // Updates end time options for a slot based on its start time
  private updateSlotEndTimeOptions(slot: TimeSlot): void {
    const startIndex = this.timeOptions.indexOf(slot.startTime);
    slot.endTimeOptions =
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
    if (day.selected) {
      if (this.anyTimeMode) {
        day.timeSlots = [
          {
            startTime: '07:00 AM',
            endTime: '09:00 PM',
            endTimeOptions: [...this.timeOptions],
          },
        ];
        this.updateSlotEndTimeOptions(day.timeSlots[0]);
      }
    } else {
      day.timeSlots = [
        {
          startTime: '',
          endTime: '',
          endTimeOptions: [...this.timeOptions],
        },
      ];
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
        day.timeSlots = [
          {
            startTime: '07:00 AM',
            endTime: '09:00 PM',
            endTimeOptions: [...this.timeOptions],
          },
        ];
        this.updateSlotEndTimeOptions(day.timeSlots[0]);
      });
    } else {
      // Disable: Deselect all days and clear times
      this.dayButtons.forEach((day) => {
        day.selected = false;
        day.timeSlots = [
          {
            startTime: '',
            endTime: '',
            endTimeOptions: [...this.timeOptions],
          },
        ];
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
        day.timeSlots = [
          {
            startTime: '07:00 AM',
            endTime: '09:00 PM',
            endTimeOptions: [...this.timeOptions],
          },
        ];
        this.updateSlotEndTimeOptions(day.timeSlots[0]);
      });
    }
  }

  /**
   * Apply the first day's times to all other days
   */
  applyTimeToAllDays(): void {
    if (this.dayButtons.length > 0) {
      const sourceSlots = this.dayButtons[0].timeSlots.filter(
        (s) => s.startTime && s.endTime
      );
      if (sourceSlots.length > 0) {
        this.dayButtons.forEach((day, index) => {
          if (index === 0) return;
          day.timeSlots = sourceSlots.map((slot) => {
            const newSlot: TimeSlot = {
              startTime: slot.startTime,
              endTime: slot.endTime,
              endTimeOptions: [],
            };
            this.updateSlotEndTimeOptions(newSlot);
            return newSlot;
          });
          day.selected = true;
        });
      }
    }
  }

  // Updates end time options for a slot when its start time changes
  onSlotStartTimeChange(slot: TimeSlot): void {
    this.updateSlotEndTimeOptions(slot);
    slot.endTime = '';
  }

  // Adds a new time slot to the day button
  addTimeSlot(day: DayButton): void {
    day.timeSlots.push({
      startTime: '',
      endTime: '',
      endTimeOptions: [...this.timeOptions],
    });
  }

  // Removes a time slot at the specified index from the day button
  removeTimeSlot(day: DayButton, index: number): void {
    day.timeSlots.splice(index, 1);
    if (day.timeSlots.length === 0) {
      day.timeSlots.push({
        startTime: '',
        endTime: '',
        endTimeOptions: [...this.timeOptions],
      });
    }
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
      daysToProcess = this.dayButtons;
    } else {
      daysToProcess = this.dayButtons.filter((day) => day.selected);
    }

    const payload: Array<{
      day: string;
      start_time: string;
      end_time: string;
    }> = [];

    daysToProcess.forEach((day) => {
      const slots = this.anyDayMode
        ? this.dayButtons[0].timeSlots
        : day.timeSlots;

      slots.forEach((slot) => {
        if (slot.startTime && slot.endTime) {
          payload.push({
            day: day.name,
            start_time: String(this.convertTo24HourFormat(slot.startTime)),
            end_time: String(this.convertTo24HourFormat(slot.endTime)),
          });
        }
      });
    });

    return payload;
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

    const temporaryCourseOfferingId = this.data.temporaryCourseOfferingId;
    const courseAssignmentId = this.data.courseAssignmentId;

    if (temporaryCourseOfferingId != null) {
      preferenceData.temporary_course_offering_id = temporaryCourseOfferingId;
    } else if (courseAssignmentId != null) {
      preferenceData.course_assignment_id = courseAssignmentId;
    } else {
      this.snackBar.open(
        'Unable to submit preference: missing course identifiers.', 
        'Close',
        { duration: 5000,}
      );
      this.isSaving = false;
      return;
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
          `Your schedule for ${this.courseCode} ` +
            `has been automatically submitted to the admin.`,
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
    if (this.anyDayMode) {
      return this.dayButtons[0].timeSlots.some(
        (s) => s.startTime !== '' && s.endTime !== ''
      );
    }
    
    if (this.anyTimeMode) {
      return this.dayButtons.some((day) => day.selected);
    }

    const anyDaySelected = this.dayButtons.some((day) => day.selected);
    if (!anyDaySelected) {
      return false;
    }

    return this.dayButtons
      .filter((day) => day.selected)
      .every((day) =>
        day.timeSlots.length > 0 &&
        day.timeSlots.every(
          (slot) => slot.startTime !== '' && slot.endTime !== ''
        )
      );
  }
}

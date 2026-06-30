import { Component, Inject, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

import { Observable, Subject, of } from 'rxjs';
import { map, takeUntil, debounceTime, distinctUntilChanged, switchMap, shareReplay, catchError, tap, startWith } from 'rxjs/operators';

import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatRippleModule } from '@angular/material/core';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSymbolDirective } from '../../core/imports/mat-symbol.directive';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { SchedulingService } from '../../core/services/admin/scheduling/scheduling.service';
import { ScheduleValidationService } from '../../core/services/admin/scheduling/schedule-validation.service';
import { Faculty, Room, ConflictingScheduleDetail } from '../../core/models/scheduling.model';

import { cardEntranceSide, cardSwipeAnimation } from '../../core/animations/animations';

interface Preference {
  day: string;
  time: string;
  program_code: string;
}

interface SuggestedFaculty {
  faculty_id: number;
  name: string;
  type: string;
  preferences: Preference[];
  prefIndex: number;
  animating: boolean;
}

interface ProfessorOption {
  id: number;
  name: string;
}

interface DialogData {
  aiSuggestion?: SuggestedFaculty;
  program: {
    id: number;
    info: string;
  };
  academic: {
    year_level: number;
    section_id: number;
  };
  options: {
    dayOptions: string[];
    timeOptions: string[];
    endTimeOptions: string[];
    professorOptions: string[];
    roomOptions: string[];
  };
  facultyOptions: Faculty[];
  roomOptionsList: Room[];
  selectedProgramInfo: string;
  selectedCourseInfo: string;
  suggestedFaculty: SuggestedFaculty[];
  existingSchedule?: {
    day: string;
    time: string;
    professor: string;
    room: string;
  };
  schedule_id: number;
  course_id: number;
  selectedElectiveId?: number;
  selectedElectiveSlotName?: string | null;
  isElectiveSlot?: boolean;
  isDraftMode?: boolean;
  isTemporaryCourse?: boolean;
  isBridgingCourse?: boolean;
  bridging_course_id?: number | null;
  combined_with_program_id?: number | null;
  combined_with_program_code?: string | null;
  hoursAlreadyAssigned?: number;
  lec_hours?: number;
  lab_hours?: number;
}

@Component({
  selector: 'app-dialog-scheduling',
  imports: [
    CommonModule,
    MatFormFieldModule,
    MatDialogModule,
    MatIconModule,
    MatInputModule,
    MatButtonModule,
    ReactiveFormsModule,
    MatSelectModule,
    MatAutocompleteModule,
    MatRippleModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatSymbolDirective,
    MatCheckboxModule,
  ],
  templateUrl: './dialog-scheduling.component.html',
  styleUrls: ['./dialog-scheduling.component.scss'],
  animations: [cardEntranceSide, cardSwipeAnimation],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DialogSchedulingComponent implements OnInit, OnDestroy {
  scheduleForm: FormGroup;

  filteredProfessors$!: Observable<ProfessorOption[]>;
  filteredRooms$!: Observable<string[]>;

  dayButtons: { name: string; shortName: string }[] = [];
  selectedDay: string = '';
  originalDay: string = '';

  selectedFaculty: SuggestedFaculty | null = null;
  historyCardSelected = false;

  hasConflicts = false;
  conflictMessage: string = '';
  remainingHoursMessage: string = '';
  facultyBreakMessage: string = '';
  isValidating = false;

  pendingCombinedLabel: string | null = null;
  pendingMatchingProgramCode: string | null = null;
  pendingMatchingProgramId: number | null = null;
  userConfirmedCombine = false;

  isLoading = false;
  private populatedSchedules: any;

  private destroy$ = new Subject<void>();


  constructor(
    @Inject(MAT_DIALOG_DATA) public data: DialogData,
    private dialogRef: MatDialogRef<DialogSchedulingComponent>,
    private fb: FormBuilder,
    private schedulingService: SchedulingService,
    private scheduleValidationService: ScheduleValidationService,
    private snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef
  ) {
    // Build the reactive form (no elective control needed)
    this.scheduleForm = this.fb.group({
      day: [''],
      startTime: [''],
      endTime: [''],
      professor: [''],
      room: [''],
    });
  }

  ngOnInit(): void {
    this.setupDayButtons();
    this.setupCustomValidators();
    this.populateExistingSchedule();
    this.data.suggestedFaculty.forEach(
      (faculty) => (faculty.animating = false)
    );
    
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        this.setupAutocomplete();
        this.subscribeToStartTimeChanges();
        this.setupConflictDetection();
        this.cdr.markForCheck();
      });
    });

    queueMicrotask(() => {
      this.schedulingService.populateSchedules().pipe(
        takeUntil(this.destroy$),
        tap(schedules => {
          this.populatedSchedules = schedules;
          // Trigger conflict detection with existing form
          // values to detect combined schedules on load
          this.initiateConflictValidation().subscribe();
        }),
        switchMap(activeInfo => {
          return this.schedulingService.getSmartSuggestion(
            this.data.course_id,
            activeInfo.academic_year_id,
            activeInfo.semester_id,
            activeInfo.active_semester_id,
            this.data.program.id,
            this.data.academic.year_level,
            this.data.academic.section_id
          );
        })
      ).subscribe((suggestion) => {
        if (!suggestion || suggestion.success === false) {
          this.snackBar.open(
            'No suggestions available.',
            'Close',
            { duration: 3000 }
          );
          return;
        }

        const facultyId = suggestion.faculty_id;
        const name = suggestion.faculty_name;
        
        const prefs: Preference[] = [];
        if (suggestion.day && suggestion.start_time && 
            suggestion.end_time) {
          const displayStart =
            this.scheduleValidationService
              .formatTimeForDisplay(
                suggestion.start_time
              );
          const displayEnd =
            this.scheduleValidationService
              .formatTimeForDisplay(
                suggestion.end_time
              );
          prefs.push({ 
            day: suggestion.day, 
            time: `${displayStart} - ${displayEnd}`,
            program_code: '' 
          });
        }

        const mappedSuggestion: SuggestedFaculty = {
          faculty_id: facultyId,
          name: name,
          type: suggestion.isMl
            ? 'ML Suggestion'
            : 'Rule-based',
          preferences: prefs,
          prefIndex: 0,
          animating: false
        };

        this.data.aiSuggestion = mappedSuggestion;
        this.cdr.markForCheck();
      });
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupDayButtons(): void {
    const dayShortNames: Record<string, string> = {
      Monday: 'Mon',
      Tuesday: 'Tue',
      Wednesday: 'Wed',
      Thursday: 'Thu',
      Friday: 'Fri',
      Saturday: 'Sat',
      Sunday: 'Sun',
    };
    this.dayButtons = this.data.options.dayOptions.map((day) => ({
      name: day,
      shortName: dayShortNames[day] || day.substring(0, 3),
    }));
  }

  private populateExistingSchedule(): void {
    if (!this.data.existingSchedule) return;

    const { day, time, professor, room } = this.data.existingSchedule;
    const [startTime, endTime] = time.split(' - ').map((time) => time.trim());

    this.scheduleForm.patchValue({
      day: day !== 'Not set' ? day : '',
      startTime: startTime !== 'Not set' ? startTime : '',
      endTime: endTime !== 'Not set' ? endTime : '',
      professor: professor !== 'Not set' ? professor : '',
      room: room !== 'Not set' ? room : '',
    });

    this.selectedDay = this.scheduleForm.get('day')?.value || '';
    this.originalDay = this.selectedDay;

    if (startTime && startTime !== 'Not set') {
      this.updateEndTimeOptions(startTime);
    }

    if (this.data.isBridgingCourse &&
        this.data.combined_with_program_id) {
      this.userConfirmedCombine = true;
    }

    this.cdr.markForCheck();
  }

  private setupAutocomplete(): void {
    const professorOptions: ProfessorOption[] =
      this.data.options.professorOptions.map((name, index) => ({
        id: index,
        name: name,
      }));

    this.filteredProfessors$ = this.scheduleForm
      .get('professor')!
      .valueChanges.pipe(
        startWith(''),
        map((value) => this.filterProfessorOptions(value, professorOptions)),
        shareReplay(1)
      );

    this.filteredRooms$ = this.scheduleForm.get('room')!.valueChanges.pipe(
      startWith(''),
      map((value) =>
        this.filterRoomOptions(value, this.data.options.roomOptions)
      ),
      shareReplay(1)
    );
  }

  private filterProfessorOptions(
    value: string | null,
    options: ProfessorOption[]
  ): ProfessorOption[] {
    const filterValue = (value || '').toLowerCase();
    return options.filter((option) =>
      option.name.toLowerCase().includes(filterValue)
    );
  }

  private filterRoomOptions(value: string | null, options: string[]): string[] {
    const filterValue = (value || '').toLowerCase();
    return options.filter((option) =>
      option.toLowerCase().includes(filterValue)
    );
  }

  private subscribeToStartTimeChanges(): void {
    this.scheduleForm
      .get('startTime')!
      .valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe((startTime) => {
        const endTimeControl = this.scheduleForm.get('endTime');

        if (startTime) {
          this.updateEndTimeOptions(startTime);
          if (!endTimeControl?.value) {
            endTimeControl?.setErrors({ required: true });
          }
        } else {
          this.data.options.endTimeOptions = [...this.data.options.timeOptions];
          if (!endTimeControl?.value) {
            endTimeControl?.setErrors(null);
          }
        }

        endTimeControl?.markAsTouched();
        this.cdr.markForCheck();
      });

    this.scheduleForm
      .get('endTime')!
      .valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe((endTime) => {
        const startTimeControl = this.scheduleForm.get('startTime');

        if (endTime) {
          if (!startTimeControl?.value) {
            startTimeControl?.setErrors({ required: true });
          }
        } else {
          if (!startTimeControl?.value) {
            startTimeControl?.setErrors(null);
          }
        }

        startTimeControl?.markAsTouched();
        this.cdr.markForCheck();
      });
  }

  private updateEndTimeOptions(startTime: string): void {
    const startIndex = this.data.options.timeOptions.indexOf(startTime);
    if (startIndex === -1) {
      const endTimeControl = this.scheduleForm.get('endTime');
      if (endTimeControl) {
        endTimeControl.reset('');
        endTimeControl.markAsTouched();
        if (!endTimeControl.value) {
          endTimeControl.setErrors({ required: true });
        }
        this.data.options.endTimeOptions = [];
      }
      return;
    }

    this.data.options.endTimeOptions = this.data.options.timeOptions.slice(
      startIndex + 1
    );

    const currentEndTime = this.scheduleForm.get('endTime')?.value;
    if (currentEndTime) {
      const endTimeIndex =
        this.data.options.timeOptions.indexOf(currentEndTime);
      if (endTimeIndex <= startIndex) {
        const endTimeControl = this.scheduleForm.get('endTime');
        if (endTimeControl) {
          endTimeControl.reset('');
          endTimeControl.markAsTouched();
          endTimeControl.setErrors({ required: true });
        }
      }
    }

    this.cdr.markForCheck();
  }

  public selectDay(dayName: string): void {
    this.selectedDay = dayName;
    this.scheduleForm.patchValue({ day: dayName });
    this.cdr.markForCheck();
  }

  /**
   * Validator to ensure the control's value matches one of the valid options.
   * @param validOptions Array of valid string options.
   * @returns Validator function.
   */
  private mustMatchOption(validOptions: string[]): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if (!control.value) return null;
      return validOptions.includes(control.value)
        ? null
        : { invalidOption: true };
    };
  }

  private setupCustomValidators(): void {
    this.scheduleForm
      .get('professor')
      ?.setValidators(this.mustMatchOption(this.data.options.professorOptions));
    this.scheduleForm
      .get('room')
      ?.setValidators(this.mustMatchOption(this.data.options.roomOptions));
    this.scheduleForm.get('professor')?.updateValueAndValidity();
    this.scheduleForm.get('room')?.updateValueAndValidity();
  }

  private setupConflictDetection(): void {
    this.scheduleForm.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(
          (prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)
        ),
        switchMap(() => this.initiateConflictValidation()),
        takeUntil(this.destroy$)
      )
      .subscribe();
  }

  initiateConflictValidation(): Observable<void> {
    const formValues = this.scheduleForm.value;
    const { day, startTime, endTime, professor, room } = formValues;

    if (!day || !startTime || !endTime) {
      this.hasConflicts = false;
      this.conflictMessage = '';
      this.remainingHoursMessage = '';
      this.facultyBreakMessage = '';
      this.isValidating = false;
      this.cdr.detectChanges();
      return of(undefined);
    }

    this.isValidating = true;
    this.cdr.detectChanges();

    const formattedStartTime = this.convertTimeToBackendFormat(startTime);
    const formattedEndTime = this.convertTimeToBackendFormat(endTime);

    const selectedFaculty = this.data.facultyOptions.find(
      (f) => f.name === professor
    );
    const selectedRoom = this.data.roomOptionsList.find(
      (r) => r.room_code === room
    );

    const facultyId = selectedFaculty?.faculty_id || null;
    const roomId = selectedRoom?.room_id || null;

    // Call the centralized conflict detection method
    let hasMatchingSchedule = false;
    let matchingResult: ConflictingScheduleDetail | undefined;

    // NOTE: Currently scoped to bridging courses only.
    // To extend to other temporary types, adjust this condition.
    if (this.data.isBridgingCourse && this.populatedSchedules) {
      matchingResult =
        this.scheduleValidationService.checkMatchingSchedule(
          this.populatedSchedules,
          {
            schedule_id: this.data.schedule_id,
            program_id: this.data.program.id,
            year_level: this.data.academic.year_level,
            day,
            start_time: formattedStartTime || '',
            end_time: formattedEndTime || '',
            section_id: this.data.academic.section_id,
            faculty_id: facultyId,
            room_id: roomId,
          }
        );

      if (matchingResult) {
        hasMatchingSchedule = true;
        this.pendingMatchingProgramCode = matchingResult.programCode;
        this.pendingMatchingProgramId = matchingResult.programId;
        const currentProgramCode = this.data.program.info.split(' ')[0];
        this.pendingCombinedLabel = this.scheduleValidationService
          .buildCombinedLabel(
            currentProgramCode,
            matchingResult.programCode
          );

        this.hasConflicts = !this.userConfirmedCombine;
        this.conflictMessage = this.hasConflicts
          ? `Matching schedule found for ` +
            `${this.pendingMatchingProgramCode}. ` +
            `You must combine them to save.`
          : '';
        this.isValidating = false;
        this.cdr.detectChanges();
      }
    } else if (this.data.isTemporaryCourse && this.populatedSchedules) {
      matchingResult =
        this.scheduleValidationService.checkMatchingSchedule(
          this.populatedSchedules,
          {
            schedule_id: this.data.schedule_id,
            program_id: this.data.program.id,
            year_level: this.data.academic.year_level,
            day,
            start_time: formattedStartTime || '',
            end_time: formattedEndTime || '',
            section_id: this.data.academic.section_id,
            faculty_id: facultyId,
            room_id: roomId,
          }
        );

      if (matchingResult) {
        hasMatchingSchedule = true;
      }
    }

    if (hasMatchingSchedule) {
      if (!this.data.isBridgingCourse) {
        this.pendingCombinedLabel = null;
        this.pendingMatchingProgramCode = null;
        this.pendingMatchingProgramId = null;
      }
      this.isValidating = false;
      this.cdr.detectChanges();
      return of(undefined);
    }

    // No matching schedule found: clear any pending combine states
    this.pendingCombinedLabel = null;
    this.pendingMatchingProgramCode = null;
    this.pendingMatchingProgramId = null;

    const timeToMinutes = (timeStr: string): number => {
      const [hours, minutes] = timeStr.split(':').map(Number);
      return hours * 60 + minutes;
    };

    return this.schedulingService
      .checkForScheduleConflicts(
        this.data.course_id,
        this.data.schedule_id,
        this.data.program.id,
        this.data.academic.year_level,
        day,
        formattedStartTime || '',
        formattedEndTime || '',
        this.data.academic.section_id,
        facultyId,
        roomId,
        this.data.hoursAlreadyAssigned
      )
      .pipe(
        tap((conflictResult) => {
          this.isValidating = false;
          this.hasConflicts = conflictResult.hasConflicts;
          this.conflictMessage = this.hasConflicts
            ? conflictResult.messages[0]
            : '';

          this.facultyBreakMessage =
            conflictResult.warnings && conflictResult.warnings.length > 0
              ? conflictResult.warnings[0]
              : '';

          const lecHours = this.data.lec_hours || 0;
          const labHours = this.data.lab_hours || 0;
          const totalRequired = lecHours + labHours;
          const assignedBefore = this.data.hoursAlreadyAssigned || 0;

          if (formattedStartTime && formattedEndTime && totalRequired > 0) {
            const startMins = timeToMinutes(formattedStartTime);
            const endMins = timeToMinutes(formattedEndTime);
            const proposedDuration = (endMins - startMins) / 60;
            const remaining =
              totalRequired - assignedBefore - proposedDuration;

            if (remaining > 0) {
              this.remainingHoursMessage =
                `Note: There are still ${remaining.toFixed(1)} hours left ` +
                `to be assigned for this course.`;
            } else {
              this.remainingHoursMessage = '';
            }
          } else {
            this.remainingHoursMessage = '';
          }

          this.cdr.detectChanges();
        }),
        catchError(() => {
          this.isValidating = false;
          this.conflictMessage =
            'An error occurred during validation. Please try again.';
          this.hasConflicts = true;
          this.cdr.detectChanges();
          return of(undefined);
        }),
        map(() => undefined)
      );
  }

  public assignValidatedSchedule(): void {
    if (this.hasConflicts) {
      this.snackBar.open(
        'There is a scheduling conflict. Please resolve it before proceeding.',
        'Close',
        { duration: 3000 }
      );
      return;
    }

    const formValues = this.scheduleForm.value;
    const formattedStartTime = this.convertTimeToBackendFormat(
      formValues.startTime
    );
    const formattedEndTime = this.convertTimeToBackendFormat(
      formValues.endTime
    );
    const selectedFaculty = this.data.facultyOptions.find(
      (f) => f.name === formValues.professor
    );
    const selectedRoom = this.data.roomOptionsList.find(
      (r) => r.room_code === formValues.room
    );

    this.isLoading = true;
    this.cdr.markForCheck();

    let selectedRoomId: number | null = null;

    // If roomValue === 'TBA', selectedRoomId stays null
    if (formValues.room !== 'TBA') {
      selectedRoomId = selectedRoom?.room_id ?? null;
    }

    if (this.data.isDraftMode) {
      this.isLoading = false;
      this.dialogRef.close({
        isDraft: true,
        faculty_id: selectedFaculty?.faculty_id ?? null,
        faculty_name: formValues.professor || 'Not set',
        room_id: selectedRoomId,
        room_code: formValues.room || 'Not set',
        day: formValues.day ?? null,
        start_time: formattedStartTime,
        end_time: formattedEndTime
      });
      return;
    }

    let combineObservable = of(null);
    if (this.data.isBridgingCourse && this.data.bridging_course_id) {
      const targetProgramId = this.userConfirmedCombine
        ? this.pendingMatchingProgramId
        : null;

      if (targetProgramId !== this.data.combined_with_program_id) {
        combineObservable = this.schedulingService.combineBridgingCourses(
          this.data.bridging_course_id,
          targetProgramId
        );
      }
    }

    // No elective_id is passed; it is auto-resolved by the backend
    // from curriculum_electives based on the active academic year.
    combineObservable
      .pipe(
        switchMap(() => {
          return this.schedulingService.assignSchedule(
            this.data.schedule_id,
            selectedFaculty?.faculty_id ?? null,
            selectedRoomId,
            formValues.day ?? null,
            formattedStartTime,
            formattedEndTime,
            this.data.program.id,
            this.data.academic.year_level,
            this.data.academic.section_id
          );
        }),
        tap(() => {
          this.isLoading = false;
          this.originalDay = this.selectedDay;
          this.dialogRef.close(true);
        }),
        catchError((error) => {
          this.isLoading = false;
          this.handleAssignmentError(error);
          return of(null);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe();
  }

  // Handles toggle event for combining bridging courses.
  public onCombineToggle(checked: boolean): void {
    this.userConfirmedCombine = checked;
    this.hasConflicts = !checked;
    this.conflictMessage = this.hasConflicts
      ? `Matching schedule found for ${this.pendingMatchingProgramCode}. ` +
        `You must combine them to save.`
      : '';
    this.cdr.markForCheck();
  }

  private handleAssignmentError(error: any): void {
    this.conflictMessage = error?.message || 'Failed to assign schedule.';
    this.hasConflicts = true;
    this.snackBar.open(this.conflictMessage, 'Close', { duration: 5000 });
    this.cdr.markForCheck();
  }

  public populateFormWithFacultyPreference(
    faculty: SuggestedFaculty,
    preference: Preference
  ): void {
    this.selectedFaculty = faculty;
    this.historyCardSelected = false;
    const [startTime, endTime] = preference.time
      .split(' - ')
      .map((t) => t.trim());

    this.scheduleForm.patchValue({
      day: preference.day,
      startTime,
      endTime,
      professor: faculty.name,
    });

    this.selectedDay = preference.day;
    this.scheduleForm.markAllAsTouched();
    this.cdr.markForCheck();
  }

  public selectHistoryEntry(): void {
    const schedule = this.data.existingSchedule;
    if (!schedule || schedule.professor === 'Not set') return;

    this.selectedFaculty = null;
    this.historyCardSelected = true;

    // Parse "8:00 AM - 9:00 AM" → startTime / endTime
    const parts = schedule.time?.split(' - ').map((t) => t.trim()) ?? [];
    const startTime = parts[0] || '';
    const endTime   = parts[1] || '';

    this.scheduleForm.patchValue({
      day: schedule.day !== 'Not set' ? schedule.day : '',
      startTime,
      endTime,
      professor: schedule.professor,
      room: schedule.room !== 'Not set' ? schedule.room : '',
    });

    this.selectedDay = schedule.day !== 'Not set' ? schedule.day : '';
    this.scheduleForm.markAllAsTouched();
    this.cdr.markForCheck();
  }

  public showNextFacultyPreference(faculty: SuggestedFaculty): void {
    if (faculty.animating) return;

    requestAnimationFrame(() => {
      faculty.animating = true;
      faculty.prefIndex = (faculty.prefIndex + 1) % faculty.preferences.length;

      setTimeout(() => {
        faculty.animating = false;
        this.cdr.detectChanges();
      }, 500);
    });
  }

  public showPreviousFacultyPreference(faculty: SuggestedFaculty): void {
    if (faculty.animating) return;

    requestAnimationFrame(() => {
      faculty.animating = true;
      faculty.prefIndex =
        (faculty.prefIndex - 1 + faculty.preferences.length) %
        faculty.preferences.length;

      setTimeout(() => {
        faculty.animating = false;
        this.cdr.detectChanges();
      }, 500);
    });
  }

  public doesPreferenceMatchForm(preference: Preference): boolean {
    const formValues = this.scheduleForm.value;
    return (
      formValues.day === preference.day &&
      `${formValues.startTime} - ${formValues.endTime}` === preference.time
    );
  }

  public resetForm(): void {
    this.scheduleForm.reset();
    this.data.options.endTimeOptions = [...this.data.options.timeOptions];
    this.selectedDay = '';
    this.originalDay = '';
    this.selectedFaculty = null;
    this.historyCardSelected = false;
    this.cdr.markForCheck();
  }

  public cancelDialog(): void {
    this.scheduleForm.patchValue({ day: this.originalDay });
    this.selectedDay = this.originalDay;
    this.dialogRef.close();
  }

  private convertTimeToBackendFormat(time: string | null): string | null {
    if (!time) return null;
    const [timePart, period] = time.split(' ');
    let [hours, minutes] = timePart.split(':').map(Number);
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:00`;
  }

  public formatTimeForDisplay(time: string): string {
    return this.scheduleValidationService.formatTimeForDisplay(time);
  }

  public getFacultyTypeClass(facultyType: string): Record<string, boolean> {
    const type = facultyType.toLowerCase();
    return {
      'full-time': type.includes('full-time'),
      designee: type.includes('designee'),
      'part-time': type.includes('part-time'),
      temporary: type.includes('temporary'),
    };
  }
}

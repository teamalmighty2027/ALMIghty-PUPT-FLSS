import {
  Component,
  Inject,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  AbstractControl,
  ValidationErrors,
  ValidatorFn
} from '@angular/forms';

import { Observable, Subject, of } from 'rxjs';
import {
  map,
  takeUntil,
  debounceTime,
  distinctUntilChanged,
  switchMap,
  shareReplay,
  catchError,
  tap,
  startWith
} from 'rxjs/operators';

import {
  MatDialogRef,
  MAT_DIALOG_DATA,
  MatDialogModule
} from '@angular/material/dialog';
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
import { MatTooltipModule } from '@angular/material/tooltip';

import {
  SchedulingService
} from '../../core/services/admin/scheduling/scheduling.service';
import {
  ScheduleValidationService
} from '../../core/services/admin/scheduling/schedule-validation.service';
import {
  Faculty,
  Room,
  ConflictingScheduleDetail,
  HistoricalCourseSchedule,
  AssignmentType
} from '../../core/models/scheduling.model';

import {
  cardEntranceSide,
  cardSwipeAnimation
} from '../../core/animations/animations';
import { getFacultyTypeClass } from '../utils/faculty-type.utils';

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
  isMl?: boolean;
  confidence?: number;
  badgeLabel?: string;
  reasonLabel?: string;
}

interface ProfessorOption {
  id: number;
  name: string;
  type?: string;
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
  section_name?: string;
  semester?: number;
  assignment_type_id?: number | null;
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
    MatTooltipModule,
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
  currentAssignmentSelected = false;

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

  // Load types state
  allAssignmentTypes: AssignmentType[] = [];
  filteredAssignmentTypes: AssignmentType[] = [];
  isLoadingAssignmentTypes = false;
  selectedFacultyType: string | null = null;

  // Historical schedule state
  historicalSchedule: HistoricalCourseSchedule | null = null;
  historicalAcademicYear: string = '';
  historicalOriginLabel: string = '';
  isLoadingHistorical = false;

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
    // Build the reactive form with optional load type control
    this.scheduleForm = this.fb.group({
      day: [''],
      startTime: [''],
      endTime: [''],
      professor: [''],
      room: [''],
      assignmentTypeId: [{ value: null, disabled: true }],
    });
  }

  ngOnInit(): void {
    this.setupDayButtons();
    this.setupCustomValidators();
    this.populateExistingSchedule();
    this.loadAssignmentTypes();
    this.loadHistoricalSchedule();

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
        const facultyDetails = this.data.facultyOptions.find(
          (f) => f.faculty_id === facultyId
        );
        const name = facultyDetails
          ? facultyDetails.name
          : suggestion.faculty_name;

        const prefs: Preference[] = [];
        if (
          suggestion.day &&
          suggestion.start_time &&
          suggestion.end_time
        ) {
          const displayStart =
            this.scheduleValidationService.formatTimeForDisplay(
              suggestion.start_time
            );
          const displayEnd =
            this.scheduleValidationService.formatTimeForDisplay(
              suggestion.end_time
            );
          prefs.push({
            day: suggestion.day,
            time: `${displayStart} - ${displayEnd}`,
            program_code: ''
          });
        }

        let badgeLabel = 'AI Recommended';
        let reasonLabel = '';

        if (suggestion.isMl) {
          badgeLabel = 'AI Recommended';
          const pct = Math.round((suggestion.confidence ?? 0.85) * 100);
          reasonLabel = `${pct}% Match`;
        } else {
          badgeLabel = 'Alternative Suggestion';
          const src = suggestion.fallback_source || '';
          if (src.includes('Historical')) {
            reasonLabel = 'Taught Previously';
          } else if (src.includes('Preference')) {
            reasonLabel = 'Faculty Preference';
          } else {
            reasonLabel = 'Available Faculty';
          }
        }

        const mappedSuggestion: SuggestedFaculty = {
          faculty_id: facultyId,
          name: name,
          type: suggestion.isMl ? 'ML Suggestion' : 'Rule-based',
          preferences: prefs,
          prefIndex: 0,
          animating: false,
          isMl: suggestion.isMl,
          confidence: suggestion.confidence,
          badgeLabel,
          reasonLabel
        };

        this.data.aiSuggestion = mappedSuggestion;
        this.cdr.markForCheck();
      });
    });
  }

  // Loads dynamic load types from database and initializes options
  private loadAssignmentTypes(): void {
    this.isLoadingAssignmentTypes = true;
    this.schedulingService.getAssignmentTypes().pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (types) => {
        this.allAssignmentTypes = types || [];
        this.filteredAssignmentTypes = [...this.allAssignmentTypes];
        this.isLoadingAssignmentTypes = false;

        const currentProf = this.scheduleForm.get('professor')?.value;
        if (
          currentProf &&
          currentProf !== 'None' &&
          currentProf !== 'Not set'
        ) {
          this.onProfessorSelected(currentProf);
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.isLoadingAssignmentTypes = false;
        this.cdr.markForCheck();
      }
    });
  }

  // Asynchronously loads historical schedule from previous academic year
  private loadHistoricalSchedule(): void {
    const secName = this.data.section_name || '';
    const semesterNum = this.data.semester || 1;

    this.isLoadingHistorical = true;
    this.schedulingService.getHistoricalCourseSchedule(
      this.data.course_id,
      this.data.program.id,
      this.data.academic.year_level,
      secName,
      semesterNum
    ).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (res) => {
        this.isLoadingHistorical = false;
        if (res && res.success && res.data) {
          this.historicalSchedule = res.data;
          this.historicalAcademicYear = res.academic_year || '';
          this.historicalOriginLabel =
            res.origin_label || res.academic_year || '';
        } else {
          this.historicalSchedule = null;
          this.historicalAcademicYear = '';
          this.historicalOriginLabel = '';
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.isLoadingHistorical = false;
        this.historicalSchedule = null;
        this.cdr.markForCheck();
      }
    });
  }

  // Pre-fills schedule form with historical schedule data
  public populateFromHistoricalSchedule(): void {
    if (!this.historicalSchedule) return;

    this.selectedFaculty = null;
    this.currentAssignmentSelected = false;

    const hist = this.historicalSchedule;
    let startTimeStr = '';
    let endTimeStr = '';

    if (hist.start_time && hist.end_time) {
      startTimeStr = this.formatTimeForDisplay(hist.start_time);
      endTimeStr = this.formatTimeForDisplay(hist.end_time);
    }

    const profName =
      hist.professor && hist.professor !== 'Not set'
        ? hist.professor
        : 'None';

    this.scheduleForm.patchValue({
      day: hist.day && hist.day !== 'Not set' ? hist.day : '',
      startTime: startTimeStr,
      endTime: endTimeStr,
      professor: profName,
      room:
        hist.room_code && hist.room_code !== 'Not set'
          ? hist.room_code
          : '',
    });

    this.selectedDay =
      hist.day && hist.day !== 'Not set' ? hist.day : '';

    if (startTimeStr) {
      this.updateEndTimeOptions(startTimeStr);
    }

    this.onProfessorSelected(profName);

    if (hist.assignment_type_id) {
      this.scheduleForm.patchValue({
        assignmentTypeId: hist.assignment_type_id
      });
    }

    this.scheduleForm.markAllAsTouched();
    this.cdr.markForCheck();
  }

  // Adapts load type options and control state based on faculty role
  public onProfessorSelected(name: string): void {
    const typeControl = this.scheduleForm.get('assignmentTypeId');

    if (!name || name === 'None' || name === 'Not set') {
      this.selectedFacultyType = null;
      this.filteredAssignmentTypes = [...this.allAssignmentTypes];
      typeControl?.disable();
      typeControl?.setValue(null);
      this.cdr.markForCheck();
      return;
    }

    const faculty = this.data.facultyOptions.find((f) => f.name === name);

    if (!faculty) {
      this.selectedFacultyType = null;
      this.filteredAssignmentTypes = [...this.allAssignmentTypes];
      typeControl?.enable();
      this.cdr.markForCheck();
      return;
    }

    this.selectedFacultyType = faculty.faculty_type || null;
    typeControl?.enable();

    const role = (faculty.faculty_type || '').toLowerCase();

    if (role.includes('part')) {
      this.filteredAssignmentTypes = this.allAssignmentTypes.filter((t) =>
        !t.name.toLowerCase().includes('regular')
      );
      if (!typeControl?.value) {
        const pt = this.filteredAssignmentTypes.find((t) =>
          t.name.toLowerCase().includes('part')
        );
        if (pt) {
          typeControl?.setValue(pt.id);
        }
      }
    } else if (role.includes('full')) {
      this.filteredAssignmentTypes = this.allAssignmentTypes.filter((t) =>
        !t.name.toLowerCase().includes('part')
      );
      if (!typeControl?.value) {
        const reg = this.filteredAssignmentTypes.find((t) =>
          t.name.toLowerCase().includes('regular')
        );
        if (reg) {
          typeControl?.setValue(reg.id);
        }
      }
    } else {
      this.filteredAssignmentTypes = [...this.allAssignmentTypes];
    }

    this.cdr.markForCheck();
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
    const [startTime, endTime] = time.split(' - ').map((t) => t.trim());

    this.scheduleForm.patchValue({
      day: day !== 'Not set' ? day : '',
      startTime: startTime !== 'Not set' ? startTime : '',
      endTime: endTime !== 'Not set' ? endTime : '',
      professor: professor !== 'Not set' ? professor : 'None',
      room: room !== 'Not set' ? room : '',
    });

    if (this.data.assignment_type_id) {
      this.scheduleForm.patchValue({
        assignmentTypeId: this.data.assignment_type_id
      });
    }

    this.selectedDay = this.scheduleForm.get('day')?.value || '';
    this.originalDay = this.selectedDay;

    if (startTime && startTime !== 'Not set') {
      this.updateEndTimeOptions(startTime);
    }

    if (this.data.isBridgingCourse && this.data.combined_with_program_id) {
      this.userConfirmedCombine = true;
    }

    const currentProf = this.scheduleForm.get('professor')?.value;
    if (currentProf) {
      this.onProfessorSelected(currentProf);
    }

    this.cdr.markForCheck();
  }

  private setupAutocomplete(): void {
    const professorOptions: ProfessorOption[] = [
      { id: -1, name: 'None', type: '' },
      ...this.data.facultyOptions.map((f, index) => ({
        id: index,
        name: f.name,
        type: f.faculty_type,
      })),
    ];

    this.filteredProfessors$ = this.scheduleForm
      .get('professor')!
      .valueChanges.pipe(
        startWith(this.scheduleForm.get('professor')?.value || ''),
        map((value) => this.filterProfessorOptions(value, professorOptions)),
        shareReplay(1)
      );

    this.scheduleForm
      .get('professor')!
      .valueChanges.pipe(
        takeUntil(this.destroy$),
        distinctUntilChanged()
      )
      .subscribe((prof) => {
        this.onProfessorSelected(prof);
      });

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

  // Validator to ensure the control value matches one of valid options
  private mustMatchOption(validOptions: string[]): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if (!control.value) return null;
      return validOptions.includes(control.value)
        ? null
        : { invalidOption: true };
    };
  }

  private setupCustomValidators(): void {
    const profOpts = ['None', ...this.data.options.professorOptions];
    this.scheduleForm
      .get('professor')
      ?.setValidators(this.mustMatchOption(profOpts));
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

    const isProfNone = !professor || professor === 'None';
    const selectedFaculty = isProfNone
      ? null
      : this.data.facultyOptions.find((f) => f.name === professor);
    const selectedRoom = this.data.roomOptionsList.find(
      (r) => r.room_code === room
    );

    const facultyId = selectedFaculty?.faculty_id || null;
    const roomId = selectedRoom?.room_id || null;

    let hasMatchingSchedule = false;
    let matchingResult: ConflictingScheduleDetail | undefined;

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

    const isProfNone = !formValues.professor || formValues.professor === 'None';
    const selectedFaculty = isProfNone
      ? null
      : this.data.facultyOptions.find((f) => f.name === formValues.professor);

    const selectedRoom = this.data.roomOptionsList.find(
      (r) => r.room_code === formValues.room
    );

    const assignmentTypeId = formValues.assignmentTypeId ?? null;

    this.isLoading = true;
    this.cdr.markForCheck();

    let selectedRoomId: number | null = null;
    if (formValues.room !== 'TBA') {
      selectedRoomId = selectedRoom?.room_id ?? null;
    }

    if (this.data.isDraftMode) {
      this.isLoading = false;
      this.dialogRef.close({
        isDraft: true,
        faculty_id: selectedFaculty?.faculty_id ?? null,
        faculty_name: selectedFaculty?.name || 'Not set',
        room_id: selectedRoomId,
        room_code: formValues.room || 'Not set',
        day: formValues.day ?? null,
        start_time: formattedStartTime,
        end_time: formattedEndTime,
        assignment_type_id: assignmentTypeId
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
            this.data.academic.section_id,
            null,
            assignmentTypeId
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

  // Handles toggle event for combining bridging courses
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
    this.currentAssignmentSelected = false;
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
    this.onProfessorSelected(faculty.name);
    this.scheduleForm.markAllAsTouched();
    this.cdr.markForCheck();
  }

  // Pre-fills form with current schedule slot assignment values
  public selectCurrentAssignment(): void {
    const schedule = this.data.existingSchedule;
    if (!schedule || schedule.professor === 'Not set') return;

    this.selectedFaculty = null;
    this.currentAssignmentSelected = true;

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
    this.onProfessorSelected(schedule.professor);
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
    this.scheduleForm.get('assignmentTypeId')?.disable();
    this.scheduleForm.patchValue({ assignmentTypeId: null });
    this.data.options.endTimeOptions = [...this.data.options.timeOptions];
    this.selectedDay = '';
    this.originalDay = '';
    this.selectedFaculty = null;
    this.selectedFacultyType = null;
    this.currentAssignmentSelected = false;
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
    return getFacultyTypeClass(facultyType);
  }

  // Checks if scheduling form is completely empty
  public isFormEmpty(): boolean {
    const v = this.scheduleForm?.value;
    if (!v) {
      return true;
    }
    return (
      !v.day &&
      !v.startTime &&
      !v.endTime &&
      (!v.professor || v.professor === 'None') &&
      !v.room &&
      !v.assignmentTypeId
    );
  }

  // Checks if assign schedule button is disabled
  public isAssignDisabled(): boolean {
    return (
      this.hasConflicts ||
      this.isLoading ||
      this.isValidating ||
      this.scheduleForm.invalid
    );
  }

  // Returns contextual explanation for disabled assign button
  public getAssignDisabledReason(): string {
    if (this.hasConflicts) {
      return 'Resolve schedule conflict before assigning';
    }
    if (this.scheduleForm.invalid) {
      return 'Please select valid day, times, professor, and room';
    }
    if (this.isValidating) {
      return 'Validation in progress, please wait...';
    }
    if (this.isLoading) {
      return 'Saving assignment...';
    }
    return '';
  }
}

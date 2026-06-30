import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable, Subject, forkJoin, of, from } from 'rxjs';
import { takeUntil, switchMap, tap, map, catchError, finalize, concatMap } from 'rxjs/operators';
import { fadeAnimation, pageFloatUpAnimation } from '../../../animations/animations';

import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSymbolDirective } from '../../../imports/mat-symbol.directive';

import { TableHeaderComponent, InputField } from '../../../../shared/table-header/table-header.component';
import { TableDialogComponent } from '../../../../shared/table-dialog/table-dialog.component';
import { DialogSchedulingComponent } from '../../../../shared/dialog-scheduling/dialog-scheduling.component';
import { DialogTemporaryCourseComponent } from '../../../../shared/dialog-temporary-course/dialog-temporary-course.component';
import { DialogGenericComponent } from '../../../../shared/dialog-generic/dialog-generic.component';
import { DialogInfoComponent } from '../../../../shared/dialog-info/dialog-info.component';
import { LoadingComponent } from '../../../../shared/loading/loading.component';

import { SchedulingService, CacheType } from '../../../services/admin/scheduling/scheduling.service';
import { AcademicYearService } from '../../../services/admin/academic-year/academic-year.service';
import { PermissionService } from '../../../services/permission/permission.service';
import { DraftStateService } from '../../../services/admin/scheduling/draft-state.service';

import {
  Schedule,
  AcademicYear,
  Semester,
  Program,
  YearLevel,
  PopulateSchedulesResponse,
  CourseResponse,
  ProgramOption,
  SectionOption,
  YearLevelOption,
  TemporaryCourseOfferingPayload,
  DraftEntry
} from '../../../models/scheduling.model';

@Component({
  selector: 'app-scheduling',
  imports: [
    CommonModule,
    TableHeaderComponent,
    LoadingComponent,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatSymbolDirective,
  ],
  templateUrl: './scheduling.component.html',
  styleUrls: ['./scheduling.component.scss'],
  animations: [fadeAnimation, pageFloatUpAnimation],
})
export class SchedulingComponent implements OnInit, OnDestroy {
  schedules: Schedule[] = [];
  programOptions: ProgramOption[] = [];
  yearLevelOptions: YearLevelOption[] = [];
  sectionOptions: SectionOption[] = [];
  academicYearOptions: AcademicYear[] = [];
  semesterOptions: Semester[] = [];
  programs: Program[] = [];
  timeOptions: string[] = [];
  dayOptions: string[] = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ];
  endTimeOptions: string[] = [];

  selectedProgram: string = '';
  selectedYear: number = 1;
  selectedSection: string = '';
  selectedCurriculumId: number | null = null;

  previousProgram: string = '';
  previousYear: number = 1;

  activeYear: string = '';
  activeSemester: number = 0;
  activeSemesterId: number = 0;
  activeSemesterRecordId: number | null = null;
  activeAcademicYearId: number | null = null;
  startDate: string = '';
  endDate: string = '';

  displayedColumns: string[] = [];
  headerInputFields: InputField[] = [];
  isLoading = true;
  loadingScheduleId: number | null = null;
  isSubmissionEnabled: number = 0;
  processingCourseId: number | null = null;
  isCreatingTemporaryCourse: boolean = false;

  /* Draft mode state */
  isDraftMode: boolean = false;
  draftSchedules: Schedule[] = [];
  isAiFilling: boolean = false;
  aiFillProgress: { current: number; total: number } = { current: 0, total: 0 };
  isHistoricalLoading: boolean = false;

  hasBridgingCourses: boolean = false;

  isMlPredicting: boolean = false;
  
  private destroy$ = new Subject<void>();
  private readonly DIALOG_INFO_PREF_KEY = 'doNotShowDialogInfo';

  constructor(
    private schedulingService: SchedulingService,
    private academicYearService: AcademicYearService,
    private permissionService: PermissionService,
    private draftStateService: DraftStateService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.initializeHeaderInputFields();
    this.initializeDisplayedColumns();
    this.generateTimeOptions();
    this.schedulingService.resetCaches([CacheType.Schedules]);

    // Pre-fetch scheduling metadata to optimize dialog opening speed
    this.schedulingService
      .getAllRooms()
      .pipe(takeUntil(this.destroy$))
      .subscribe();
    this.schedulingService
      .getFacultyDetails()
      .pipe(takeUntil(this.destroy$))
      .subscribe();
    this.schedulingService
      .getSubmittedPreferencesForActiveSemester()
      .pipe(takeUntil(this.destroy$))
      .subscribe();

    forkJoin({
      activeYearSemester: this.loadActiveYearAndSemester(),
      programs: this.loadPrograms(),
    })
      .pipe(
        takeUntil(this.destroy$),
        switchMap(() => this.setDefaultSelections())
      )
      .subscribe({
        next: () => {
          const selectedProgramObj = this.programOptions.find(
            (p) => p.display === this.selectedProgram
          );
          const yearLevelObj = this.yearLevelOptions.find(
            (y) => y.year_level === this.selectedYear
          );

          if (
            this.selectedCurriculumId &&
            selectedProgramObj &&
            yearLevelObj?.year_level_id &&
            yearLevelObj?.semester_id
          ) {
            this.checkBridgingCourses(
              this.selectedCurriculumId,
              selectedProgramObj,
              yearLevelObj.year_level_id,
              yearLevelObj.semester_id
            );
          } else {
            this.hasBridgingCourses = false;
          }

          if (this.isSubmissionEnabled === 1 && !this.shouldSkipDialog()) {
            this.openInfoDialog();
          }

          this.isLoading = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.isLoading = false;
          this.cdr.detectChanges();
          this.handleError('Error initializing scheduling component')(err);
        },
      });
  }

  ngOnDestroy(): void {
    this.schedulingService.resetCaches([CacheType.Preferences]);
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Returns draft or live schedule data based on current mode.
   */
  protected get tableData(): Schedule[] {
    return this.isDraftMode ? this.draftSchedules : this.schedules;
  }

  /**
   * Toggles between Draft Mode and Live Mode.
   */
  protected toggleDraftMode(): void {
    if (!this.isDraftMode) {
      // Entering Draft Mode
      this.draftSchedules = JSON.parse(JSON.stringify(this.schedules));
      this.draftStateService.initFromSchedules(this.schedules);
      this.isDraftMode = true;
    } else {
      // Exiting Draft Mode
      if (this.draftStateService.hasDirtyEntries()) {
        const dialogRef = this.dialog.open(DialogGenericComponent, {
          data: {
            title: 'Exit Draft Mode?',
            content: 'You have unsaved changes. Exiting will discard your draft.',
            actionText: 'Discard & Exit',
            cancelText: 'Stay in Draft',
            action: 'confirm'
          }
        });

        dialogRef.afterClosed().subscribe(result => {
          if (result === 'confirm') {
            this.exitDraftInternal();
          }
        });
      } else {
        this.exitDraftInternal();
      }
    }
  }

  protected openHistoricalDialog(): void {
    this.academicYearService.getAcademicYears()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (years) => {
          const yearOptions = years.map(y => ({
            label: y.academic_year,
            value: y.academic_year_id
          }));

          const semesterOptions = [
            { label: 'First Semester', value: 1 },
            { label: 'Second Semester', value: 2 },
            { label: 'Summer', value: 3 }
          ];

          const dialogRef = this.dialog.open(TableDialogComponent, {
            data: {
              title: 'Select Historical Term',
              fields: [
                {
                  label: 'Academic Year',
                  formControlName: 'academic_year_id',
                  type: 'select',
                  options: yearOptions,
                  required: true
                },
                {
                  label: 'Semester',
                  formControlName: 'semester_id',
                  type: 'select',
                  options: semesterOptions,
                  required: true
                }
              ],
              isEdit: false
            }
          });

          dialogRef.afterClosed()
            .pipe(takeUntil(this.destroy$))
            .subscribe(result => {
              if (result) {
                this.applyHistoricalSchedules(result.academic_year_id, result.semester_id);
              }
            });
        },
        error: () => {
          this.snackBar.open('Failed to load academic years.', 'Close', { duration: 3000 });
        }
      });
  }

  /**
   * Applies historical schedules to the current view.
   * @param academic_year_id The ID of the academic year to load schedules from.
   * @param semester_id The ID of the semester to load schedules from.
   */
  private applyHistoricalSchedules(academic_year_id: number, semester_id: number): void {
    this.isHistoricalLoading = true;
    this.cdr.markForCheck();

    this.schedulingService.getHistoricalSchedules(academic_year_id, semester_id).subscribe({
      next: (response) => {
        // Identify valid courses for current program, year level, and section
        const program = response.programs.find(p => {
          const display = `${p.program_code} - ${p.program_title}`;
          return display.trim().toLowerCase() === this.selectedProgram.trim().toLowerCase();
        });
        const yearLevel = program?.year_levels.find(y => y.year_level === Number(this.selectedYear));
        
        // Since the backend already filters by semester, we take the first available semester entry
        const semester = yearLevel?.semesters[0];
        const section = semester?.sections.find(s => 
          s.section_name.trim().toLowerCase() === this.selectedSection.trim().toLowerCase()
        );

        if (!section || !section.courses || section.courses.length === 0) {
          const msg = 'No matching historical data found for this section.';
          console.warn(msg, { searchingFor: this.selectedSection });
          this.snackBar.open(msg, 'Close', { duration: 3000 });
          this.isHistoricalLoading = false;
          this.cdr.markForCheck();
          return;
        }

        // Identify empty slots in current draft
        const emptySlots = this.draftSchedules.filter(s => s.day === 'Not set');
        let matchCount = 0;
        const filledEntries: DraftEntry[] = [];

        emptySlots.forEach(slot => {
          const matchedCourse = section.courses.find(c => Number(c.course_id) === Number(slot.course_id));
          if (matchedCourse && matchedCourse.schedule && matchedCourse.schedule.day !== 'Not set') {
            const entry: DraftEntry = {
              schedule_id: slot.schedule_id!,
              faculty_id: matchedCourse.faculty_id || null,

              faculty_name: matchedCourse.professor || 'Not set',
              room_id: matchedCourse.schedule.room_id || null,
              room_code: matchedCourse.room?.room_code || 'Not set',
              day: matchedCourse.schedule.day,
              start_time: matchedCourse.schedule.start_time,
              end_time: matchedCourse.schedule.end_time,
              hasConflict: false
            };
            this.draftStateService.set(slot.schedule_id!, entry);
            filledEntries.push(entry);
            matchCount++;
          }
        });

        if (matchCount === 0) {
          this.snackBar.open('No matching historical courses found to fill empty slots.', 'Close', { duration: 3000 });
          this.isHistoricalLoading = false;
          this.cdr.markForCheck();
          return;
        }

        // Run conflict checks sequentially for all filled rows
        from(filledEntries).pipe(
          concatMap(entry => this.runConflictCheck(entry)),
          finalize(() => {
            this.rebuildDraftSchedules();
            const conflictCount = this.draftStateService.getConflicted().length;
            let msg = `${matchCount} of ${emptySlots.length} courses filled from history.`;
            if (conflictCount > 0) {
              msg += ` · ${conflictCount} conflict(s) detected — review highlighted rows.`;
            }
            this.snackBar.open(msg, 'Close', { duration: 5000 });
            this.isHistoricalLoading = false;
            this.cdr.markForCheck();
          })
        ).subscribe();
      },
      error: () => {
        this.snackBar.open('Failed to load historical schedules.', 'Close', { duration: 3000 });
        this.isHistoricalLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  /**
   * Runs conflict check for a single draft entry.
   * @param entry The draft entry to check.
   * @returns An observable that completes when the conflict check is done.
   */
  private runConflictCheck(entry: DraftEntry): Observable<void> {
    const program = this.programOptions.find(
      (p) => p.display === this.selectedProgram
    );
    const section = this.sectionOptions.find(
      (s) => s.section_name === this.selectedSection
    );

    if (!program || !section) return of(void 0);

    const draftSchedule = this.draftSchedules.find(
      (s) => s.schedule_id === entry.schedule_id
    );
    const courseId = draftSchedule?.course_id || 0;

    const timeToMinutes = (timeStr: string): number => {
      const [hours, minutes] = timeStr.split(':').map(Number);
      return hours * 60 + minutes;
    };

    const courseSchedules = (
      this.isDraftMode ? this.draftSchedules : this.schedules
    ).filter(
      (s) =>
        s.course_id === courseId &&
        s.schedule_id !== entry.schedule_id &&
        s.day &&
        s.day !== 'Not set'
    );

    let hoursAlreadyAssigned = 0;
    courseSchedules.forEach((s) => {
      if (s.start_time && s.end_time) {
        hoursAlreadyAssigned +=
          (timeToMinutes(s.end_time) - timeToMinutes(s.start_time)) / 60;
      }
    });

    return this.schedulingService
      .checkForScheduleConflicts(
        courseId,
        entry.schedule_id,
        program.id,
        this.selectedYear,
        entry.day || '',
        entry.start_time || '',
        entry.end_time || '',
        section.section_id,
        entry.faculty_id,
        entry.room_id,
        hoursAlreadyAssigned
      )
      .pipe(
        tap((result) => {
          const currentEntry = this.draftStateService.get(entry.schedule_id);
          if (currentEntry) {
            this.draftStateService.set(entry.schedule_id, {
              ...currentEntry,
              hasConflict: result.hasConflicts,
            });
          }
        }),
        map(() => void 0),
        catchError(() => of(void 0))
      );
  }

  /**
   * Fills empty slots with AI-generated schedule suggestions.
   * @returns void
   */
  protected fillWithAI(): void {
    const emptySlots = this.draftSchedules.filter(s => s.day === 'Not set');
    if (emptySlots.length === 0) {
      this.snackBar.open('No empty slots to fill.', 
        'Close', { duration: 3000 }
      );
      return;
    }

    this.snackBar.open('AI is analyzing faculty preferences...', 'Close', { duration: 2000 });
    this.isAiFilling = true;

    const selectedOption = this.programOptions.find(o => o.display === this.selectedProgram);
    if (!selectedOption) {
      this.isAiFilling = false;
      const msg = 'Program selection not found.';
      console.error(msg, { selected: this.selectedProgram });
      this.snackBar.open(msg, 'Close', { duration: 3000 });
      return;
    }

    const programId = selectedOption.id;

    const selectedYearLevelObj = selectedOption.year_levels.find((y: any) => y.year_level === this.selectedYear);
    if (!selectedYearLevelObj) {
      this.isAiFilling = false;
      this.snackBar.open('Year level data not found.', 'Close', { duration: 3000 });
      return;
    }

    const selectedSectionObj = selectedYearLevelObj.sections.find((s: any) => s.section_name === this.selectedSection);
    if (!selectedSectionObj) {
      this.isAiFilling = false;
      this.snackBar.open('Section data not found.', 'Close', { duration: 3000 });
      return;
    }

    const sectionId = selectedSectionObj.section_id;

    this.aiFillProgress = { current: 0, total: emptySlots.length };
    this.cdr.markForCheck();

    let unassignedCount = 0;

    from(emptySlots).pipe(
      concatMap(slot => {
        return this.schedulingService.getSmartSuggestion(
          slot.course_id,
          this.activeAcademicYearId || 0,
          this.activeSemesterId || 0,
          this.activeSemesterRecordId || 0,
          programId,
          this.selectedYear,
          sectionId
        ).pipe(
          switchMap(suggestion => {
            if (suggestion && suggestion.faculty_id) {
              const entry: DraftEntry = {
                schedule_id: slot.schedule_id!,
                faculty_id: suggestion.faculty_id,
                faculty_name: suggestion.faculty_name,
                room_id: null,
                room_code: 'Not set',
                day: suggestion.day,
                start_time: this.convertTimeToBackendFormat(suggestion.start_time),
                end_time: this.convertTimeToBackendFormat(suggestion.end_time),
                hasConflict: false
              };
              this.draftStateService.set(slot.schedule_id!, entry);
              return this.runConflictCheck(entry);
            } else {
              unassignedCount++;
              return of(void 0);
            }
          }),
          tap(() => {
            this.aiFillProgress.current++;
            this.rebuildDraftSchedules();
            this.cdr.markForCheck();
          }),
          catchError(() => {
            unassignedCount++;
            return of(void 0);
          })
        );
      }),
      finalize(() => {
        this.isAiFilling = false;
        this.rebuildDraftSchedules();
        this.cdr.markForCheck();
        
        const assignedCount = emptySlots.length - unassignedCount;
        const msg = assignedCount === emptySlots.length 
          ? `Fill completed. All ${emptySlots.length} slots processed successfully.`
          : `Fill finished. ${assignedCount} slots filled, ${unassignedCount} remained unassigned.`;
        
        this.snackBar.open(msg, 'Close', { duration: 6000 });
      })
    ).subscribe();
  }

  /**
   * Triggers a suggestion for a single row.
   */
  protected onMlSuggest(slot: Schedule): void {
    if (this.isAiFilling || this.isMlPredicting) return;

    this.isMlPredicting = true;
    this.snackBar.open(
      `Analyzing suggestions for ${slot.course_code}...`, 
      'Close', 
      { duration: 2000 }
    );

    const selectedOption = this.programOptions.find(
      (o) => o.display === this.selectedProgram
    );
    const programId = selectedOption?.id || 0;
    
    const selectedYearLevelObj = selectedOption?.year_levels.find(
      (y: any) => y.year_level === this.selectedYear
    );
    const selectedSectionObj = selectedYearLevelObj?.sections.find(
      (s: any) => s.section_name === this.selectedSection
    );
    const sectionId = selectedSectionObj?.section_id || 0;

    this.schedulingService.getSmartSuggestion(
      slot.course_id,
      this.activeAcademicYearId || 0,
      this.activeSemesterId || 0,
      this.activeSemesterRecordId || 0,
      programId,
      this.selectedYear,
      sectionId
    ).pipe(
      takeUntil(this.destroy$),
      finalize(() => {
        this.isMlPredicting = false;
        this.cdr.markForCheck();
      })
    ).subscribe(suggestion => {
      if (suggestion && suggestion.faculty_id) {
        const entry: DraftEntry = {
          schedule_id: slot.schedule_id!,
          faculty_id: suggestion.faculty_id,
          faculty_name: suggestion.faculty_name,
          room_id: null,
          room_code: 'Not set',
          day: suggestion.day,
          start_time: this.convertTimeToBackendFormat(
            suggestion.start_time
          ),
          end_time: this.convertTimeToBackendFormat(
            suggestion.end_time
          ),
          hasConflict: false
        };
        
        this.draftStateService.set(slot.schedule_id!, entry);
        this.runConflictCheck(entry).subscribe(() => {
          this.rebuildDraftSchedules();
          this.cdr.markForCheck();
          
          const source = suggestion.isMl ? 'ML Model' : 'Backend Rules';
          this.snackBar.open(
            `Suggested ${suggestion.faculty_name} (${source})`, 
            'Close', 
            { duration: 3000 }
          );
        });
      } else {
        this.snackBar.open(
          `No suggestions found for ${slot.course_code}`, 
          'Close', 
          { duration: 3000 }
        );
      }
    });
  }

  /**
   * Saves draft changes to the backend.
   * @returns void
   */
  protected saveDraft(): void {
    const dirtyEntries = this.draftStateService.getDirty();
    if (dirtyEntries.length === 0) {
      this.snackBar.open('No changes to save.', 'Close', { duration: 3000 });
      return;
    }

    const conflicted = dirtyEntries.filter(e => e.hasConflict);
    const toSave = dirtyEntries.filter(e => !e.hasConflict);

    if (toSave.length === 0 && conflicted.length > 0) {
      this.snackBar.open('Cannot save: All changes have conflicts. Resolve them first.', 'Close', { duration: 5000 });
      return;
    }

    const saveStream$ = new Subject<any>();
    
    // Lazy load the component since it's used only here
    import('../../../../shared/dialog-draft-save/dialog-draft-save.component')
      .then(({ DialogDraftSaveComponent }) => {
      const dialogRef = this.dialog.open(DialogDraftSaveComponent, {
        data: {
          dirtyEntries: toSave,
          skippedEntries: conflicted,
          saveStream$: saveStream$.asObservable()
        },
        width: '500px'
      });

      from(toSave).pipe(
        concatMap(entry => {
          saveStream$.next({ schedule_id: entry.schedule_id, status: 'saving' });

          const selectedOption = this.programOptions.find(
            (o) => o.display === this.selectedProgram
          );
          const programId = selectedOption?.id || 0;
          const selectedYearLevelObj = selectedOption?.year_levels.find(
            (y: any) => y.year_level === this.selectedYear
          );
          const selectedSectionObj = selectedYearLevelObj?.sections.find(
            (s: any) => s.section_name === this.selectedSection
          );
          const sectionId = selectedSectionObj?.section_id || 0;
          
          return this.schedulingService.assignSchedule(
            entry.schedule_id,
            entry.faculty_id,
            entry.room_id,
            entry.day,
            entry.start_time,
            entry.end_time,
            programId,
            this.selectedYear,
            sectionId
          ).pipe(
            tap(() => saveStream$.next({ schedule_id: entry.schedule_id, status: 'success' })),
            catchError(err => {
              saveStream$.next({ 
                schedule_id: entry.schedule_id, 
                status: 'error', 
                errorMessage: err.error?.message || 'Update failed' 
              });
              return of(null);
            })
          );
        }),
        finalize(() => {
          saveStream$.complete();
        })
      ).subscribe();

      dialogRef.afterClosed().subscribe(refresh => {
        if (refresh) {
          this.isDraftMode = false;
          this.draftStateService.clear();
          this.draftSchedules = [];
          this.onInputChange({
            program: this.selectedProgram,
            yearLevel: this.selectedYear,
            section: this.selectedSection,
          }, true);
          this.snackBar.open('Draft changes saved successfully.', 
            'Close', { duration: 3000 }
          );
        }
      });
    });
  }

  /**
   * Discards draft changes.
   */
  protected discardDraft(): void {
    const dialogRef = this.dialog.open(DialogGenericComponent, {
      data: {
        title: 'Discard Draft?',
        content: 'All unsaved changes will be lost permanently.',
        actionText: 'Discard',
        cancelText: 'Cancel',
        action: 'confirm'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result === 'confirm') {
        this.exitDraftInternal();   
        this.toggleDraftMode();
      }
    });
  }

  private exitDraftInternal(): void {
    this.isDraftMode = false;
    this.draftSchedules = [];
    this.draftStateService.clear();
    this.cdr.markForCheck();
    this.snackBar.open('Draft Mode closed. All unsaved changes discarded.',
      'Close', { duration: 3000 }
    );
  }

  protected isDraftDirty(schedule: Schedule): boolean {
    if (!schedule.schedule_id) return false;
    return this.draftStateService.isIdDirty(schedule.schedule_id);
  }

  protected isDraftConflict(schedule: Schedule): boolean {
    if (!schedule.schedule_id) return false;
    return this.draftStateService.get(schedule.schedule_id)?.hasConflict ?? false;
  }

  /**
   * Rebuilds the draft schedules from the draft state service
   */
  private rebuildDraftSchedules(): void {
    this.draftSchedules = this.draftSchedules.map(schedule => {
      const draft = this.draftStateService.get(schedule.schedule_id!);
      if (draft) {
        return {
          ...schedule,
          faculty_id: draft.faculty_id || undefined,
          professor: draft.faculty_name,
          room_id: draft.room_id || undefined,
          room: draft.room_code,
          day: draft.day || 'Not set',
          start_time: draft.start_time,
          end_time: draft.end_time,
          time: this.getFormattedTime(draft.start_time || undefined, draft.end_time || undefined)
        };
      }
      return schedule;
    });
    this.cdr.markForCheck();
  }

  // ======================
  // Initialization Methods
  // ======================

  private initializeHeaderInputFields(): void {
    this.headerInputFields = [
      { type: 'select', label: 'Program', key: 'program', options: [] },
      { type: 'select', label: 'Year Level', key: 'yearLevel', options: [] },
      { type: 'select', label: 'Section', key: 'section', options: [] },
    ];
  }

  private initializeDisplayedColumns(): void {
    this.displayedColumns = [
      'index',
      'course_code',
      'course_title',
      'lec_hours',
      'lab_hours',
      'units',
      // 'tuition_hours',
      'day',
      'time',
      'professor',
      'room',
      'action',
    ];
  }

  // ====================
  // Data Loading Methods
  // ====================

  private loadActiveYearAndSemester(): Observable<void> {
    return this.academicYearService.getActiveYearAndSemester().pipe(
      tap(({ activeYear, activeSemester, startDate, endDate }) => {
        this.activeYear = activeYear;
        this.activeSemester = activeSemester;
        this.startDate = startDate;
        this.endDate = endDate;
      }),
      map(() => void 0),
      catchError((error) => {
        this.handleError('Failed to load active year and semester')(error);
        return of(void 0);
      })
    );
  }

  private loadPrograms(): Observable<ProgramOption[]> {
    return this.schedulingService.getActiveYearLevelsCurricula().pipe(
      tap((data) => {
        // Get allowed programs from admin permissions
        const allowedPrograms = this.permissionService.getAllowedPrograms();
        const hasFullAccess = this.permissionService.hasFullProgramAccess();

        // Filter programs based on permissions
        const filteredData = hasFullAccess 
          ? data 
          : data.filter((program) => allowedPrograms.includes(program.program_id));

        this.programOptions = filteredData.map((program) => ({
          display: `${program.program_code} - ${program.program_title}`,
          id: program.program_id,
          year_levels: program.year_levels.map((year: YearLevel) => ({
            year_level: year.year_level,
            year_level_id: year.year_level_id,
            semester_id: year.semester_id,
            curriculum_id: year.curriculum_id,
            sections: year.sections,
          })),
        }));
        this.headerInputFields.find(
          (field) => field.key === 'program'
        )!.options = this.programOptions.map((p) => p.display);
      }),
      map(() => this.programOptions),
      catchError((error) => {
        this.handleError('Failed to load programs')(error);
        return of([]);
      })
    );
  }

  // ===========================
  // Selection and Data Handling
  // ===========================

  private setDefaultSelections(): Observable<void> {
    return new Observable<void>((observer) => {
      if (this.programOptions.length > 0) {
        // Try to restore from cache first
        const cachedProgram = this.schedulingService.getSelectedProgram();
        const defaultProgram =
          cachedProgram && this.programOptions.find((p) => p.id === cachedProgram.id)
            ? this.programOptions.find((p) => p.id === cachedProgram.id)!
            : this.programOptions[0];

        this.selectedProgram = defaultProgram.display;
        this.previousProgram = defaultProgram.display;

        this.yearLevelOptions = defaultProgram.year_levels;

        this.headerInputFields.find(
          (field) => field.key === 'program'
        )!.options = this.programOptions.map((p) => p.display);

        this.headerInputFields.find(
          (field) => field.key === 'yearLevel'
        )!.options = this.yearLevelOptions.map((year) => year.year_level);

        if (this.yearLevelOptions.length > 0) {
          const cachedYear = this.schedulingService.getSelectedYear();
          const defaultYearLevel =
            cachedYear &&
            this.yearLevelOptions.some((y) => y.year_level === cachedYear)
              ? this.yearLevelOptions.find(
                  (y) => y.year_level === cachedYear
                )!
              : this.yearLevelOptions[0];

          this.selectedYear = defaultYearLevel.year_level;
          this.previousYear = defaultYearLevel.year_level;
          this.selectedCurriculumId = defaultYearLevel.curriculum_id;

          this.sectionOptions = defaultYearLevel.sections.sort((a, b) =>
            a.section_name.localeCompare(b.section_name)
          );

          this.headerInputFields.find(
            (field) => field.key === 'section'
          )!.options = this.sectionOptions.map(
            (section) => section.section_name
          );

          if (this.sectionOptions.length > 0) {
            const cachedSection = this.schedulingService.getSelectedSection();
            const defaultSection =
              cachedSection &&
              this.sectionOptions.some((s) => s.section_name === cachedSection)
                ? this.sectionOptions.find(
                    (s) => s.section_name === cachedSection
                  )!
                : this.sectionOptions[0];

            this.selectedSection = defaultSection.section_name;

            // Fetch courses with default selections
            const selectedProgram = this.programOptions.find(
              (p) => p.display === this.selectedProgram
            );
            const selectedSection = this.sectionOptions.find(
              (section) => section.section_name === this.selectedSection
            );

            if (selectedProgram && selectedSection) {
              this.fetchCourses(
                selectedProgram.id,
                this.selectedYear,
                selectedSection.section_id
              ).subscribe({
                next: () => {
                  observer.next();
                  observer.complete();
                },
                error: this.handleError(
                  'Failed to fetch courses on initial load'
                ),
              });
            } else {
              observer.next();
              observer.complete();
            }
          } else {
            observer.next();
            observer.complete();
          }
        } else {
          observer.next();
          observer.complete();
        }
      } else {
        observer.next();
        observer.complete();
      }
    });
  }

  protected onInputChange(values: { [key: string]: any }, forceRefresh: boolean = false): void {
    if (this.isDraftMode) {
      this.exitDraftInternal();
    }

    const selectedProgramDisplay = values['program'];
    const selectedYearLevel = values['yearLevel'];
    const selectedSectionDisplay = values['section'];

    let programChanged = selectedProgramDisplay !== this.previousProgram;
    let yearLevelChanged = selectedYearLevel !== this.previousYear;

    const selectedProgram = this.programOptions.find(
      (p) => p.display === selectedProgramDisplay
    );

    if (!selectedProgram) {
      this.schedules = [];
      return;
    }

    // Cache the selected program
    this.schedulingService.setSelectedProgram({
      display: selectedProgram.display,
      id: selectedProgram.id
    });

    this.selectedProgram = selectedProgramDisplay;

    this.yearLevelOptions = selectedProgram.year_levels;

    this.headerInputFields.find((field) => field.key === 'yearLevel')!.options =
      this.yearLevelOptions.map((year) => year.year_level);

    if (programChanged) {
      if (this.yearLevelOptions.length > 0) {
        this.selectedYear = this.yearLevelOptions[0].year_level;
        yearLevelChanged = true;
        this.previousYear = this.selectedYear;
      }
    } else if (yearLevelChanged) {
      this.selectedYear = selectedYearLevel;
      this.previousYear = this.selectedYear;
    }

    const selectedYearLevelObj = this.yearLevelOptions.find(
      (year) => year.year_level === this.selectedYear
    );

    if (!selectedYearLevelObj) {
      this.schedules = [];
      return;
    }

    this.selectedCurriculumId = selectedYearLevelObj.curriculum_id;
    this.sectionOptions = selectedYearLevelObj.sections.sort((a, b) =>
      a.section_name.localeCompare(b.section_name)
    );

    const yearLevelId = selectedYearLevelObj.year_level_id;
    const semesterId = selectedYearLevelObj.semester_id;

    // Check if there are bridging courses
    if (
      this.selectedCurriculumId &&
      selectedProgram &&
      yearLevelId &&
      semesterId
    ) {
      this.checkBridgingCourses(
        this.selectedCurriculumId, 
        selectedProgram, 
        yearLevelId, 
        semesterId
      );
    } else {
      this.hasBridgingCourses = false;
    }

    this.headerInputFields.find((field) => field.key === 'section')!.options =
      this.sectionOptions.map((section) => section.section_name);

    // Finds the value of selected section
    if (programChanged || yearLevelChanged) {
      if (this.sectionOptions.length > 0) {
        this.selectedSection = this.sectionOptions[0].section_name;
      } else {
        this.selectedSection = '';
      }
    } else {
      this.selectedSection = selectedSectionDisplay;
    }

    const selectedSection = this.sectionOptions.find(
      (section) => section.section_name === this.selectedSection
    );

    if (!selectedSection) {
      this.schedules = [];
      return;
    }

    // Cache the selected year level and section
    this.schedulingService.setSelectedYear(this.selectedYear);
    this.schedulingService.setSelectedSection(this.selectedSection);

    this.fetchCourses(
      selectedProgram.id,
      this.selectedYear,
      selectedSection.section_id,
      forceRefresh
    ).subscribe({
      next: () => {},
      error: this.handleError('Failed to fetch courses'),
    });

    this.previousProgram = this.selectedProgram;
  }

  /**
   * Checks if there are bridging courses 
   * for the selected curriculum, program, year level, and semester.
   * @param curriculumId 
   * @param selectedProgram 
   * @param yearLevelId 
   * @param semesterId 
   */
  private checkBridgingCourses(
    curriculumId: number,
    selectedProgram: ProgramOption, 
    yearLevelId: number, 
    semesterId: number
  ) {
    this.schedulingService.getBridgingCourses(
      curriculumId,
      selectedProgram.id,
      yearLevelId,
      semesterId
    ).pipe(
      takeUntil(this.destroy$),
      catchError((error) => {
        this.hasBridgingCourses = false;
        this.cdr.detectChanges();
        console.error('Failed to fetch bridging courses', error);
        this.snackBar.open('Failed to check for bridging courses.',
          'Close', {
          duration: 5000
        });
        return of([]);
      })
    ).subscribe((bridgingCourses) => {
      this.hasBridgingCourses = bridgingCourses && bridgingCourses.length > 0;
      this.cdr.detectChanges();
    });
  }

  /**
   * Fetches the courses for the selected program, year level, and section.
   * @param programId 
   * @param yearLevel 
   * @param sectionId 
   * @returns 
   */
  private fetchCourses(
    programId: number,
    yearLevel: number,
    sectionId: number,
    forceRefresh: boolean = false
  ): Observable<Schedule[]> {
    return this.schedulingService.populateSchedules(forceRefresh).pipe(
      tap((response: PopulateSchedulesResponse) => {
        const program = response.programs.find(
          (p) => p.program_id === programId
        );
        if (!program) {
          this.schedules = [];
          return;
        }

        const yearLevelData = program.year_levels.find(
          (yl) => yl.year_level === yearLevel
        );
        if (!yearLevelData) {
          this.schedules = [];
          return;
        }

        const semesterData = yearLevelData.semesters.find(
          (s) => s.semester === response.semester_id
        );
        if (!semesterData) {
          this.schedules = [];
          return;
        }

        const sectionData = semesterData.sections.find(
          (s) => s.section_per_program_year_id === sectionId
        );
        if (!sectionData) {
          this.schedules = [];
          return;
        }

        this.isSubmissionEnabled = response.is_submission_enabled;
        this.activeAcademicYearId = response.academic_year_id;
        this.activeSemesterId = response.semester_id;
        this.activeSemesterRecordId = response.active_semester_id;

        this.schedules = sectionData.courses.map((course: CourseResponse) => ({
          schedule_id: course.schedule?.schedule_id,
          section_course_id: course.section_course_id,
          course_id: course.course_id,
          course_code: course.course_code,
          course_title: course.course_title,
          lec_hours: course.lec_hours,
          lab_hours: course.lab_hours,
          units: course.units,
          tuition_hours: course.tuition_hours,
          day: course.schedule?.day || 'Not set',
          time: this.getFormattedTime(
            course.schedule?.start_time,
            course.schedule?.end_time
          ),
          start_time: course.schedule?.start_time || null,
          end_time: course.schedule?.end_time || null,
          professor: course.professor || 'Not set',
          room: course.room?.room_code || 'Not set',
          program: program.program_title,
          program_code: program.program_code,
          year: yearLevelData.year_level,
          curriculum: yearLevelData.curriculum_year,
          section: sectionData.section_name,
          is_copy: course.is_copy || 0,
          is_temporary: !!course.is_temporary,
          temporary_type: course.temporary_type ?? null,
          temporary_status: course.temporary_status ?? null,
          petition_required: !!course.petition_required,
          temporary_course_offering_id:
            course.temporary_course_offering_id ?? null,
          elective_id: course.schedule?.elective_id ?? null,
          elective_slot_name: course.schedule?.elective_slot_name ?? null,
          // placeholder, stamped correctly after sort
          isLastInGroup: false, 
        }));

        this.schedules.sort((a, b) => {
          if (a.course_code === b.course_code) {
            return a.is_copy - b.is_copy;
          }
          return a.course_code.localeCompare(b.course_code);
        });

        this.schedules.forEach((schedule, index, array) => {
          schedule.isLastInGroup =
            index === array.length - 1 ||
            schedule.course_code !== array[index + 1].course_code;
        });

        this.cdr.detectChanges();
      }),
      map(() => this.schedules),
      catchError((error) => {
        this.handleError('Failed to fetch courses')(error);
        return of([]);
      })
    );
  }

  // ====================
  // Dialog Methods
  // ====================

  openInfoDialog(): void {
    const dialogRef = this.dialog.open(DialogInfoComponent, {
      autoFocus: true,
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result && result.doNotShowAgain) {
        this.setSkipDialogFlag();
      }
    });
  }

  openAddTemporaryCourseDialog(): void {
    if (this.isDraftMode) {
      this.exitDraftInternal();
    }

    const program = this.programOptions.find(
      (p) => p.display === this.selectedProgram
    );
    const section = this.sectionOptions.find(
      (s) => s.section_name === this.selectedSection
    );

    if (!program || !section) {
      this.snackBar.open('Select a program, year level, and section first.', 'Close', {
        duration: 3000,
      });
      return;
    }

    this.isCreatingTemporaryCourse = true;

    const curriculumId = this.selectedCurriculumId;
    const yearLevelData = this.yearLevelOptions.find(
      (year) => year.year_level === this.selectedYear
    );
    const bridgingCourses$ =
      curriculumId && yearLevelData?.year_level_id && yearLevelData?.semester_id
        ? this.schedulingService.getBridgingCourses(
            curriculumId,
            program.id,
            yearLevelData.year_level_id,
            yearLevelData.semester_id
          )
        : of([]);

    forkJoin({
      courses: this.schedulingService.getProgramCourses(program.id),
      schedules: this.schedulingService.populateSchedules(),
      bridgingCourses: bridgingCourses$,
    })
      .pipe(
        finalize(() => {
          this.isCreatingTemporaryCourse = false;
        })
      )
      .subscribe({
        next: ({ courses, schedules, bridgingCourses }) => {
          this.activeAcademicYearId = schedules.academic_year_id;
          this.activeSemesterId = schedules.semester_id;

          if (!courses.length) {
            this.snackBar.open('No courses available for this program.', 'Close', {
              duration: 3000,
            });
            return;
          }

          if (yearLevelData == undefined) {
            this.snackBar.open('Year level data is missing.', 'Close', {
              duration: 3000,
            });
            return;
          }

          const sortedCourses = courses.sort((a, b) =>
            a.course_code.localeCompare(b.course_code)
          );

          const filteredBridgingCourses = bridgingCourses.filter(
            (course) =>
              course.program_id === program.id &&
              course.year_level_id === yearLevelData.year_level_id &&
              course.semester_id === yearLevelData.semester_id
          );

          const dialogRef = this.dialog.open(DialogTemporaryCourseComponent, {
            maxWidth: '35rem',
            width: '100%',
            autoFocus: true,
            data: {
              programLabel: program.display,
              yearLevel: this.selectedYear,
              sections: this.sectionOptions,
              defaultSectionId: section.section_id,
              courses: sortedCourses,
              bridgingCourses: filteredBridgingCourses,
              curriculumId: this.selectedCurriculumId,
            },
          });

          dialogRef.afterClosed().subscribe((result) => {
            if (!result) {
              return;
            }

            if (!this.activeAcademicYearId || !this.activeSemesterId) {
              this.snackBar.open('Active academic year or semester missing.', 'Close', {
                duration: 3000,
              });
              return;
            }

            const payload: TemporaryCourseOfferingPayload = {
              course_id: result.course_id,
              bridging_course_id: result.bridging_course_id ?? null,
              academic_year_id: this.activeAcademicYearId,
              semester_id: this.activeSemesterId,
              program_id: program.id,
              year_level: this.selectedYear,
              section_per_program_year_id: result.applies_to_all_sections
                ? null
                : result.section_per_program_year_id,
              applies_to_all_sections: result.applies_to_all_sections,
              type: result.type,
              min_petitioners: result.min_petitioners,
              petitioners_count: result.petitioners_count,
              petition_file: result.petition_file,
            };

            this.snackBar.open(
              payload.petition_file
                ? 'Uploading petition file and creating temporary course...'
                : 'Creating temporary course...',
              'Close',
              { duration: 2000 }
            );

            this.schedulingService
              .createTemporaryCourseOffering(payload)
              .pipe(
                switchMap(() => {
                  this.schedulingService.resetCaches([CacheType.Schedules]);
                  return this.fetchCourses(
                    program.id,
                    this.selectedYear,
                    section.section_id,
                    true
                  );
                })
              )
              .subscribe({
                next: (updatedSchedules) => {
                  this.schedules = updatedSchedules;
                  this.cdr.detectChanges();
                  this.snackBar.open(
                    'Temporary course offering created successfully.',
                    'Close',
                    { duration: 3000 }
                  );
                },
                error: this.handleError('Failed to create temporary course offering'),
              });
          });
        },
        error: this.handleError('Failed to load courses for temporary offering'),
      });
  }

  openEditScheduleDialog(schedule: Schedule) {
    if (!schedule.schedule_id) {
      this.snackBar.open('Schedule ID is missing.', 'Close', {
        duration: 3000,
      });
      return;
    }

    this.loadingScheduleId = schedule.schedule_id;

    forkJoin({
      rooms: this.schedulingService.getAllRooms(),
      faculty: this.schedulingService.getFacultyDetails(),
      preferences:
        this.schedulingService.getSubmittedPreferencesForActiveSemester(),
    }).subscribe({
      next: ({ rooms, faculty, preferences }) => {
        this.loadingScheduleId = null;
        const availableRooms = rooms.rooms.filter(
          (room) => room.status === 'Available'
        );

        const roomOptions = [...availableRooms.map((room) => room.room_code), 'TBA'].filter(
          (value, index, array) => array.indexOf(value) === index
        );
        const professorOptions = faculty.faculty.map(
          (professor) => professor.name
        );
        const program = this.programOptions.find(
          (p) => p.display === this.selectedProgram
        );

        const selectedProgramInfo = `${schedule?.program_code} ${this.selectedYear}-${this.selectedSection}`;
        const selectedCourseInfo = `${schedule.course_code} - ${schedule.course_title}`;
        const section = this.sectionOptions.find(
          (s) => s.section_name === schedule.section
        );

        const sectionId = section ? section.section_id : null;

        // =======================
        // Updated SuggestedFaculty
        // =======================
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
        }

        const suggestedFaculty: SuggestedFaculty[] = [];

        preferences.preferences.forEach((pref) => {
          const facultyDetails = faculty.faculty.find(
            (f) => f.faculty_id === pref.faculty_id
          );
          if (!facultyDetails) {
            return;
          }

          pref.active_semesters.forEach((semester) => {
            semester.courses.forEach((course: any) => {
              if (course.is_ignored) return;

              // Extract the section_id from the preference payload
              const prefSectionId = course.section_details?.section_id;

              // Check BOTH course_id AND section_id
              if (
                course.course_details.course_id === schedule.course_id &&
                prefSectionId === sectionId
              ) {
                const existingFaculty = suggestedFaculty.find(
                  (f) => f.faculty_id === facultyDetails.faculty_id
                );

                const facultyPref: SuggestedFaculty = {
                  faculty_id: facultyDetails.faculty_id,
                  name: pref.faculty_name,
                  type: facultyDetails.faculty_type,
                  preferences: course.preferred_days.map((prefDay: any) => ({
                    day: prefDay.day,
                    time: `${this.formatTimeFromBackend(
                      prefDay.start_time
                    )} - ${this.formatTimeFromBackend(prefDay.end_time)}`,
                    program_code: course.course_details.program_code,
                  })),
                  prefIndex: 0,
                };

                if (existingFaculty) {
                  existingFaculty.preferences.push(...facultyPref.preferences);
                } else {
                  suggestedFaculty.push(facultyPref);
                }
              }
            });
          });
        });

        // Lookup combined program code if schedule is combined
        let combinedProgramCode: string | null = null;
        if (schedule.combined_with_program_id &&
            this.programOptions.length > 0) {
          const combinedProgram = this.programOptions.find(
            (p) => p.id === schedule.combined_with_program_id
          );
          combinedProgramCode = combinedProgram?.display?.split(' ')[0] ||
            null;
        }

        const timeToMinutes = (timeStr: string): number => {
          const [hours, minutes] = timeStr.split(':').map(Number);
          return hours * 60 + minutes;
        };

        const courseSchedules = (
          this.isDraftMode ? this.draftSchedules : this.schedules
        ).filter(
          (s) =>
            s.course_id === schedule.course_id &&
            s.schedule_id !== schedule.schedule_id &&
            s.day &&
            s.day !== 'Not set'
        );

        let hoursAlreadyAssigned = 0;
        courseSchedules.forEach((s) => {
          if (s.start_time && s.end_time) {
            hoursAlreadyAssigned +=
              (timeToMinutes(s.end_time) - timeToMinutes(s.start_time)) / 60;
          }
        });

        const dialogRef = this.dialog.open(DialogSchedulingComponent, {
          maxWidth: '80rem',
          width: '95vw',
          height: 'auto',
          maxHeight: '90vh',
          autoFocus: true,
          data: {
            program: {
              id: program?.id || 0,
              info: selectedProgramInfo,
            },
            academic: {
              year_level: this.selectedYear,
              section_id: sectionId || 0,
            },
            options: {
              dayOptions: this.dayOptions,
              timeOptions: [...this.timeOptions],
              endTimeOptions: [...this.timeOptions],
              professorOptions: professorOptions,
              roomOptions: roomOptions,
            },
            facultyOptions: faculty.faculty,
            roomOptionsList: availableRooms,
            selectedProgramInfo: selectedProgramInfo,
            selectedCourseInfo: selectedCourseInfo,
            suggestedFaculty: suggestedFaculty,
            existingSchedule: {
              day: schedule.day,
              time: schedule.time,
              professor: schedule.professor,
              room: schedule.room,
            },
            schedule_id: schedule.schedule_id,
            course_id: schedule.course_id,
            isDraftMode: this.isDraftMode,
            isTemporaryCourse: schedule.is_temporary,
            isBridgingCourse: schedule.is_temporary &&
              schedule.temporary_type === 'bridging',
            bridging_course_id: schedule.bridging_course_id,
            combined_with_program_id: schedule.combined_with_program_id,
            combined_with_program_code: combinedProgramCode,
            hoursAlreadyAssigned,
            lec_hours: schedule.lec_hours,
            lab_hours: schedule.lab_hours,
          },
        });

        dialogRef.afterClosed().subscribe((result) => {
          if (!result) return;

          if (this.isDraftMode && result.isDraft) {
            this.draftStateService.set(schedule.schedule_id!, {
              ...result,
              schedule_id: schedule.schedule_id,
              hasConflict: false
            });
            this.rebuildDraftSchedules();
            this.snackBar.open(
              `Draft updated for ${schedule.course_code}. Save to apply permanently.`,
              'Close',
              { duration: 3000 }
            );
            return;
          }
            this.snackBar.open(
              `Schedule for ${schedule.course_code} - ${schedule.course_title} 
                has been successfully updated.`,
              'Close',
              { duration: 3000 }
            );
            this.schedulingService.resetCaches([CacheType.Schedules]);
            this.onInputChange({
              program: this.selectedProgram,
              yearLevel: this.selectedYear,
              section: this.selectedSection,
            }, true);
        });
      },
      error: (error) => {
        this.loadingScheduleId = null;
        this.handleError('Failed to fetch necessary data for editing schedule')(
          error
        );
      },
    });
  }

  openArchiveTemporaryCourseDialog(schedule: Schedule): void {
    if (schedule.temporary_course_offering_id == null) {
      this.snackBar.open('Temporary offering ID is missing.', 'Close', {
        duration: 3000,
      });
      return;
    }

    const offeringId = schedule.temporary_course_offering_id;

    const dialogRef = this.dialog.open(DialogGenericComponent, {
      data: {
        title: 'Archive Temporary Course',
        content: `Archive ${schedule.course_code} - ${schedule.course_title}? This will hide it from scheduling and preferences.`,
        actionText: 'Archive',
        cancelText: 'Cancel',
        action: 'archive',
      },
      autoFocus: true,
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result !== 'archive') {
        return;
      }

      this.schedulingService
        .archiveTemporaryCourseOffering(offeringId)
        .pipe(
          switchMap(() => {
            this.schedulingService.resetCaches([CacheType.Schedules]);
            const program = this.programOptions.find(
              (p) => p.display === this.selectedProgram
            );
            const section = this.sectionOptions.find(
              (s) => s.section_name === this.selectedSection
            );
            return program && section
              ? this.fetchCourses(
                  program.id,
                  this.selectedYear,
                  section.section_id,
                  true
                )
              : of([]);
          })
        )
        .subscribe({
          next: (updatedSchedules) => {
            this.schedules = updatedSchedules;
            this.cdr.detectChanges();
            this.snackBar.open('Temporary course archived successfully.', 'Close', {
              duration: 3000,
            });
          },
          error: this.handleError('Failed to archive temporary course'),
        });
    });
  }

  // ====================
  // Course Copy Methods
  // ====================

  addCourseCopy(element: Schedule): void {
    this.processingCourseId = element.section_course_id;
    this.schedulingService
      .duplicateCourse(element)
      .pipe(
        switchMap(() => {
          this.schedulingService.resetCaches([CacheType.Schedules]);
          return this.fetchCourses(
            this.programOptions.find((p) => p.display === this.selectedProgram)
              ?.id || 0,
            this.selectedYear,
            this.sectionOptions.find(
              (s) => s.section_name === this.selectedSection
            )?.section_id || 0,
            true
          );
        }),
        finalize(() => {
          this.processingCourseId = null;
        })
      )
      .subscribe({
        next: (updatedSchedules) => {
          this.schedules = updatedSchedules;
          this.cdr.detectChanges();

          // Find the updated count for the course
          const scheduleCount = this.getScheduleCount(element);
          const scheduleIndex = this.getOrdinalSuffix(scheduleCount);

          this.snackBar.open(
            `${scheduleIndex} schedule successfully added for ${element.course_code} - ${element.course_title}`,
            'Close',
            { duration: 3000 }
          );
        },
        error: (error) => {
          this.handleError('Failed to add course copy')(error);
        },
      });
  }

  removeCourseCopy(element: Schedule): void {
    const scheduleIndex = this.getScheduleIndex(element);
    const courseCode = element.course_code;
    const courseTitle = element.course_title;

    const dialogRef = this.dialog.open(DialogGenericComponent, {
      data: {
        title: `Remove ${this.getOrdinalSuffix(scheduleIndex)} schedule`,
        content: `Are you sure you want to remove the ${this.getOrdinalSuffix(
          scheduleIndex
        )} schedule for ${courseCode} - ${courseTitle}? This action cannot be undone.`,
        actionText: 'Remove',
        cancelText: 'Cancel',
        action: 'remove',
      },
      autoFocus: true,
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result === 'remove') {
        this.processingCourseId = element.section_course_id;
        this.schedulingService
          .removeDuplicateCourse(element.section_course_id)
          .pipe(
            tap(() => {
              this.schedulingService.resetCaches([CacheType.Schedules]);
            }),
            switchMap(() => {
              const program = this.programOptions.find(
                (p) => p.display === this.selectedProgram
              );
              const section = this.sectionOptions.find(
                (s) => s.section_name === this.selectedSection
              );
              return program && section
                ? this.fetchCourses(
                    program.id,
                    this.selectedYear,
                    section.section_id,
                    true
                  )
                : of([]);
            }),
            finalize(() => {
              this.processingCourseId = null;
            })
          )
          .subscribe({
            next: (updatedSchedules) => {
              this.schedules = updatedSchedules;
              this.cdr.detectChanges();

              this.snackBar.open(
                `${this.getOrdinalSuffix(
                  scheduleIndex
                )} schedule for ${courseCode} - ${courseTitle} removed successfully.`,
                'Close',
                { duration: 3000 }
              );
            },
            error: this.handleError('Failed to remove course copy'),
          });
      }
    });
  }

  // ====================
  // Helper Methods
  // ====================

  private handleError(message: string) {
    return (error: any): void => {
      console.error(error);
      const detail = error?.message ? ` ${error.message}` : '';
      this.snackBar.open(`${message}. Please try again.${detail}`, 'Close', {
        duration: 3000,
      });
    };
  }

  private mapSemesterNumberToLabel(semesterNumber: number): string {
    switch (semesterNumber) {
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

  private formatDateToYMD(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private generateTimeOptions() {
    const startHour = 7;
    const endHour = 21;

    for (let hour = startHour; hour < endHour; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const time = this.formatTime(hour, minute);
        this.timeOptions.push(time);
      }
    }
    this.timeOptions.push(this.formatTime(endHour, 0));
  }

  private formatTime(hour: number, minute: number): string {
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    const displayMinute =
      minute === 0 ? '00' : minute.toString().padStart(2, '0');
    return `${displayHour}:${displayMinute} ${period}`;
  }

  private formatTimeFromString(timeStr: string | null | undefined): string {
    if (!timeStr) {
      return 'Not set';
    }
    const [hourStr, minuteStr, _] = timeStr.split(':');
    const hour = parseInt(hourStr, 10);
    const minute = parseInt(minuteStr, 10);
    return this.formatTime(hour, minute);
  }

  private formatTimeFromBackend(timeStr: string): string {
    if (!timeStr) return 'Not set';
    const [hour, minute, second] = timeStr.split(':').map(Number);
    return this.formatTime(hour, minute);
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

  private getFormattedTime(startTime?: string, endTime?: string): string {
    if (!startTime && !endTime) {
      return 'Not set';
    }

    const formattedStartTime = startTime
      ? this.formatTimeFromString(startTime)
      : 'Not set';
    const formattedEndTime = endTime
      ? this.formatTimeFromString(endTime)
      : 'Not set';

    if (formattedStartTime === 'Not set' && formattedEndTime === 'Not set') {
      return 'Not set';
    } else if (formattedStartTime === 'Not set') {
      return formattedEndTime;
    } else if (formattedEndTime === 'Not set') {
      return formattedStartTime;
    }

    return `${formattedStartTime} - ${formattedEndTime}`;
  }

  protected get activeSemesterLabel(): string {
    return this.mapSemesterNumberToLabel(this.activeSemester);
  }

  protected hasCopies(element: Schedule): boolean {
    return (
      this.schedules.filter(
        (schedule) => schedule.course_code === element.course_code
      ).length > 1
    );
  }

  protected getOrdinalSuffix(i: number): string {
    const j = i % 10,
      k = i % 100;
    if (j === 1 && k !== 11) {
      return i + 'st';
    }
    if (j === 2 && k !== 12) {
      return i + 'nd';
    }
    if (j === 3 && k !== 13) {
      return i + 'rd';
    }
    return i + 'th';
  }

  protected getScheduleCount(element: Schedule): number {
    return this.schedules.filter(
      (schedule) => schedule.course_code === element.course_code
    ).length;
  }

  protected getScheduleIndex(element: Schedule): number {
    return (
      this.schedules
        .filter((schedule) => schedule.course_code === element.course_code)
        .findIndex((schedule) => schedule.schedule_id === element.schedule_id) +
      1
    );
  }

  protected isLastCopy(element: Schedule, currentIndex: number): boolean {
    if (currentIndex === this.schedules.length - 1) return true;
    const nextSchedule = this.schedules[currentIndex + 1];

    return (
      this.hasCopies(element) &&
      element.course_code !== nextSchedule.course_code
    );
  }

  protected getTemporaryBadgeText(element: Schedule): string {
    if (!element.is_temporary) {
      return ''; 
    }

    const type = this.formatTempValue(element.temporary_type);
    return type ? `Temporary ${type}` : 'Temporary';
  }

  protected get addButtonTooltip(): string {
    if (!this.selectedSection) {
      return 'Select a program, year level, and section first.';
    }
    if (!this.hasBridgingCourses) {
      return 'No bridging courses available for the selected program, year level and semester.';
    }
    return '';
  }

  protected getTemporaryTooltip(element: Schedule): string {
    if (!element.is_temporary) {
      return '';
    }

    const type = this.formatTempValue(element.temporary_type) || 'Temporary';
    const status = this.formatTempValue(element.temporary_status) || 'Unknown status';
    const petitionNote = element.petition_required ? 'Petition required' : 'No petition required';
    return `${type} · ${status} · ${petitionNote}`;
  }

  private formatTempValue(value?: string | null): string {
    if (!value) {
      return '';
    }

    return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
  }

  private shouldSkipDialog(): boolean {
    return localStorage.getItem(this.DIALOG_INFO_PREF_KEY) === 'true';
  }

  protected formatRoomForDisplay(room: string | null | undefined): string {
    return room && room !== 'Not set' ? room : 'TBA';
  }

  protected isRoomNotSet(room: string | null | undefined): boolean {
    return !room || room === 'Not set';
  }

  private setSkipDialogFlag(): void {
    localStorage.setItem(this.DIALOG_INFO_PREF_KEY, 'true');
  }
}

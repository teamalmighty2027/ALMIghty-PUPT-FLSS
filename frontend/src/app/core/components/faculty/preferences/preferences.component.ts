import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ViewChild, ElementRef, signal, computed, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

import { finalize, of, Subscription, Subject, debounceTime, distinctUntilChanged, startWith, tap, switchMap, firstValueFrom, throwError, catchError } from 'rxjs';

import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatMenuModule } from '@angular/material/menu';
import { MatRippleModule } from '@angular/material/core';

import { MatSymbolDirective } from '../../../imports/mat-symbol.directive';

import { DialogDayTimeComponent } from '../../../../shared/dialog-day-time/dialog-day-time.component';
import { DialogPrefComponent } from '../../../../shared/dialog-pref/dialog-pref.component';
import { DialogRequestAccessComponent } from '../../../../shared/dialog-request-access/dialog-request-access.component';
import { DialogGenericComponent } from '../../../../shared/dialog-generic/dialog-generic.component';
import { LoadingComponent } from '../../../../shared/loading/loading.component';

import { ThemeService } from '../../../services/theme/theme.service';
import { PreferencesService } from '../../../services/faculty/preference/preferences.service';
import { AuthService } from '../../../services/auth/auth.service';
import { Program, Course, PreferredDay, Section } from '../../../models/preferences.model';

import { fadeAnimation, cardEntranceAnimation, rowAdditionAnimation } from '../../../animations/animations';
import { DialogPrefSectionComponent } from '../../../../shared/dialog-pref-section/dialog-pref-section.component';
import { DialogImportHistoryComponent } from '../../../../shared/dialog-import-history/dialog-import-history.component';

interface TableData extends Course {
  preferredDays: PreferredDay[];
  isSubmitted: boolean;
  program_details: Program | undefined;
  year_section: String;
}

@Component({
  selector: 'app-preferences',
  imports: [
    CommonModule,
    FormsModule,
    LoadingComponent,
    MatSymbolDirective,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatTooltipModule,
    MatSnackBarModule,
    MatDialogModule,
    MatProgressSpinnerModule,
    MatMenuModule,
    MatRippleModule
],
  templateUrl: './preferences.component.html',
  styleUrls: ['./preferences.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [fadeAnimation, cardEntranceAnimation, rowAdditionAnimation],
})
export class PreferencesComponent implements OnInit, OnDestroy {
  // UI State
  isLoading = signal(true);
  searchState = signal<
    'programSelection' | 'courseSelection' | 'searchResults' | 'noResults'
  >('courseSelection');
  showCourseSelection = computed(
    () => this.searchState() === 'courseSelection',
  );
  showPossiblePrograms = signal(false);

  // Data
  academicYear = signal('');
  semesterLabel = signal('');
  programs = signal<Program[]>([]);
  courses = signal<Course[]>([]);
  possiblePrograms = signal<Program[]>([]);
  selectedProgram = signal<Program | undefined>(undefined);
  selectedYearLevel = signal<number | null>(null);  
  selectedCourse = signal<Course | null>(null);
  selectedSection = signal<Section | undefined>(undefined);

  // Temporary hardcoded year level as four
  dynamicYearLevels = computed(() =>
    this.selectedProgram() === undefined
      ? this.programs()[0]!.year_levels.map((yl) => yl.year_level)
      : this.selectedProgram()!.year_levels.map((yl) => yl.year_level),
  );
  
  // Faculty Info
  facultyId = signal<string>('');
  facultyName = signal<string>('');

  // Preferences Status
  isPreferencesEnabled = signal(true);
  hasRequest = signal(false);
  isSchedulesPublished = signal(false);
  activeSemesterId = signal<number | null>(null);
  semesterId = signal<number | null>(null);
  submissionDeadline = signal<Date | null>(null);

  // Search
  private searchQuerySubject = new Subject<string>();
  searchQuery = signal('');
  uniqueCourses = signal(new Map<string, Course>());
  filteredSearchResults = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const selectedProgram = this.selectedProgram();

    if (!query) return [];

    let coursesToFilter: Course[] = [];

    if (selectedProgram) {
      const programCoursesMap = new Map<string, Course>();
      this.populateUniqueCourses(selectedProgram, programCoursesMap);
      coursesToFilter = Array.from(programCoursesMap.values());
    } else {
      coursesToFilter = this.courses();
    }

    const filteredCourses = coursesToFilter.filter(
      (course) =>
        course.course_code.toLowerCase().includes(query) ||
        course.course_title.toLowerCase().includes(query),
    );

    const uniqueCoursesMap = new Map<string, Course>();
    filteredCourses.forEach((course) => {
      const key = this.getCourseListKey(course);
      if (!uniqueCoursesMap.has(key)) {
        uniqueCoursesMap.set(key, course);
      }
    });

    return Array.from(uniqueCoursesMap.values());
  });
  @ViewChild('searchInput') searchInput!: ElementRef;
   @ViewChild('tableContainer') tableContainer!: ElementRef<HTMLDivElement>;

  // Table Data
  allSelectedCourses = signal<TableData[]>([]);
  dataSource = computed(
    () => new MatTableDataSource(this.allSelectedCourses()),
  );
  isRemoving = signal<{ [course_code: string]: boolean }>({});
  displayedColumns: string[] = [
    'action',
    'program',
    'year_section',
    'course_code',
    'course_title',
    'lec_hours',
    'lab_hours',
    'units',
    'preferredDayTime',
  ];
  totalUnits = computed(() =>
    this.dataSource().data.reduce((total, course) => total + course.units, 0),
  );
  totalHours = computed(() =>
    this.dataSource().data.reduce(
      (total, course) =>
        total + (course.lec_hours || 0) + (course.lab_hours || 0),
      0,
    ),
  );

  private subscriptions = new Subscription();
  readonly daysOfWeek = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ];
  private isDarkTheme = signal<boolean>(false);

  constructor(
    private readonly themeService: ThemeService,
    private readonly dialog: MatDialog,
    private readonly preferencesService: PreferencesService,
    private readonly snackBar: MatSnackBar,
    private readonly authService: AuthService,
  ) {
    effect(() => {
      this.dataSource().data;
    });

    this.searchQuerySubject
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe((query) => {
        this.searchQuery.set(query);
        this.updateSearchState(query);
      });
  }

  ngOnInit() {
    this.subscribeToThemeChanges();
    this.setupSearchSubscription();
    this.loadInitialData();
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
    this.searchQuerySubject.complete();
  }

  /**
   * Theme Subscription
   */
  private subscribeToThemeChanges() {
    this.subscriptions.add(
      this.themeService.isDarkTheme$.subscribe((isDark) =>
        this.isDarkTheme.set(isDark),
      ),
    );
  }

  /**
   * Data Loading and Initialization
   */
  private loadInitialData() {
    this.isLoading.set(true);
    const facultyId = this.authService.getUserFacultyId();

    this.subscriptions.add(
      this.preferencesService
        .getPreferencesByFacultyId(facultyId)
        .pipe(
          tap((resp) => this.processPreferencesResponse(resp)),
          switchMap((resp) =>
            resp.preferences.is_enabled === 1
              ? this.preferencesService.getPrograms()
              : of(null),
          ),
          finalize(() => this.isLoading.set(false)),
        )
        .subscribe({
          next: (programsResponse) => {
            if (!programsResponse) return;

            const allCoursesMap = new Map<string, Course>();
            programsResponse.programs.forEach((program) =>
              this.populateUniqueCourses(program, allCoursesMap),
            );

            this.programs.set(programsResponse.programs);
            this.activeSemesterId.set(programsResponse.active_semester_id);
            this.semesterId.set(programsResponse.semester_id);
            this.courses.set([...allCoursesMap.values()]);
            
            // Sort courses alphabetically by course code for better UX
            this.courses.set(
              [...this.courses()].sort((a, b) =>
                a.course_code.localeCompare(b.course_code),
              ),
            );
          },
          error: (error) => this.handleDataLoadingError(error),
        }),
    );
  }

  /**
   * Prepare class properties based on preferencesResponse
   */
  private processPreferencesResponse(preferencesResponse: any) {
    const facultyPreference = preferencesResponse.preferences;
    if (facultyPreference) {
      this.facultyId.set(facultyPreference.faculty_id.toString());
      this.facultyName.set(facultyPreference.faculty_name);
      this.isPreferencesEnabled.set(facultyPreference.is_enabled === 1);
      this.hasRequest.set(facultyPreference.has_request === 1);
      this.isSchedulesPublished.set(
        facultyPreference.is_schedules_published === 1,
      );

      const activeSemester = facultyPreference.active_semesters[0];
      this.academicYear.set(activeSemester.academic_year);
      this.semesterLabel.set(activeSemester.semester_label);
      this.activeSemesterId.set(activeSemester.active_semester_id);

      this.allSelectedCourses.set(
        this.mapPreferencesToTableData(activeSemester.courses),
      );
    } else {
      this.isPreferencesEnabled.set(true);
      this.isSchedulesPublished.set(false);
    }
  }

  /**
   * Map API response to TableData format to reflect in the table
   */
  private mapPreferencesToTableData(courses: any[]): TableData[] {
    return courses.map((course) => ({
      course_id: course.course_details.course_id,
      course_assignment_id: course.course_assignment_id ?? null,
      course_code: course.course_details.course_code,
      temporary_course_offering_id: course.temporary_course_offering_id ?? null,
      course_title: course.course_details.course_title,
      lec_hours: course.lec_hours,
      lab_hours: course.lab_hours,
      units: course.units,
      year_level: course.course_details.year_level,
      section: {
        section_id: course.section_details?.section_id ?? null,
        section_name: course.section_details?.section_name ?? '',
      },
      preferredDays: course.preferred_days.map((prefDay: any) => ({
        day: prefDay.day,
        start_time: this.formatTimeForPayload(prefDay.start_time),
        end_time: this.formatTimeForPayload(prefDay.end_time),
      })),
      isSubmitted: true,
      pre_req: course.course_details.pre_req ?? null,
      co_req: course.course_details.co_req ?? null,
      tuition_hours: course.course_details.tuition_hours ?? 0,
      is_temporary: course.is_temporary ?? course.course_details?.is_temporary ?? false,
      temporary_type: course.temporary_type ?? course.course_details?.temporary_type ?? null,
      temporary_status: course.temporary_status ?? course.course_details?.temporary_status ?? null,
      petition_required: course.petition_required ?? course.course_details?.petition_required ?? null,
      program_details: course.program_details ?? undefined,
      year_section:  `${course.course_details.year_level}-${course.section_details?.section_name ?? ''}`
    }));
  }

  /**
   * Handle errors during data loading and show error messages to the user
   */
  private handleDataLoadingError(error: any) {
    const errorMessage = error.url.includes('/offered-courses-sem')
      ? 'Error loading programs.'
      : error.url.includes(`/get-preferences/`)
      ? 'Error loading preferences.'
      : 'An unexpected error occurred.';
    this.showSnackBar(errorMessage);
    this.isLoading.set(false);
  }

  /**
   * Program and Course Selection
   */
  public selectProgram(program: Program): void {
    this.selectedYearLevel.set(null);
    this.selectedProgram.set(program);
    this.searchState.set('courseSelection');
    this.uniqueCourses.set(new Map<string, Course>());
    this.populateUniqueCourses(program, this.uniqueCourses());
    this.clearSearch();
  }

  /**
   * Populate course selection sidebar with unique courses
   */
  private populateUniqueCourses(
    program: Program,
    coursesMap: Map<string, Course>,
  ): void {    
    program.year_levels.forEach((yearLevel) => {
      yearLevel.semester.courses.forEach((course) => {
        // Ensure course has year_level from the program structure
        course.year_level = yearLevel.year_level;
        const key = this.getCourseListKey(course);
        coursesMap.set(key, course);
      });
    });
  }

  /** 
   * Populate possible programs based on selected course
   */
  private async populatePossiblePrograms(course: Course): Promise<void> {
    const possiblePrograms: Program[] = [];
    this.selectedCourse.set(course);
    this.searchState.set('courseSelection');

    this.programs().forEach((program) => {
      const hasCourseInProgram = program.year_levels.some((yearLevel) =>
        yearLevel.semester.courses.some((c) =>
          this.isSameCourseOffering(c, course),
        ),
      );

      if (hasCourseInProgram) {
        possiblePrograms.push(program);
      }
    });

    if (possiblePrograms.length === 1) {
      await this.selectPossibleProgram(possiblePrograms[0]);
      return;
    }

    this.showPossiblePrograms.set(true);
    this.searchState.set('programSelection');
    this.possiblePrograms.set(possiblePrograms);
  }

  /** 
   * Event handler when user selects a program from possible programs list
   */
  public async selectPossibleProgram(program: Program): Promise<void> {
    this.selectedProgram.set(program);
    this.showPossiblePrograms.set(false);
    let courseAdded = false;

    for (const yearLevel of program.year_levels) {
      for (const course of yearLevel.semester.courses) {
        if (this.isSameCourseOffering(course, this.selectedCourse()!)) {
          this.selectedCourse.set(course);
          await this.addCourseToTable(course);
          courseAdded = true;
          break;
        }
      }

      if (courseAdded) {
        break;
      }
    }

    if (this.searchQuery() !== '') {
      this.searchState.set('searchResults');
    } else {
      this.searchState.set('courseSelection');
    }
  }

  /** 
  * Revert sidebar to course list and optionally clear year level filter
  */
  public backToCourseSelection(): void {
    this.selectedYearLevel.set(null);
    if (this.searchState() === 'courseSelection') {
      this.searchState.set('searchResults');
    } else {
      // Insert course list without program list iteration
      this.clearSearch();
    }
  }

  /**
   * Apply filter button to show courses based on selected year level
   */
  public filteredCourses = computed(() => {
    const yearLevel = this.selectedYearLevel();
    const program = this.selectedProgram();
    const courses = this.courses();

    if (!program) {
      if (yearLevel === null) {
        return courses;
      }
      return courses.filter((course) => course.year_level === yearLevel);
    }

    // Retain Program Selection Flow filter process
    if (yearLevel === null) {
      return Array.from(this.uniqueCourses().values());
    } else {
      const yearLevelData = program.year_levels.find(
        (yl) => yl.year_level === yearLevel,
      );
      return yearLevelData
        ? yearLevelData.semester.courses.filter((course) =>
            this.uniqueCourses().has(course.course_code),
          )
        : [];
    }
  });

  /**
   * Search Functionality
   */
  private setupSearchSubscription() {
    this.subscriptions.add(
      this.searchQuerySubject
        .pipe(startWith(''), debounceTime(300), distinctUntilChanged())
        .subscribe((query) => {
          this.searchQuery.set(query);

          if (query) {
            const results = this.filteredSearchResults();
            this.searchState.set(
              results.length > 0 ? 'searchResults' : 'noResults',
            );
          } else {
            this.searchState.set(
            'courseSelection'
            );
          }
        }),
    );
  }

  /**
   * Event handler for search input changes
   */
  public onSearchInput(query: string): void {
    this.searchQuerySubject.next(query);
    this.showPossiblePrograms.set(false);
  }

  private updateSearchState(query: string): void {
    if (query) {
      this.searchState.set(
        this.filteredSearchResults().length > 0 ? 'searchResults' : 'noResults',
      );
    } else {
      this.searchState.set(
        this.selectedProgram() ? 'courseSelection' : 'courseSelection',
      );
    }
  }

  /**
   * Clears search query and resets search state
   */
  public clearSearch(): void {
    this.showPossiblePrograms.set(false);
    this.selectedCourse.set(null);
    this.selectedProgram.set(undefined);
    this.searchQuerySubject.next('');
  }

  /**
   * Add course to the frontend table and tabledata
   */
  public async addCourseToTable(course: Course): Promise<void> {   
    // If no program is selected, populate possible programs
    if (this.selectedProgram() === undefined) {
      await this.populatePossiblePrograms(course);
      return;
    }

    // If program is selected, check if another section is selected
    const shouldProceed = await this.willSelectAnotherSection(course);
    if (!shouldProceed) return;

    // If another section is selected, set the section
    const section = this.selectedSection();
    if (section) {
      course.section = section;
    } else {
      this.showSnackBar('Please select a section for this course.');
      return;
    }

    // If course is already added, reset selections and show snackbar
    if (this.isCourseAlreadyAdded(course)) {
      this.selectedProgram.set(undefined);
      this.selectedSection.set(undefined);
      this.showSnackBar('You already selected this course.');
      return;
    }

    const preferredDays = this.daysOfWeek.map((day) => {
      const existing = course.preferred_days?.find((d) => d.day === day);
      return {
        day,
        start_time: existing?.start_time ?? '',
        end_time: existing?.end_time ?? '',
      };
    });

    const newCourse: TableData = {
      ...course,
      preferredDays,
      isSubmitted: !!course.preferred_days,
      program_details: this.selectedProgram(),
      year_section: `${course.year_level}-${course.section.section_name}`
    };

    // Reset selections after adding course to table
    this.selectedProgram.set(undefined);
    this.selectedCourse.set(null);
    this.selectedSection.set(undefined);
    this.allSelectedCourses.update((courses) => [...courses, newCourse]);
    this.showSnackBar(
      `${course.course_code} successfully added to your preferences.`,
    );

    // Make the table component instantly scroll to the newly added course
    setTimeout(() => {
      if (this.tableContainer) {
        this.tableContainer.nativeElement.scrollTop = this.tableContainer.nativeElement.scrollHeight;
      }
    }, 0);
  }

  /**
   * General function to remove a course based on isSubmitted attribute
   */
  public removeCourse(course: TableData): void {
    if (course.isSubmitted) {
      this.removeSubmittedCourse(course);
    } else {
      this.removeUnsubmittedCourse(course);
    }
  }

  /**
   * Remove course from table and send backend signal to delete preference.
   */
  private removeSubmittedCourse(course: TableData) {
    // Check if course has preferred days with time set
    const hasPreferredTime = course.preferredDays.some(
      (day) => day.start_time && day.end_time
    );

    if (hasPreferredTime) {
      // Show confirmation dialog for courses with preferred times
      const dialogRef = this.dialog.open(DialogGenericComponent, {
        data: {
          title: 'Remove Preference',
          content: `Are you sure you want to remove "${course.course_code}"? This action cannot be undone.`,
          actionText: 'Remove',
          cancelText: 'Cancel',
          action: 'Remove',
        },
        disableClose: true,
        panelClass: 'dialog-base',
        autoFocus: true,
      });

      dialogRef.afterClosed().subscribe((result) => {
        if (result === 'Remove') {
          this.proceedWithRemoval(course);
        }
      });
    } else {
      // No time set, proceed directly
      this.proceedWithRemoval(course);
    }
  }

  /**
   * Proceed with the actual removal of the preference
   */
  private proceedWithRemoval(course: TableData) {
    const preferenceId = this.getPreferenceId(course);
    const { section_id } = course.section;
    if (!this.facultyId() || !this.activeSemesterId()) {
      this.showSnackBar('Error: Missing faculty or semester information.');
      return;
    }

    if (!preferenceId) {
      this.showSnackBar('Error: Missing preference identifier.');
      return;
    }

    this.isRemoving.update((value) => ({
      ...value,
      [course.course_code]: true,
    }));

    this.preferencesService
      .deletePreference(
        preferenceId,
        this.facultyId()!,
        this.activeSemesterId()!,
        section_id ?? 0
      )
      .subscribe({
        next: () => {
          this.allSelectedCourses.update((courses) =>
            courses.filter((c) =>
              this.getSelectionKey(c) !== this.getSelectionKey(course),
            ),
          );
          this.isRemoving.update((value) => {
            const updatedValue = { ...value };
            delete updatedValue[course.course_code];
            return updatedValue;
          });
          this.showSnackBar(
            `${course.course_code} has been removed from your preferences.`,
          );
        },
        error: (error) => {
          const message =
            error.status === 403
              ? 'Submission is now closed. You cannot modify your preferences anymore.'
              : `Error removing ${course.course_code} from your preferences.`;
          this.showSnackBar(message);
          this.isRemoving.update((value) => ({
            ...value,
            [course.course_code]: false,
          }));
        },
      });
  }

  /**
   * Remove course from table
   */
  private removeUnsubmittedCourse(course: TableData) {
    this.allSelectedCourses.update((courses) =>
      courses.filter((c) =>
        this.getSelectionKey(c) !== this.getSelectionKey(course),
      ),
    );
  }

  /**
   * Checks if the course is already added based on course_id and section_name
   */
  private isCourseAlreadyAdded(course: Course): boolean {
    return this.allSelectedCourses().some((subject) =>
      this.getSelectionKey(subject) === this.getSelectionKey(course),
    );
  }

  /**
   * Asynchronous function that activates a dialog for section selection
   * if the course has multiple sections.
   */
  private async willSelectAnotherSection(course: Course): Promise<boolean> {  
    if (this.selectedSection() !== undefined) {
      return true;
    }
    const yearLevels = this.selectedProgram()?.year_levels;
    if (course.year_level == null) {
      return true;
    }

    const targetYear = yearLevels?.find(yl => yl.year_level === course.year_level);
    if (!targetYear) return true;

    // If only one or no section, set it and continue
    const maxSections = targetYear.sections?.length ?? 0;
    if (maxSections <= 1) {
      const firstSection = targetYear.sections[0];

      if (firstSection) {
        this.selectedSection.set(firstSection);
      }
      return true;
    }

    const dialogRef = this.dialog.open(DialogPrefSectionComponent, {
      width: 'min(600px, 90vw)',
      data: { 
        sections: targetYear.sections,
        programCode: this.selectedProgram()?.program_code ?? '',
        courseCode: course.course_code,
        courseTitle: course.course_title
      },
      autoFocus: true,
      panelClass: 'dialog-base',
    });

    const result = await firstValueFrom(dialogRef.afterClosed());
    if (result === undefined || result === null) {   
      this.selectedSection.set(undefined);
      this.selectedProgram.set(undefined);   
      return false;
    }

    this.selectedSection.set(result);

    return true;
  }


  /**
   * Dialog Management
   */
  public openDayTimeDialog(element: TableData): void {
    this.dialog
      .open(DialogDayTimeComponent, {
        data: {
          selectedDays: element.preferredDays,
          courseCode: element.course_code,
          courseTitle: element.course_title,
          facultyId: this.facultyId(),
          activeSemesterId: this.activeSemesterId(),
          courseAssignmentId: element.course_assignment_id,
          temporaryCourseOfferingId: element.temporary_course_offering_id ?? null,
          section_id: element.section.section_id,
          allSelectedCourses: this.allSelectedCourses(),
        },
        disableClose: true,
        autoFocus: true,
      })
      .afterClosed()
      .subscribe((result) => {
        if (result) {
          const courseIndex = this.allSelectedCourses().findIndex(
            (c) => this.getSelectionKey(c) === this.getSelectionKey(element),
          );

          if (courseIndex !== -1) {
            this.allSelectedCourses.set(
              this.allSelectedCourses().map((course, index) =>
                index === courseIndex
                  ? {
                      ...course,
                      preferredDays: result.days,
                      isSubmitted: true,
                    }
                  : course,
              ),
            );
          }
        }
      });
  }

  /**
   * Opens the preferences dialog in view-only mode
   */
  public openViewPreferencesDialog(): void {
    this.dialog.open(DialogPrefComponent, {
      maxWidth: '90vw',
      width: '100%',
      data: {
        facultyName: this.facultyName(),
        faculty_id: parseInt(this.facultyId()!, 10),
        isViewOnlyTable: true,
        isViewHistory: true,
        isAdmin: false,
      },
      disableClose: true,
      autoFocus: true,
    });
  }

  /**
   * Opens the import from history dialog
   */
  public openImportHistoryDialog(): void {
    const existingKeys = this.allSelectedCourses().map(c => this.getSelectionKey(c));

    this.dialog.open(DialogImportHistoryComponent, {
      maxWidth: '95vw',
      width: 'auto',
      data: {
        facultyId: parseInt(this.facultyId()!, 10),
        availableCourses: this.courses(),
        existingKeys: existingKeys,
        currentSemesterId: this.semesterId(),
        currentActiveSemesterId: this.activeSemesterId()
      },
      disableClose: false,
      autoFocus: true,
      panelClass: 'dialog-base',
    }).afterClosed()
      .subscribe((selectedCourses: Course[] | undefined) => {
        if (selectedCourses && selectedCourses.length > 0) {
          this.processBatchImport(selectedCourses);
        }
      });
  }

  /**
   * Process multiple courses imported from history
   */
  private async processBatchImport(courses: Course[]): Promise<void> {
    let sectionToAutoSelect: Section | undefined;

    for (const course of courses) {
      sectionToAutoSelect = undefined;
      // Try to find the program from previous data
      let program: Program | undefined;
      if (course.previousProgramCode) {
        program = this.programs().find(p => p.program_code === course.previousProgramCode);
      }

      // Fallback: If no match by code, but only one program offers this course, use it
      if (!program) {
        const possible = this.programs().filter(p => 
          p.year_levels.some(yl => yl.semester.courses.some(c => this.isSameCourseOffering(c, course)))
        );
        if (possible.length === 1) {
          program = possible[0];
        }
      }

      // If program found, set it and try to pre-select the section from previous data
      if (program) {
        this.selectedProgram.set(program);
        
        if (course.previousSectionName) {
          const targetYear = program.year_levels.find(yl => yl.year_level === course.year_level);
          sectionToAutoSelect = targetYear?.sections.find(s => s.section_name === course.previousSectionName);
          if (sectionToAutoSelect) {
            this.selectedSection.set(sectionToAutoSelect);
          }
        }
      }

      await this.addCourseToTable(course);

      // 4. Auto-submit to backend if it has preferred days and section
      if (course.preferred_days && course.preferred_days.length > 0 && sectionToAutoSelect) {
        const preferenceData: any = {
          faculty_id: parseInt(this.facultyId()),
          active_semester_id: this.activeSemesterId(),
          sections_per_program_year_id: sectionToAutoSelect.section_id,
          preferred_days: course.preferred_days.map((d: any) => ({
            day: d.day,
            start_time: d.start_time,
            end_time: d.end_time,
          })),
        };

        if (course.temporary_course_offering_id != null) {
          preferenceData.temporary_course_offering_id = course.temporary_course_offering_id;
        } else if (course.course_assignment_id != null) {
          preferenceData.course_assignment_id = course.course_assignment_id;
        }

        if (preferenceData.faculty_id && preferenceData.active_semester_id && preferenceData.sections_per_program_year_id) {
          try {
            await firstValueFrom(this.preferencesService.submitSinglePreference(preferenceData).pipe(
              catchError(err => {
                console.error('Error auto-submitting imported preference:', err);
                this.showSnackBar(`Failed to save ${course.course_code} to backend.`);
                return throwError(() => err);
              })
            ));
          } catch (e) {
            console.error(`Skipping ${course.course_code} due to error:`, e);
          }
        }
      }
    }
  }

  /**
   * Opens the request access dialog
   */
  public openRequestAccessDialog(): void {
    this.dialog
      .open(DialogRequestAccessComponent, {
        disableClose: true,
        data: {
          has_request: this.hasRequest(),
          facultyId: this.facultyId(),
        },
      })
      .afterClosed()
      .subscribe((result) => {
        if (result !== undefined) {
          this.hasRequest.set(result);

          if (this.facultyId()) {
            this.preferencesService
              .getPreferencesByFacultyId(this.facultyId()!)
              .subscribe({
                next: (resp) => {
                  if (resp?.preferences) {
                    this.hasRequest.set(resp.preferences.has_request === 1);
                  }
                },
                error: (error) => {
                  this.showSnackBar('Error refreshing preferences data.');
                },
              });
          }
        }
      });
  }

  /*
   * Utility Functions
   */

  private readonly SNACK_BAR_CONFIG = {
    duration: 3000,
    horizontalPosition: 'center' as const,
    verticalPosition: 'bottom' as const,
  };

  public formatTimeForPayload(time?: string | null): string {
    if (!time) return '';
    if (!time.includes('AM') && !time.includes('PM')) return time;

    const [timePart, modifier] = time.split(' ');
    let [hours, minutes] = timePart.split(':').map(Number);
    hours = (hours % 12) + (modifier === 'PM' ? 12 : 0);

    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:00`;
  }

  /**
   * Detects if the preferences represent "Any Day" or "Any Time" modifiers.
   */
  private detectAnyModifiers(element: TableData): { has_any_day: boolean; has_any_time: boolean } {
    const filteredDays = element.preferredDays.filter((pd) => pd.start_time && pd.end_time);
    const presentDays = filteredDays.map(pd => pd.day);

    // Check if all 7 days are present
    const has_any_day = this.daysOfWeek.every(day => presentDays.includes(day));

    // Check if all present days have the "Any Time" range (7 AM - 9 PM)
    const has_any_time = filteredDays.every(
      pd => pd.start_time === '07:00:00' && pd.end_time === '21:00:00'
    );

    return { has_any_day, has_any_time };
  }

  public formatSelectedDaysAndTime(element: TableData): string {
    const filteredDays = element.preferredDays
      .filter((pd) => pd.start_time && pd.end_time);

    if (filteredDays.length === 0) {
      return 'Click to select day and time';
    }

    const { has_any_day, has_any_time } = this.detectAnyModifiers(element);

    // If both "Any Day" and "Any Time" are enabled
    if (has_any_day && has_any_time) {
      return 'Any Day, Any Time';
    }

    // If only "Any Day" is enabled, show the time range once
    if (has_any_day) {
      const firstDay = filteredDays[0];
      const timeRange = `${this.formatTime(firstDay.start_time)} - ${this.formatTime(firstDay.end_time)}`;
      return `Any Day, ${timeRange}`;
    }

    // If only "Any Time" is enabled, show all specific days with "Any Time"
    if (has_any_time) {
      const daysString = filteredDays
        .sort((a, b) => this.daysOfWeek.indexOf(a.day) - this.daysOfWeek.indexOf(b.day))
        .map(pd => pd.day)
        .join(', ');
      return `${daysString}, Any Time`;
    }

    // Default: format each day individually with its time range
    const sortedDays = filteredDays
      .sort((a, b) => this.daysOfWeek.indexOf(a.day) - this.daysOfWeek.indexOf(b.day))
      .map(
        (pd) =>
          `${pd.day} (${this.formatTime(pd.start_time)} - ${this.formatTime(
            pd.end_time,
          )})`,
      )
      .join('\n');

    return sortedDays || 'Click to select day and time';
  }

  private formatTime(time: string): string {
    if (!time) return '';

    // If time is already in 12-hour format, return as is
    if (time.includes('AM') || time.includes('PM')) return time;

    // Convert 24-hour format to 12-hour format
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;

    return `${hour12}:${minutes} ${ampm}`;
  }

  private showSnackBar(message: string): void {
    this.snackBar.open(message, 'Close', this.SNACK_BAR_CONFIG);
  }

  public getTooltipText(element: TableData): string {
    return element.preferredDays.some((pd) => pd.start_time && pd.end_time)
      ? 'Click to modify schedule'
      : '';
  }

  public filterByYearLevel(year: number | null): void {
    this.selectedYearLevel.set(year);
    // Trigger recomputation of filtered courses
    this.filteredCourses(); 
  }
  public getTemporaryBadgeText(course: Course): string {
    if (!course.is_temporary) {
      return '';
    }

    const typeLabel = this.formatTemporaryType(course.temporary_type);
    return typeLabel ? `Temporary (${typeLabel})` : 'Temporary';
  }

  public getTemporaryTooltip(course: Course): string {
    if (!course.is_temporary) {
      return '';
    }

    const parts: string[] = [this.getTemporaryBadgeText(course)];
    if (course.temporary_status) {
      parts.push(`Status: ${this.formatTemporaryType(course.temporary_status)}`);
    }
    if (course.petition_required) {
      parts.push('Petition required');
    }
    return parts.join(' | ');
  }

  private formatTemporaryType(type?: string | null): string {
    if (!type) return '';
    return type
      .toString()
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  private isSameCourseOffering(candidate: Course, target: Course): boolean {
    if (target.temporary_course_offering_id) {
      return (
        candidate.temporary_course_offering_id ===
        target.temporary_course_offering_id
      );
    }

    return candidate.course_code === target.course_code;
  }

  private getCourseListKey(course: Course): string {
    if (course.temporary_course_offering_id) {
      return `temp-${course.temporary_course_offering_id}`;
    }

    return `course-${course.course_code.toLowerCase()}`;
  }

  private getSelectionKey(course: Course): string {
    const base = course.temporary_course_offering_id
      ? `temp-${course.temporary_course_offering_id}`
      : `course-${course.course_id}`;
    const sectionId = course.section?.section_id ?? 'none';
    return `${base}-section-${sectionId}`;
  }

  private getPreferenceId(course: Course): number | null {
    if (course.temporary_course_offering_id) {
      return course.temporary_course_offering_id;
    }

    return course.course_assignment_id ?? null;
  }
}

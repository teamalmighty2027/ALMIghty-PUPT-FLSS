import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ViewChild, ElementRef, signal, computed, effect, Injector } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';

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
import { HasUnsavedPreferences } from '../../../guards/unsaved-preferences.guard';

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
export class PreferencesComponent implements OnInit, OnDestroy, HasUnsavedPreferences {
  // UI State
  isLoading = signal(true);
  searchState = signal<
    'programSelection' | 'courseList' | 'searchResults' | 'noResults'
  >('programSelection');

  // True when the sidebar should show the program-picker cards
  showProgramSelection = computed(
    () => this.searchState() === 'programSelection',
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

  // Year levels derived from the currently selected program only
  dynamicYearLevels = computed(() =>
    this.selectedProgram()
      ? this.selectedProgram()!.year_levels.map((yl) => yl.year_level)
      : [],
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

  /**
   * Creates the component and wires the initial draft-saving search stream.
   *
   * @param themeService Theme stream used to track dark mode.
   * @param dialog Material dialog service used by the component.
   * @param preferencesService API service for preferences data.
   * @param snackBar Snackbar service used for user feedback.
   * @param authService Auth service used to resolve the faculty id.
   * @param route ActivatedRoute used to intercept query params for auto-import.
   * @param router Router used to clean up query params.
   */
  constructor(
    private readonly themeService: ThemeService,
    private readonly dialog: MatDialog,
    private readonly preferencesService: PreferencesService,
    private readonly snackBar: MatSnackBar,
    private readonly authService: AuthService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly injector: Injector
  ) {
    effect(() => {
      this.dataSource().data;
    });

    // Auto-save draft to localStorage on every change so refreshing the page
    // doesn't lose unsaved courses. Only saves when there are unsubmitted rows
    // and the faculty/semester IDs are already known.
    effect(() => {
      const courses = this.allSelectedCourses();
      const key = this.getDraftKey();
      if (!key) return;

      const unsaved = courses.filter((c) => !c.isSubmitted);
      if (unsaved.length > 0) {
        localStorage.setItem(key, JSON.stringify(unsaved));
      } else {
        // All rows submitted — no draft needed
        localStorage.removeItem(key);
      }
    });

    this.searchQuerySubject
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe((query) => {
        this.searchQuery.set(query);
        this.updateSearchState(query);
      });
  }

  /**
   * Initializes the component by wiring theme, search, and data loading
   * subscriptions.
   */
  ngOnInit() {
    this.subscribeToThemeChanges();
    this.setupSearchSubscription();
    this.loadInitialData();
    this.listenForAutoImport();
  }

  /**
   * Cleans up active subscriptions and completes the search stream.
   */
  ngOnDestroy() {
    this.subscriptions.unsubscribe();
    this.searchQuerySubject.complete();
  }

  /**
   * Listens for the 'action=auto_import' query parameter to trigger the bulk import.
   */
  private listenForAutoImport(): void {
    this.subscriptions.add(
      this.route.queryParams.subscribe((params) => {
        if (params['action'] === 'auto_import') {
          // Clean up the URL immediately so a manual page refresh doesn't re-trigger the import
          this.router.navigate([], {
            relativeTo: this.route,
            queryParams: { action: null },
            queryParamsHandling: 'merge',
          });
          
          // Wait for initial data (programs, semesterId) to load before executing
          if (this.programs().length > 0 && this.semesterId() !== null) {
              this.executeAutoImport();
          } else {
             // If data isn't loaded yet, set a one-time effect to trigger it once data arrives
              const stopEffect = effect(() => {
                if (this.programs().length > 0 && this.semesterId() !== null) {
                    this.executeAutoImport();
                    stopEffect.destroy();
                }
              }, { injector: this.injector });
          }
        }
      })
    );
  }

  /**
   * Executes the frontend-driven auto-import using existing history logic.
   */
  private executeAutoImport(): void {
    const facultyId = this.authService.getUserFacultyId();
    if (!facultyId || !this.semesterId()) return;

    this.isLoading.set(true);

    // Fetch the faculty's history using the existing service
    this.subscriptions.add(
      this.preferencesService.getPreferencesHistoryByFacultyId(facultyId).subscribe({
        next: (response) => {
          // 1. Filter out the current active semester
          const historicalYears = response.academic_years.filter((ay: any) => {
            const semestersArray = Object.values(ay.semesters);
            return semestersArray.some((s: any) => 
              s.semester_id === this.semesterId() &&
              s.active_semester_id !== this.activeSemesterId()
            );
          });

          if (historicalYears.length === 0) {
              this.showSnackBar('No past preferences found for this semester type to import.');
              this.isLoading.set(false);
              return;
          }

          // 2. Grab the most recent historical semester data
          const mostRecentYear = historicalYears[0];
          const semestersArray = Object.values(mostRecentYear.semesters);
          const targetSem = semestersArray.find((s: any) => s.semester_id === this.semesterId()) as any;
          const rawPreferences = targetSem?.preferences ?? [];

          if (rawPreferences.length === 0) {
              this.showSnackBar('No past preferences found to import.');
              this.isLoading.set(false);
              return;
          }

          // 3. Map the raw preferences to the Course format expected by processBatchImport
          const coursesToImport = this.mapHistoryToImportableCourses(rawPreferences);

          if (coursesToImport.length > 0) {
              // 4. Pass directly to the existing batch import logic
              this.processBatchImport(coursesToImport).then(() => {
                 this.showSnackBar('Your previous preferences were successfully imported!');
                 this.isLoading.set(false);
              });
          } else {
              this.showSnackBar('No valid courses could be matched for import.');
              this.isLoading.set(false);
          }
        },
        error: (err) => {
          console.error('Error fetching history for auto-import:', err);
          this.showSnackBar('Failed to load past preferences for import.');
          this.isLoading.set(false);
        }
      })
    );
  }

  /**
   * Maps raw history preferences to the Course objects required by processBatchImport.
   * Replicates the mapping logic found in DialogImportHistoryComponent.
   */
  private mapHistoryToImportableCourses(rawPreferences: any[]): Course[] {
    const programs = this.programs();
    const existingKeys = this.allSelectedCourses().map(c => this.getSelectionKey(c));
    const importable: Course[] = [];

    rawPreferences.forEach(pref => {
        if (pref.is_temporary) return;

        const histProgramCode = pref.course_details?.program_code;
        const histCourseCode = pref.course_details?.course_code;
        const histSectionName = pref.section_details?.section_name;

        const matchedProgram = programs.find(p => p.program_code === histProgramCode);
        let match: Course | undefined;

        if (matchedProgram) {
            // Try exact match
            for (const yl of matchedProgram.year_levels) {
                const found = yl.semester.courses.find(c => c.course_code === histCourseCode);
                if (found) {
                    const matchedSection = yl.sections?.find(s => s.section_name === histSectionName);
                    if (matchedSection) {
                        match = { ...found, year_level: yl.year_level, section: matchedSection };
                        break;
                    }
                }
            }
            // Fallback to course match only
            if (!match) {
                 for (const yl of matchedProgram.year_levels) {
                    const found = yl.semester.courses.find(c => c.course_code === histCourseCode);
                    if (found) {
                        match = { ...found, year_level: yl.year_level };
                        break;
                    }
                 }
            }
        }

        if (match) {
            // Attach the necessary previous data for processBatchImport to utilize
            const courseToAdd: any = {
                ...match,
                previousSectionName: histSectionName,
                previousProgramCode: histProgramCode,
                preferred_days: pref.preferred_days
            };

            // Prevent adding duplicates
            const key = this.getSelectionKey(match as Course, histProgramCode);
            if (!existingKeys.includes(key)) {
                importable.push(courseToAdd as Course);
            }
        }
    });

    return importable;
  }

  /**
   * Theme Subscription
   */
  /**
   * Subscribes to theme changes so the component can react to dark mode.
   */
  private subscribeToThemeChanges() {
    this.subscriptions.add(
      this.themeService.isDarkTheme$.subscribe((isDark) =>
        this.isDarkTheme.set(isDark),
      ),
    );
  }

  /**
   * Loads the faculty preferences and available programs for the current
   * faculty member.
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

            // Sort programs alphabetically; diploma programs go to the end
            const sortedPrograms = [...programsResponse.programs].sort(
              (a, b) => {
                const aIsDiploma = /diploma/i.test(a.program_code)
                  || /diploma/i.test(a.program_title);
                const bIsDiploma = /diploma/i.test(b.program_code)
                  || /diploma/i.test(b.program_title);

                if (aIsDiploma !== bIsDiploma) {
                  return aIsDiploma ? 1 : -1;
                }

                return a.program_code.localeCompare(b.program_code);
              },
            );
            this.programs.set(sortedPrograms);
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
   * Maps the preferences API response into component state.
   *
   * @param preferencesResponse Raw preferences response from the backend.
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

      // Restore any locally saved draft on top of submitted courses
      this.restoreDraft();
    } else {
      this.isPreferencesEnabled.set(true);
      this.isSchedulesPublished.set(false);
    }
  }

  /**
   * Converts preference courses from the API into table row data.
   *
   * @param courses Courses returned by the preferences API.
   * @returns Table-ready preference rows.
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
   * Handles preference-loading errors and shows a user-facing message.
   *
   * @param error Error returned by the data-loading pipeline.
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
   * Selects a program and transitions the sidebar to the course list.
   *
   * @param program Program chosen by the user.
   */
  public selectProgram(program: Program): void {
    this.selectedYearLevel.set(null);
    this.selectedProgram.set(program);
    this.searchState.set('courseList');
    this.uniqueCourses.set(new Map<string, Course>());
    this.populateUniqueCourses(program, this.uniqueCourses());
    this.clearSearch();
  }

  /**
   * Populates the course map with unique courses for a program.
   *
   * @param program Program whose courses should be indexed.
   * @param coursesMap Map used to store unique courses by identity key.
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
   * Finds all programs that offer the selected course.
   * Switches to the possible-programs picker if more than one program matches.
   *
   * @param course Course selected from the picker.
   */
  private async populatePossiblePrograms(course: Course): Promise<void> {
    const possiblePrograms: Program[] = [];
    this.selectedCourse.set(course);

    // Stay on courseList while we resolve; switch only if needed
    this.searchState.set('courseList');

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

    // Multiple programs: show possible-programs sidebar
    this.showPossiblePrograms.set(true);
    this.searchState.set('programSelection');
    this.possiblePrograms.set(possiblePrograms);
  }

  /**
   * Adds the selected bridging course from a chosen program, then returns
   * the sidebar to the course list.
   *
   * @param program Program selected from the possible-programs list.
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

    // After bridging selection, return sidebar to the course list
    if (this.searchQuery() !== '') {
      this.searchState.set('searchResults');
    } else {
      this.searchState.set('courseList');
    }
  }

  /**
   * Returns the sidebar to the top-level program selection list and resets
   * all selection state.
   */
  public backToProgramSelection(): void {
    this.selectedYearLevel.set(null);
    this.selectedProgram.set(undefined);
    this.showPossiblePrograms.set(false);
    this.selectedCourse.set(null);
    this.searchState.set('programSelection');
    this.clearSearch();
  }

  /**
   * Returns the visible course list filtered by year level.
   * Only shows courses when a program is already selected.
   */
  public filteredCourses = computed(() => {
    const yearLevel = this.selectedYearLevel();
    const program = this.selectedProgram();

    // No program selected: sidebar shows the program list, not courses
    if (!program) {
      return [];
    }

    // No year-level filter: show all unique courses for the program
    if (yearLevel === null) {
      return Array.from(this.uniqueCourses().values());
    }

    // Year-level filter active: return only that year's courses
    const yearLevelData = program.year_levels.find(
      (yl) => yl.year_level === yearLevel,
    );
    return yearLevelData
      ? yearLevelData.semester.courses.filter((course) =>
          this.uniqueCourses().has(this.getCourseListKey(course)),
        )
      : [];
  });

  /**
   * Keeps the search query stream synchronized with the search state.
   * Falls back to 'programSelection' or 'courseList' depending on whether
   * a program is already selected.
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
            // Return to program list or course list based on selection state
            this.searchState.set(
              this.selectedProgram() ? 'courseList' : 'programSelection',
            );
          }
        }),
    );
  }

  /**
   * Event handler for search input changes.
   * Blocks search when no program has been selected yet.
   *
   * @param query Search text entered by the user.
   */
  public onSearchInput(query: string): void {
    // Require a program to be selected before searching
    if (!this.selectedProgram()) {
      this.showSnackBar('Choose a program first!');
      return;
    }

    this.searchQuerySubject.next(query);
    this.showPossiblePrograms.set(false);
  }

  /**
   * Updates the visible search state from the current query.
   *
   * @param query Search text that should drive the state.
   */
  private updateSearchState(query: string): void {
    if (query) {
      this.searchState.set(
        this.filteredSearchResults().length > 0
          ? 'searchResults'
          : 'noResults',
      );
    } else {
      // Fall back to the appropriate default view
      this.searchState.set(
        this.selectedProgram() ? 'courseList' : 'programSelection',
      );
    }
  }

  /**
   * Clears the current search text and resets the UI state.
   * Does NOT reset the selected program so the user stays in the course list.
   */
  public clearSearch(): void {
    this.showPossiblePrograms.set(false);
    this.selectedCourse.set(null);
    this.searchQuerySubject.next('');
  }

  /**
   * Adds a course to the preferences table after validating section and
   * program selection.
   *
   * @param course Course selected from the picker or search results.
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

    // Ensure a section was resolved during willSelectAnotherSection
    const section = this.selectedSection();
    if (section) {
      course.section = section;
    } else {
      this.showSnackBar('Please select a section for this course.');
      return;
    }

    // Show snackbar and keep user in the current program's course list
    if (this.isCourseAlreadyAdded(course)) {
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

    // Keep the selected program so the user stays in the course list;
    // only reset section and the temporary course reference.
    this.selectedCourse.set(null);
    this.selectedSection.set(undefined);
    this.allSelectedCourses.update((courses) => [...courses, newCourse]);
    this.showSnackBar(
      `${course.course_code} successfully added to your preferences.`,
    );

    // Scroll the table to show the newly added course
    setTimeout(() => {
      if (this.tableContainer) {
        this.tableContainer.nativeElement.scrollTop =
          this.tableContainer.nativeElement.scrollHeight;
      }
    }, 0);
  }

  /**
   * Removes a course using the submitted or draft removal flow.
   *
   * @param course Course row to remove from the table.
   */
  public removeCourse(course: TableData): void {
    if (course.isSubmitted) {
      this.removeSubmittedCourse(course);
    } else {
      this.removeUnsubmittedCourse(course);
    }
  }

  /**
   * Removes a submitted preference, optionally showing a confirmation.
   *
   * @param course Submitted course row to remove.
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
   * Sends the delete request for a submitted preference.
   *
   * @param course Course row whose backend preference should be deleted.
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
   * Removes a draft course row from the local table only.
   *
   * @param course Draft course row to remove.
   */
  private removeUnsubmittedCourse(course: TableData) {
    this.allSelectedCourses.update((courses) =>
      courses.filter((c) =>
        this.getSelectionKey(c) !== this.getSelectionKey(course),
      ),
    );
  }

  /**
   * Checks whether the given course already exists in the table.
   *
   * @param course Course to compare against existing rows.
   * @return True when an equivalent course row is already present.
   */
  private isCourseAlreadyAdded(course: Course): boolean {
    return this.allSelectedCourses().some((subject) =>
      this.getSelectionKey(subject) === this.getSelectionKey(course),
    );
  }

  /**
   * Prompts the user to choose a section when a course can apply to more than
   * one section.
   *
   * @param course Course being added to the table.
   * @return True when the selection should continue.
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
      width: 'min(400px, 50vw)',
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
   * Opens the day and time picker for a selected course row.
   *
   * @param element Table row to edit.
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

            // If no more unsaved rows remain, clear any saved draft
            if (!this.hasUnsavedPreferences()) {
              const key = this.getDraftKey();
              if (key) localStorage.removeItem(key);
            }
          }
        }
      });
  }

  /**
   * Opens the read-only preferences dialog for the current faculty.
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
   * Opens the import-from-history dialog and processes selected courses.
   */
  public openImportHistoryDialog(): void {
    const existingKeys = this.allSelectedCourses().map(c => {
      const base = this.getCourseIdentityKey(c);
      const sectionId = c.section?.section_id ?? 'none';
      const programCode = (c as any).program_details?.program_code ?? null;
      const programPart = programCode ? `-program-${programCode}` : '';
      return `${base}${programPart}-section-${sectionId}`;
    });

    this.dialog.open(DialogImportHistoryComponent, {
      maxWidth: '95vw',
      width: 'auto',
      data: {
        facultyId: parseInt(this.facultyId()!, 10),
        programs: this.programs(),
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
   * Imports a batch of historical courses and auto-submits preferences when
   * enough data is available.
   *
   * @param courses Courses selected from the history dialog.
   */
  private async processBatchImport(courses: Course[]): Promise<void> {
    let sectionToAutoSelect: Section | undefined;

    for (const course of courses) {
      sectionToAutoSelect = undefined;

      // Try to find the program from previous data
      let program: Program | undefined;
      if (course.previousProgramCode) {
        program = this.programs().find(
          (p) => p.program_code === course.previousProgramCode
        );
      }

      // Fallback: If only one program offers this course, use it
      if (!program) {
        const possible = this.programs().filter((p) =>
          p.year_levels.some((yl) =>
            yl.semester.courses.some((c) =>
              this.isSameCourseOffering(c, course)
            )
          )
        );

        if (possible.length === 1) {
          program = possible[0];
        }
      }

      // Pre-select the section from previous data if available
      if (program) {
        this.selectedProgram.set(program);

        if (course.previousSectionName) {
          const targetYear = program.year_levels.find(
            (yl) => yl.year_level === course.year_level
          );

          sectionToAutoSelect = targetYear?.sections.find(
            (s) => s.section_name === course.previousSectionName
          );

          if (sectionToAutoSelect) {
            this.selectedSection.set(sectionToAutoSelect);
          } else if (targetYear) {
            const fallbackSection = targetYear.sections?.[0];
            const hasSingleFallback =
              (targetYear.sections?.length ?? 0) <= 1;

            if (hasSingleFallback && fallbackSection) {
              this.showSnackBar(
                `${course.course_code}: Section ` +
                `${course.previousSectionName} does not exist. ` +
                `Defaulted to ${fallbackSection.section_name}.`
              );
            } else {
              this.showSnackBar(
                `${course.course_code}: Section ` +
                `${course.previousSectionName} does not exist. ` +
                `Please select a section.`
              );
            }
          }
        }
      }

      const beforeCount = this.allSelectedCourses().length;
      await this.addCourseToTable(course);
      const wasAdded = this.allSelectedCourses().length > beforeCount;

      if (wasAdded) {
        let autoSubmitted = false;

        // Auto-submit to backend if it has preferred days and a section
        if (
          course.preferred_days &&
          course.preferred_days.length > 0 &&
          course.section
        ) {
          const preferenceData: any = {
            faculty_id: parseInt(this.facultyId()),
            active_semester_id: this.activeSemesterId(),
            sections_per_program_year_id: course.section.section_id,
            preferred_days: course.preferred_days.map((d: any) => ({
              day: d.day,
              start_time: d.start_time,
              end_time: d.end_time,
            })),
          };

          if (course.temporary_course_offering_id != null) {
            preferenceData.temporary_course_offering_id =
              course.temporary_course_offering_id;
          } else if (course.course_assignment_id != null) {
            preferenceData.course_assignment_id =
              course.course_assignment_id;
          }

          if (
            preferenceData.faculty_id &&
            preferenceData.active_semester_id &&
            preferenceData.sections_per_program_year_id
          ) {
            try {
              await firstValueFrom(
                this.preferencesService
                  .submitSinglePreference(preferenceData)
                  .pipe(
                    catchError((err) => {
                      console.error(
                        'Error auto-submitting imported preference:',
                        err
                      );
                      this.showSnackBar(
                        `Failed to save ${course.course_code} to backend.`
                      );
                      return throwError(() => err);
                    })
                  )
              );
              autoSubmitted = true;
            } catch (e) {
              console.error(
                `Skipping ${course.course_code} due to error:`,
                e
              );
            }
          }
        }

        // Sync the submission status in the UI table
        this.allSelectedCourses.update((coursesList) =>
          coursesList.map((c) => {
            if (this.getSelectionKey(c) === this.getSelectionKey(course)) {
              return { ...c, isSubmitted: autoSubmitted };
            }
            return c;
          })
        );
      }
    }
  }

  /**
   * Opens the access-request dialog and refreshes the request state.
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

  /**
   * Utility functions used by the preferences view.
   */

  private readonly SNACK_BAR_CONFIG = {
    duration: 3000,
    horizontalPosition: 'center' as const,
    verticalPosition: 'bottom' as const,
  };

  /**
   * Converts a display time into API payload format.
   *
   * @param time Time string entered or displayed in the UI.
   * @return Time in 24-hour payload format.
   */
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
   * Detects whether the selected days represent "Any Day" or "Any Time".
   *
   * @param element Table row whose preferred days should be analyzed.
   * @return Flags describing the current modifiers.
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

  /**
   * Formats the selected days and time range for display in the table.
   *
   * @param element Table row to format.
   * @return Human-readable day and time summary.
   */
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

  /**
   * Formats a time string for display in 12-hour clock notation.
   *
   * @param time Time string to format.
   * @return Display-friendly time string.
   */
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

  /**
   * Shows a short snackbar message to the user.
   *
   * @param message Message text to display.
   */
  private showSnackBar(message: string): void {
    this.snackBar.open(message, 'Close', this.SNACK_BAR_CONFIG);
  }

  /**
   * Returns the tooltip text for a preference schedule cell.
   *
   * @param element Table row being rendered.
   * @return Tooltip text or an empty string.
   */
  public getTooltipText(element: TableData): string {
    return element.preferredDays.some((pd) => pd.start_time && pd.end_time)
      ? 'Click to modify schedule'
      : '';
  }

  /**
   * Applies a year-level filter to the course list.
   *
   * @param year Year level to filter by, or null to clear the filter.
   */
  public filterByYearLevel(year: number | null): void {
    this.selectedYearLevel.set(year);
    // Trigger recomputation of filtered courses
    this.filteredCourses(); 
  }
  /**
   * Returns the label shown for a temporary course badge.
   *
   * @param course Course to inspect.
   * @return Badge text or an empty string.
   */
  public getTemporaryBadgeText(course: Course): string {
    if (!course.is_temporary) {
      return '';
    }

    const typeLabel = this.formatTemporaryType(course.temporary_type);
    return typeLabel ? `Temporary (${typeLabel})` : 'Temporary';
  }

  /**
   * Builds the tooltip text for a temporary course badge.
   *
   * @param course Course to inspect.
   * @return Tooltip text or an empty string.
   */
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

  /**
   * Formats a temporary course type for display.
   *
   * @param type Raw temporary type value.
   * @return Human-readable type label.
   */
  private formatTemporaryType(type?: string | null): string {
    if (!type) return '';
    return type
      .toString()
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  /**
   * Checks whether a course is a temporary bridging offering.
   *
   * @param course Course to inspect.
   * @return True when the course is a temporary bridging course.
   */
  private isBridgingTemporaryCourse(course: Course): boolean {
    return course.is_temporary === true && course.temporary_type === 'bridging';
  }

  /**
   * Returns the identity key used for deduping course options.
   *
   * @param course Course to identify.
   * @return Stable identity key for grouping and selection.
   */
  private getCourseIdentityKey(course: Course): string {
    if (this.isBridgingTemporaryCourse(course)) {
      return `bridging-${course.course_code.toLowerCase()}`;
    }

    if (course.temporary_course_offering_id) {
      return `temp-${course.temporary_course_offering_id}`;
    }

    return `course-${course.course_code.toLowerCase()}`;
  }

  /**
   * Compares two course records to determine whether they represent the same
   * course offering.
   *
   * @param candidate Course record being compared.
   * @param target Course record used as the comparison target.
   * @return True when both records represent the same offering.
   */
  private isSameCourseOffering(candidate: Course, target: Course): boolean {
    if (
      this.isBridgingTemporaryCourse(candidate) ||
      this.isBridgingTemporaryCourse(target)
    ) {
      return candidate.course_code === target.course_code;
    }

    if (target.temporary_course_offering_id) {
      return (
        candidate.temporary_course_offering_id ===
        target.temporary_course_offering_id
      );
    }

    return candidate.course_code === target.course_code;
  }

  /**
   * Builds the key used to dedupe courses in the picker list.
   *
   * @param course Course to key.
   * @return Unique list key for the course.
   */
  private getCourseListKey(course: Course): string {
    return this.getCourseIdentityKey(course);
  }

  /**
   * Builds the key used to identify a selected course row.
   *
   * @param course Course row to key.
   * @param programCode Optional program code to scope the key.
   * @return Unique selection key for the row.
   */
  private getSelectionKey(course: Course, programCode?: string | null): string {
    const base = this.getCourseIdentityKey(course);
    const sectionId = course.section?.section_id ?? 'none';
    const programPart = programCode ? `-program-${programCode}` : '';
    return `${base}${programPart}-section-${sectionId}`;
  }

  /**
   * Resolves the backend preference identifier for a row.
   *
   * @param course Course row to inspect.
   * @return Preference identifier or null.
   */
  private getPreferenceId(course: Course): number | null {
    if (course.temporary_course_offering_id) {
      return course.temporary_course_offering_id;
    }

    return course.course_assignment_id ?? null;
  }

  /**
   * Returns true when there are courses in the table that have not been
   * submitted to the backend yet (draft rows). Used by the CanDeactivate guard.
   */
  /**
   * Indicates whether the table contains unsubmitted draft rows.
   *
   * @return True when at least one draft row exists.
   */
  hasUnsavedPreferences(): boolean {
    return this.allSelectedCourses().some((c) => !c.isSubmitted);
  }

  /**
   * Persists the current unsubmitted courses to localStorage so the faculty
   * can continue later. Key is scoped to the faculty + semester so drafts
   * don't bleed across semesters.
   */
  /**
   * Stores unsubmitted preference rows in localStorage.
   */
  saveDraft(): void {
    const key = this.getDraftKey();
    if (!key) return;
    const draftCourses = this.allSelectedCourses().filter((c) => !c.isSubmitted);
    localStorage.setItem(key, JSON.stringify(draftCourses));
  }

  /**
   * Explicitly removes the draft from localStorage.
   * Called when the faculty chooses "Discard & Leave" so the auto-saved
   * draft doesn't get restored on the next visit.
   */
  /**
   * Removes the saved draft for the current faculty and semester.
   */
  discardDraft(): void {
    const key = this.getDraftKey();
    if (key) localStorage.removeItem(key);
  }

  /**
   * Restores a previously saved draft from localStorage and merges it with
   * any already-submitted courses already loaded from the backend.
   */
  /**
   * Restores saved draft rows and merges them with loaded preferences.
   */
  private restoreDraft(): void {
    const key = this.getDraftKey();
    if (!key) return;

    const raw = localStorage.getItem(key);
    if (!raw) return;

    try {
      const draftCourses: TableData[] = JSON.parse(raw);
      if (!draftCourses?.length) return;

      // Merge: keep submitted courses from backend, add draft ones on top
      const existingKeys = new Set(
        this.allSelectedCourses().map((c) => this.getSelectionKey(c))
      );

      const newDraftCourses = draftCourses.filter(
        (c) => !existingKeys.has(this.getSelectionKey(c))
      );

      if (newDraftCourses.length > 0) {
        this.allSelectedCourses.update((current) => [
          ...current,
          ...newDraftCourses,
        ]);
        this.showSnackBar(
          `Draft restored: ${newDraftCourses.length} course${newDraftCourses.length > 1 ? 's' : ''} added from your saved draft.`
        );
      }

      // Clear draft after restoring so it doesn't re-appear on next load
      localStorage.removeItem(key);
    } catch {
      localStorage.removeItem(key);
    }
  }

  /**
   * Builds a localStorage key scoped to this faculty + active semester.
   */
  /**
   * Builds the storage key used for the current faculty draft.
   *
   * @return Draft storage key or null when the scope is unavailable.
   */
  private getDraftKey(): string | null {
    const facultyId = this.facultyId();
    const semesterId = this.activeSemesterId();
    if (!facultyId || !semesterId) return null;
    return `pref_draft_${facultyId}_${semesterId}`;
  }
}
import { Component, OnInit, ViewChild, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { BehaviorSubject, Subject, Subscription } from 'rxjs';
import { filter, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';

import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatSlideToggleModule, MatSlideToggleChange } from '@angular/material/slide-toggle';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { MatSymbolDirective } from '../../../imports/mat-symbol.directive';

import { InputField } from '../../../../shared/table-header/table-header.component';
import { ReportsHeaderComponent } from '../../../../shared/reports-header/reports-header.component';
import { LoadingComponent } from '../../../../shared/loading/loading.component';
import { DialogPrefComponent } from '../../../../shared/dialog-pref/dialog-pref.component';
import { DialogExportComponent } from '../../../../shared/dialog-export/dialog-export.component';
import { DialogTogglePreferencesComponent, DialogTogglePreferencesData } from '../../../../shared/dialog-toggle-preferences/dialog-toggle-preferences.component';

import { PreferencesService } from '../../../services/faculty/preference/preferences.service';
import { ReportHeaderService } from '../../../services/report-header/report-header.service';
import { ReportsService } from '../../../services/admin/reports/reports.service';
import { ActiveSemester } from '../../../models/preferences.model';

import { fadeAnimation } from '../../../animations/animations';

import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

interface Faculty {
  faculty_id: number;
  facultyName: string;
  facultyCode: string;
  facultyType: string;
  facultyUnits: number;
  is_enabled: boolean;
  has_request: number;
  active_semesters?: ActiveSemester[];
}

interface ToggleState {
  isGlobalDisabled: boolean;
  isIndividualDisabled: boolean;
  globalTooltip: string;
  individualTooltip: string;
}

@Component({
  selector: 'app-manage-preferences',
  imports: [
    CommonModule,
    ReportsHeaderComponent,
    LoadingComponent,
    FormsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    MatPaginatorModule,
    MatTooltipModule,
    MatSnackBarModule,
    MatSymbolDirective,
  ],
  templateUrl: './manage-preferences.component.html',
  styleUrls: ['./manage-preferences.component.scss'],
  animations: [fadeAnimation],
})
export class ManagePreferencesComponent implements OnInit, OnDestroy {
  private readonly baseDisplayedColumns: string[] = [
    'index',
    'facultyName',
    'facultyCode',
    'facultyType',
    'action',
    'requests',
  ];

  inputFields: InputField[] = [
    {
      type: 'text',
      label: 'Search Faculty',
      key: 'searchFaculty',
    },
  ];

  displayedColumns: string[] = [...this.baseDisplayedColumns, 'toggle'];

  dataSource = new MatTableDataSource<Faculty>([]);
  allData: Faculty[] = [];
  filteredData: Faculty[] = [];
  currentFilter = '';

  isToggleAllChecked = false;
  isAnyIndividualToggleOn = false;
  isEnabled!: boolean;
  isGlobalStartDateSet = false;
  isIndividualStartDateSet = false;

  isLoading = new BehaviorSubject<boolean>(true);

  selectedTermId: number | null = null;
  private activeTermId: number | null = null;
  showPreferenceToggleColumn = true;
  exportButtonsDisabled = true;
  exportTooltipMessage = '';
  private prefsSub?: Subscription;

  hasAnyPreferences = false;
  hasIndividualDeadlines = false;
  facultyScheduledState = new Map<number, boolean>();

  private searchSubject = new Subject<string>();
  paginator?: MatPaginator;

  @ViewChild(MatPaginator)
  set matPaginator(p: MatPaginator | undefined) {
    this.paginator = p;
    if (p) {
      this.dataSource.paginator = p;
    }
  }

  private destroy$ = new Subject<void>();

  constructor(
    private preferencesService: PreferencesService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private cdr: ChangeDetectorRef,
    private reportHeaderService: ReportHeaderService,
    private reportsService: ReportsService
  ) {}

  ngOnInit(): void {
    this.preferencesService.clearPreferencesCache();

    this.loadTerms(); 
    this.setupFilterPredicate();
    
    this.searchSubject
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((searchValue) => {
        this.applyFilter(searchValue);
      });
  }

  /**
   * Lifecycle hook called when the component is destroyed.
   * Cleans up the internal destroy subject to avoid memory leaks
   * and allow observables to complete.
   */
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Loads academic terms for the term dropdown and initializes the
   * selected term. Sets the active term id and triggers loading
   * of faculty preferences for the chosen term.
   */
  loadTerms(): void {
    this.reportsService.getAllTermsForDropdown().subscribe({
      next: (data) => {
        const activeTerm = data.find((term: any) => term.is_active === 1);

        this.activeTermId = activeTerm?.active_semester_id ?? null;

        if (this.selectedTermId === null) {
          this.selectedTermId = this.activeTermId;
        }

        this.syncSelectedTermState(this.selectedTermId);
        
        this.loadFacultyPreferences(this.selectedTermId);
      },
      error: (error) => {
        console.error('Error loading terms:', error);
      }
    });
  }

  /**
   * Handler invoked when the user selects a different term.
   * Forces a reload of faculty preferences for the provided term.
   * @param termId The newly selected term id, or null.
   */
  onTermChange(termId: number | null): void {
    // Force the reload even if angular's two-way binding beat us to it
    if (termId !== null) {
      this.syncSelectedTermState(termId);
      this.preferencesService.clearPreferencesCache();
      this.loadFacultyPreferences(termId);
    }
  }

  /**
   * Synchronizes internal component state with the provided term id.
   * Updates visibility of the preference toggle column and export
   * button state accordingly.
   * @param termId The term id to sync into component state.
   */
  private syncSelectedTermState(termId: number | null): void {
    this.selectedTermId = termId;
    this.showPreferenceToggleColumn =
      termId !== null && termId === this.activeTermId;
    this.updateDisplayedColumns();
    this.updateExportButtonState();
  }

  /**
   * Recomputes the `displayedColumns` array based on whether the
   * preference toggle column should be visible.
   */
  private updateDisplayedColumns(): void {
    this.displayedColumns = this.showPreferenceToggleColumn
      ? [...this.baseDisplayedColumns, 'toggle']
      : [...this.baseDisplayedColumns];
  }

  /**
   * Updates export button enabled/disabled state and tooltip message.
   * Disables export when there are no preferences or when submission
   * is currently open (global or individual toggles active).
   */
  private updateExportButtonState(): void {
    const exportBlockedBySubmission =
      this.showPreferenceToggleColumn &&
      (this.isToggleAllChecked || this.isAnyIndividualToggleOn);

    this.exportButtonsDisabled =
      !this.hasAnyPreferences || exportBlockedBySubmission;

    if (!this.hasAnyPreferences) {
      this.exportTooltipMessage = 'No faculty preferences available for export';
      return;
    }

    this.exportTooltipMessage = exportBlockedBySubmission
      ? 'Preferences submission is open; export disabled'
      : '';
  }

  /**
   * Sets the table filter predicate used to match faculty rows
   * against the user's search text.
   */
  private setupFilterPredicate(): void {
    this.dataSource.filterPredicate = (data: Faculty, filter: string) => {
      return (
        data.facultyName.toLowerCase().includes(filter) ||
        data.facultyCode.toLowerCase().includes(filter) ||
        data.facultyType.toLowerCase().includes(filter)
      );
    };
  }

  /**
   * Loads faculty preferences for the specified term and updates
   * the component's data structures and UI state.
   * @param termId Optional term id to scope the preferences request.
   */
  loadFacultyPreferences(termId?: number | null): void {
    this.isLoading.next(true);

    if (this.prefsSub) {
      this.prefsSub.unsubscribe();
    }

    this.prefsSub = this.preferencesService
      .getPreferences(termId, true)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (!response || !response.preferences) {
            this.handleEmptyData();
            return;
          }

          const faculties = response.preferences.map((faculty: any) => ({
            faculty_id: faculty.faculty_id,
            facultyName: faculty.faculty_name,
            facultyCode: faculty.faculty_code,
            facultyType: faculty.faculty_type,
            facultyUnits: faculty.faculty_units,
            has_request: faculty.has_request,
            is_enabled: faculty.is_enabled === 1,
            active_semesters: faculty.active_semesters,
          }));

          this.allData = faculties;
          this.filteredData = faculties;
          this.applyFilter(this.currentFilter);
          this.checkToggleAllState();
          this.updateHasAnyPreferences();
          this.updateIndividualDeadlinesState();
          this.checkGlobalStartDate();
          this.checkIndividualStartDate();
          this.initializeScheduledFacultyState();
          this.updateExportButtonState();
          this.isLoading.next(false);
        },
        error: (error) => {
          console.error('Error loading faculty preferences:', error);
          this.snackBar.open(
            'Error loading faculty preferences. Please try again.',
            'Close',
            { duration: 3000 },
          );
          this.handleEmptyData();
        }
      });
  }

  /**
   * Normalizes component state when no preference data is available.
   * Clears data arrays, updates derived states, and stops the loader.
   */
  private handleEmptyData(): void {
    this.allData = [];
    this.filteredData = [];
    this.dataSource.data = [];
    this.checkToggleAllState();
    this.updateHasAnyPreferences();
    this.updateExportButtonState();
    this.isLoading.next(false);
  }

  /**
   * Applies a text filter to the faculty list and updates the table.
   * @param filterValue Raw filter string entered by the user.
   */
  applyFilter(filterValue: string): void {
    this.currentFilter = filterValue.trim().toLowerCase();

    if (this.currentFilter === '') {
      this.filteredData = [...this.allData];
    } else {
      this.filteredData = this.allData.filter((faculty) =>
        this.filterPredicate(faculty, this.currentFilter),
      );
    }

    this.dataSource.data = this.filteredData;
    this.checkToggleAllState();
    this.updateExportButtonState();

    if (this.paginator) {
      this.paginator.firstPage();
    }
  }

  /**
   * Predicate to determine whether a faculty row matches the filter.
   * @param data Faculty row to test.
   * @param filter Normalized filter string.
   */
  filterPredicate(data: Faculty, filter: string): boolean {
    return (
      data.facultyName.toLowerCase().includes(filter) ||
      data.facultyCode.toLowerCase().includes(filter) ||
      data.facultyType.toLowerCase().includes(filter)
    );
  }

  /**
   * Updates the table data source with the current filtered data.
   */
  updateDisplayedData(): void {
    this.dataSource.data = [...this.filteredData];
  }

  /**
   * Receives input changes from the header component and forwards
   * the search text into the debounced search subject.
   * @param inputValues Object map of input keys to values.
   */
  onInputChange(inputValues: { [key: string]: any }): void {
    const searchValue = inputValues['searchFaculty'] || '';
    this.searchSubject.next(searchValue);
  }

  /**
   * Computes the state of the global "toggle all" control and
   * whether any individual toggles are active in the filtered set.
   */
  checkToggleAllState(): void {
    const allEnabled = this.filteredData.every((faculty) => faculty.is_enabled);
    const isGlobalDeadlineSet = this.allData.some((faculty) =>
      faculty.active_semesters?.some(
        (semester) => semester.global_deadline !== null,
      ),
    );

    this.isToggleAllChecked = allEnabled && isGlobalDeadlineSet;

    this.isAnyIndividualToggleOn = this.filteredData.some(
      (faculty) => faculty.is_enabled,
    );

    this.isEnabled = allEnabled;
  }

  /**
   * Detects whether a global start date has been set for any faculty.
   */
  checkGlobalStartDate(): void {
    this.isGlobalStartDateSet = this.allData.some((faculty) =>
      faculty.active_semesters?.some(
        (semester) => semester.global_start_date !== null,
      ),
    );
  }

  /**
   * Detects whether any individual start dates have been configured.
   */
  checkIndividualStartDate(): void {
    this.isIndividualStartDateSet = this.allData.some((faculty) =>
      faculty.active_semesters?.some(
        (semester) => semester.individual_start_date !== null,
      ),
    );
  }

  /**
   * Updates `hasAnyPreferences` to indicate whether any faculty
   * have submitted preferences in the loaded data.
   */
  updateHasAnyPreferences(): void {
    this.hasAnyPreferences = this.allData.some((faculty) =>
      this.hasSubmittedPreferences(faculty),
    );
  }

  /**
   * Returns true if the given faculty has any valid submitted
   * preference courses for their active semester.
   * @param faculty Faculty object to inspect.
   */
  hasSubmittedPreferences(faculty: Faculty): boolean {
    if (!faculty || !faculty.active_semesters || faculty.active_semesters.length === 0) return false;
    
    const activeSemester = faculty.active_semesters[0];
    if (!activeSemester.courses || !Array.isArray(activeSemester.courses)) return false;

    // Filter out completely empty rows/objects that might get returned by the database
    const validCourses = activeSemester.courses.filter((c: any) => 
        (c.course_details && c.course_details.course_code) || 
        c.course_assignment_id || 
        c.temporary_course_offering_id
    );

    return validCourses.length > 0;
  }

  /**
   * Updates `hasIndividualDeadlines` based on whether any faculty
   * have individual deadlines that differ from global deadlines.
   */
  updateIndividualDeadlinesState(): void {
    this.hasIndividualDeadlines = this.allData.some((faculty) =>
      faculty.active_semesters?.some(
        (semester) =>
          semester.individual_deadline &&
          (!semester.global_deadline ||
            new Date(semester.individual_deadline) !==
              new Date(semester.global_deadline)),
      ),
    );
  }

  /**
   * Returns true if any faculty have a global start date or deadline
   * configured for their active semester.
   */
  isGloballyScheduled(): boolean {
    return this.allData.some((faculty) =>
      faculty.active_semesters?.some(
        (semester) =>
          semester.global_start_date !== null ||
          semester.global_deadline !== null,
      ),
    );
  }

  /**
   * Returns whether the provided faculty is individually scheduled.
   * @param faculty Optional faculty to check; returns false when omitted.
   */
  isIndividuallyScheduled(faculty?: Faculty): boolean {
    if (!faculty) return false;
    return this.facultyScheduledState.get(faculty.faculty_id) ?? false;
  }

  /**
   * Initializes the internal map that tracks whether each faculty
   * is individually scheduled based on their active semester data.
   */
  initializeScheduledFacultyState(): void {
    this.allData.forEach((faculty: Faculty) => {
      this.facultyScheduledState.set(
        faculty.faculty_id,
        this.calculateIsIndividuallyScheduled(faculty),
      );
    });
  }

  /**
   * Determines whether the given faculty has any individual start
   * date or deadline configured.
   * @param faculty Faculty to check.
   */
  calculateIsIndividuallyScheduled(faculty: Faculty): boolean {
    return (
      faculty.active_semesters?.some(
        (semester) =>
          semester.individual_start_date !== null ||
          semester.individual_deadline !== null,
      ) ?? false
    );
  }

  /**
   * Handles the global "toggle all" preferences action.
   * Opens a confirmation dialog and applies the new enabled/disabled
   * state to the filtered faculties when confirmed.
   * @param event The originating toggle change event or MouseEvent.
   * @param isScheduledClick True when invoked programmatically by a scheduler.
   */
  onToggleAllPreferences(
    event: MatSlideToggleChange | MouseEvent,
    isScheduledClick = false,
  ): void {
    if (!isScheduledClick && event instanceof MatSlideToggleChange) {
      event.source.checked = this.isToggleAllChecked;
    }

    const activeSemesterFaculty = this.allData.find(
      (faculty) => faculty.active_semesters?.length,
    );

    const activeSemester = activeSemesterFaculty?.active_semesters?.[0];

    const existingDeadline = activeSemester?.global_deadline
      ? new Date(activeSemester.global_deadline)
      : null;

    const existingStartDate = activeSemester?.global_start_date
      ? new Date(activeSemester.global_start_date)
      : null;

    const hasIndividualDeadlines = this.hasIndividualDeadlines;

    const dialogData: DialogTogglePreferencesData = {
      type: 'all_preferences',
      academicYear: activeSemester?.academic_year || '',
      semester: activeSemester?.semester_label || '',
      currentState: this.isToggleAllChecked,
      global_deadline: existingDeadline,
      global_start_date: existingStartDate,
      hasIndividualDeadlines: hasIndividualDeadlines,
    };

    const dialogRef = this.dialog.open(DialogTogglePreferencesComponent, {
      data: dialogData,
      disableClose: true,
      autoFocus: true,
    });

    dialogRef.afterClosed().subscribe((confirmed: boolean) => {
      if (confirmed && !isScheduledClick) {
        const newStatus = this.isToggleAllChecked;
        this.filteredData.forEach(
          (faculty) => (faculty.is_enabled = newStatus),
        );
        this.isToggleAllChecked = newStatus;
        this.updateDisplayedData();
        this.updateExportButtonState();
        this.cdr.markForCheck();
      }
    });
  }

  /**
   * Handles toggling preferences for a single faculty.
   * Opens a confirmation dialog and refreshes the faculty data
   * from the server when the action is confirmed.
   * @param faculty The faculty being toggled.
   * @param event The originating slide toggle or mouse event.
   * @param isScheduledClick True when invoked programmatically.
   */
  onToggleSinglePreferences(
    faculty: Faculty,
    event: MatSlideToggleChange | MouseEvent,
    isScheduledClick = false,
  ): void {
    if (!isScheduledClick && event instanceof MatSlideToggleChange) {
      event.source.checked = faculty.is_enabled;
    }

    const activeSemester = faculty.active_semesters?.[0];
    const existingStartDate =
      activeSemester?.individual_start_date ||
      activeSemester?.global_start_date ||
      null;
    const existingDeadline =
      activeSemester?.individual_deadline ||
      activeSemester?.global_deadline ||
      null;

    const dialogData: DialogTogglePreferencesData = {
      type: 'single_preferences',
      academicYear: activeSemester?.academic_year || '',
      semester: activeSemester?.semester_label || '',
      currentState: faculty.is_enabled,
      facultyName: faculty.facultyName,
      faculty_id: faculty.faculty_id,
      individual_start_date: existingStartDate,
      individual_deadline: existingDeadline,
    };

    const dialogRef = this.dialog.open(DialogTogglePreferencesComponent, {
      data: dialogData,
      disableClose: true,
      autoFocus: true,
    });

    dialogRef.afterClosed().subscribe((confirmed: boolean) => {
      if (confirmed && !isScheduledClick) {
        this.preferencesService.getPreferences().subscribe((response) => {
          const updatedFaculty = response?.preferences?.find(
            (item: any) => item.faculty_id === faculty.faculty_id,
          );

          if (updatedFaculty) {
            faculty.is_enabled = updatedFaculty.is_enabled === 1;
            faculty.active_semesters = updatedFaculty.active_semesters;

            this.updateDisplayedData();
            this.checkToggleAllState();
            this.updateExportButtonState();
            this.cdr.detectChanges();
          }
        });
      }
    });
  }

  /**
   * Opens the preview dialog for the given faculty's preferences.
   * @param faculty Faculty to preview.
   */
  onView(faculty: Faculty): void {
    const generatePdfFunction = (preview: boolean): Blob | void => {
      return this.generateFacultyPDF(false, [faculty], preview);
    };

    const fileNameBase = `${this.sanitizeFileName(faculty.facultyName)}_preferences_report`;

    this.dialog.open(DialogPrefComponent, {
      maxWidth: '70rem',
      width: '100%',
      data: {
        facultyName: faculty.facultyName,
        faculty_id: faculty.faculty_id,
        termId: this.selectedTermId,
        isAdmin: true,
        generateExcelFunction: async () => {
          const excelBlob = await this.generateFacultyExcelBlob(false, [faculty]);
          saveAs(excelBlob, `${fileNameBase}.xlsx`);
        }
      },
      disableClose: true,
      autoFocus: true,
    });
  }

  /**
   * Opens the dialog for exporting all faculty preferences.
   * Validates that there is data available before opening the dialog.
   */
  onExportAll(): void {
    if (!this.allData.length) {
      this.snackBar.open('No faculty preferences available for export.', 'Close', { duration: 3000 });
      return;
    }

    const firstActiveSemesterFaculty = this.allData.find(
      (faculty) => faculty.active_semesters && faculty.active_semesters.length > 0,
    );

    if (!firstActiveSemesterFaculty) {
      this.snackBar.open('No active semester data available for export.', 'Close', { duration: 3000 });
      return;
    }

    const { academic_year, semester_label } = firstActiveSemesterFaculty.active_semesters![0];

    this.dialog.open(DialogExportComponent, {
      maxWidth: '70rem',
      width: '100%',
      autoFocus: true,
      data: {
        exportType: 'all',
        entity: 'faculty',
        customTitle: 'Export All Faculty Preferences',
        subtitle: `For Academic Year ${academic_year}, ${semester_label}`,
        generatePdfFunction: (preview: boolean) => this.generateFacultyPDF(true, this.allData, preview),
        generateExcelFunction: async () => {
          const excelBlob = await this.generateFacultyExcelBlob(true, this.allData);
          const fileName = `${academic_year.replace('/', '_')}_${semester_label.toLowerCase()}_faculty_preferences_report.xlsx`;
          saveAs(excelBlob, fileName);
        },
        generateFileNameFunction: () => `${academic_year.replace('/', '_')}_${semester_label.toLowerCase()}_faculty_preferences_report.pdf`,
      },
      disableClose: true,
    });
  }

  // --- EXPORT BY PROGRAM ---
  /**
   * Opens the export dialog to generate program-grouped export files.
   * Validates grouped program data before allowing the export.
   */
  onExportByProgram(): void {
    if (!this.allData.length) {
      this.snackBar.open('No faculty preferences available for export.', 'Close', { duration: 3000 });
      return;
    }

    const firstActiveSemesterFaculty = this.allData.find(
      (faculty) => faculty.active_semesters && faculty.active_semesters.length > 0,
    );

    if (!firstActiveSemesterFaculty) {
      this.snackBar.open('No active semester data available for export.', 'Close', { duration: 3000 });
      return;
    }

    const { academic_year, semester_label } = firstActiveSemesterFaculty.active_semesters![0];
    const programsData = this.getGroupedProgramData();

    if (programsData.length === 0) {
      this.snackBar.open('No valid program data to export.', 'Close', { duration: 3000 });
      return;
    }

    this.dialog.open(DialogExportComponent, {
      maxWidth: '70rem',
      width: '100%',
      autoFocus: true,
      data: {
        exportType: 'all',
        entity: 'program',
        customTitle: 'Export Preferences by Program',
        subtitle: `For Academic Year ${academic_year}, ${semester_label}`,
        // Using an async Promise wrapper so it yields to the UI thread, ensuring the loading spinner shows
        generatePdfFunction: async (preview: boolean): Promise<Blob> => {
           return new Promise((resolve, reject) => {
             setTimeout(() => {
               try {
                 const blob = this.generateProgramPreferencesPDF(programsData, academic_year, semester_label);
                 resolve(blob);
               } catch (error) {
                 reject(error);
               }
             }, 50); 
           });
        },
        generateExcelFunction: async () => {
          const excelBlob = await this.generateProgramPreferencesExcelBlob(programsData, academic_year, semester_label);
          const fileName = `${academic_year.replace('/', '_')}_${semester_label.toLowerCase()}_program_preferences.xlsx`;
          saveAs(excelBlob, fileName);
        },
        generateFileNameFunction: () => `${academic_year.replace('/', '_')}_${semester_label.toLowerCase()}_program_preferences.pdf`,
      },
      disableClose: true,
    });
  }

  /**
   * Opens the export dialog for exporting a single faculty's preferences.
   * @param faculty The faculty whose preferences are to be exported.
   */
  onExportSingle(faculty: Faculty): void {
    const activeSemester = faculty.active_semesters?.[0];
    if (!activeSemester || !activeSemester.courses?.length) {
      const message = !activeSemester
        ? `No active semesters available for ${faculty.facultyName}.`
        : `No preferences available for ${faculty.facultyName}.`;
      this.snackBar.open(message, 'Close', { duration: 3000 });
      return;
    }

    const academic_year = activeSemester.academic_year;
    const semester_label = activeSemester.semester_label;
    const fileNameBase = `${this.sanitizeFileName(faculty.facultyName)}_preferences_report`;

    this.dialog.open(DialogExportComponent, {
      maxWidth: '70rem',
      width: '100%',
      autoFocus: true,
      data: {
        exportType: 'single',
        entity: 'faculty',
        customTitle: `${faculty.facultyName} Preferences`,
        subtitle: `For Academic Year ${academic_year}, ${semester_label}`,
        generatePdfFunction: (preview: boolean) => this.generateFacultyPDF(false, [faculty], preview),
        generateExcelFunction: async () => {
          const excelBlob = await this.generateFacultyExcelBlob(false, [faculty]);
          saveAs(excelBlob, `${fileNameBase}.xlsx`);
        },
        generateFileNameFunction: () => `${fileNameBase}.pdf`
      },
      disableClose: true,
    });
  }

  /**
   * Groups faculty preference course data by program, year level and
   * section to produce a structure suitable for program-based exports.
   * @returns An array of program group objects prepared for export.
   */
  private getGroupedProgramData(): any[] {
    const programsMap = new Map<string, any>();
    
    // Dictionary to expand program titles if the backend only provided abbreviations
    const PROGRAM_NAMES: { [key: string]: string } = {
      'BSECE': 'Bachelor of Science in Electronics Engineering',
      'BSIT': 'Bachelor of Science in Information Technology',
      'BSME': 'Bachelor of Science in Mechanical Engineering',
      'BSIE': 'Bachelor of Science in Industrial Engineering',
      'BSBA-HRM': 'Bachelor of Science in Business Administration Major in Human Resource Management',
      'BSBA-MM': 'Bachelor of Science in Business Administration Major in Marketing Management',
      'BSOA': 'Bachelor of Science in Office Administration',
      'BSED-EN': 'Bachelor of Secondary Education Major in English',
      'BSED-MA': 'Bachelor of Secondary Education Major in Mathematics',
      'BSED-SC': 'Bachelor of Secondary Education Major in Science',
      'DOMT': 'Diploma in Office Management Technology',
      'DICT': 'Diploma in Information Communication Technology',
      'BSCS': 'Bachelor of Science in Computer Science',
      'BSCE': 'Bachelor of Science in Civil Engineering',
      'BSA': 'Bachelor of Science in Accountancy',
      'BSAIS': 'Bachelor of Science in Accounting Information System',
      'BSBA-FM': 'Bachelor of Science in Business Administration Major in Financial Management',
      'BSENT': 'Bachelor of Science in Entrepreneurship',
    };

    this.allData.forEach((faculty) => {
      const activeSemester = faculty.active_semesters?.[0];
      if (!activeSemester || !activeSemester.courses) return;

      activeSemester.courses.forEach((course: any) => {
        if (course.is_ignored) return;

        const progCode = course.course_details?.program_code || course.program_details?.program_code || 'UNKNOWN PROGRAM';
        let progTitle = course.course_details?.program_title || course.program_details?.program_title;
        
        // Auto-expand program title if it's missing or matches the short code
        if (!progTitle || progTitle === progCode) {
            progTitle = PROGRAM_NAMES[progCode.toUpperCase()] || progCode;
        }

        const yearLevel = course.course_details?.year_level || course.section_details?.year_level || 'N/A';
        const sectionName = course.section_details?.section_name || course.course_details?.section_name || 'N/A';
        const teacherName = faculty.facultyName;
        
        const preferredDays = course.preferred_days || [];
        
        const dayMap: { [key: string]: string } = {
          'Monday': 'M', 'Tuesday': 'TUE', 'Wednesday': 'W', 'Thursday': 'TH', 'Friday': 'F', 'Saturday': 'S', 'Sunday': 'SU'
        };
        
        // Group the days by identical time blocks so they get their own rows instead of merging confusingly
        const timeGroups = new Map<string, string[]>();
        preferredDays.forEach((d: any) => {
            const start = this.formatTimeTo12Hour(d.start_time).replace(/\s+/g, '');
            const end = this.formatTimeTo12Hour(d.end_time).replace(/\s+/g, '');
            const timeStr = `${start}-${end}`;
            const dayAbbr = dayMap[d.day] || d.day.substring(0,3);
            
            if (!timeGroups.has(timeStr)) {
                timeGroups.set(timeStr, []);
            }
            timeGroups.get(timeStr)!.push(dayAbbr);
        });

        const scheduleBlocks: {day: string, time: string}[] = [];
        timeGroups.forEach((daysArr, timeStr) => {
            scheduleBlocks.push({ day: daysArr.join(''), time: timeStr });
        });

        if (scheduleBlocks.length === 0) {
            scheduleBlocks.push({ day: 'TBA', time: 'TBA' });
        }

        const courseCode = course.course_details?.course_code || 'N/A';
        const courseTitle = course.course_details?.course_title || 'N/A';
        const lec = course.lec_hours || 0;
        const lab = course.lab_hours || 0;

        if (!programsMap.has(progCode)) {
            programsMap.set(progCode, {
                program_code: progCode,
                program_title: progTitle,
                year_levels: new Map<string, any>()
            });
        }

        const prog = programsMap.get(progCode);
        if (!prog.year_levels.has(yearLevel)) {
            prog.year_levels.set(yearLevel, {
                year_level: yearLevel,
                sections: new Map<string, any>()
            });
        }

        const yl = prog.year_levels.get(yearLevel);
        if (!yl.sections.has(sectionName)) {
            yl.sections.set(sectionName, {
                section_name: sectionName,
                courses: new Map<string, any>()
            });
        }

        const sec = yl.sections.get(sectionName);

        // Group by course so that multiple teachers selecting the same course appear in the same section
        if (!sec.courses.has(courseCode)) {
             sec.courses.set(courseCode, {
                subject_code: courseCode,
                description: courseTitle,
                lec: lec,
                lab: lab,
                teachers: new Map<string, any>() // Group by individual teacher next
             });
        }
        
        const c = sec.courses.get(courseCode);
        if (!c.teachers.has(teacherName)) {
            c.teachers.set(teacherName, []);
        }

        // Add all distinct day/time blocks for this specific teacher
        scheduleBlocks.forEach(block => {
            c.teachers.get(teacherName).push(block);
        });
      });
    });

    const programsArray = Array.from(programsMap.values()).map(prog => {
      prog.year_levels = Array.from(prog.year_levels.values()).map((yl: any) => {
        yl.sections = Array.from(yl.sections.values()).map((sec: any) => {
            sec.courses = Array.from(sec.courses.values()).map((c: any) => {
                return {
                    subject_code: c.subject_code,
                    description: c.description,
                    lec: c.lec,
                    lab: c.lab,
                    // Safe mapping over map entries without tuple destructuring
                    teachers: Array.from(c.teachers.entries()).map((entry: any) => ({
                        teacherName: entry[0],
                        blocks: entry[1]
                    })).sort((a: any, b: any) => a.teacherName.localeCompare(b.teacherName)) 
                };
            }).sort((a,b) => a.subject_code.localeCompare(b.subject_code));
            return sec;
        }).sort((a: any, b: any) => String(a.section_name).localeCompare(String(b.section_name)));
        return yl;
      }).sort((a: any, b: any) => String(a.year_level).localeCompare(String(b.year_level)));
      return prog;
    }).sort((a, b) => a.program_code.localeCompare(b.program_code));

    return programsArray;
  }

  /**
   * Generates a PDF blob for program-grouped preference data.
   * @param programsData Grouped program data as returned by getGroupedProgramData().
   * @param academicYear Academic year string for headers.
   * @param semesterLabel Semester label for headers.
   * @returns A Blob containing the generated PDF document.
   */
  private generateProgramPreferencesPDF(programsData: any[], academicYear: string, semesterLabel: string): Blob {
    const doc = new jsPDF('p', 'mm', 'legal') as any;
    let isFirstPage = true;

    programsData.forEach((program: any) => {
      program.year_levels.forEach((yl: any) => {
        yl.sections.forEach((sec: any) => {
          if (!isFirstPage) {
            doc.addPage();
          }
          isFirstPage = false;

          let currentY = 20;

          doc.setFontSize(14);
          doc.setFont('helvetica', 'bold');
          doc.text(`${semesterLabel.toUpperCase()} SY ${academicYear}`, 105, currentY, { align: 'center' });
          currentY += 10;
          
          doc.setFontSize(12);
          doc.text('SECTION OFFERING', 105, currentY, { align: 'center' });
          currentY += 8;

          doc.setFontSize(14); 
          const fullTitle = `${program.program_title.toUpperCase()} (TAGUIG)`;
          const splitTitle = doc.splitTextToSize(fullTitle, 180);
          doc.text(splitTitle, 105, currentY, { align: 'center' });
          currentY += (splitTitle.length * 6) + 6; 

          const yearStr = yl.year_level.toString();
          let yearDisplay = '';
          
          if (yearStr === 'N/A' || yearStr === 'null' || !yearStr) {
              yearDisplay = 'Unassigned Year';
          } else {
              let suffix = 'TH';
              if (yearStr.endsWith('1') && !yearStr.endsWith('11')) suffix = 'ST';
              else if (yearStr.endsWith('2') && !yearStr.endsWith('12')) suffix = 'ND';
              else if (yearStr.endsWith('3') && !yearStr.endsWith('13')) suffix = 'RD';
              yearDisplay = `${yearStr}${suffix} Year`;
          }

          let secDisplay = sec.section_name && sec.section_name !== 'N/A' && sec.section_name !== 'null' 
              ? ` - Section ${sec.section_name}` 
              : '';

          doc.setFontSize(10);
          doc.setFont('helvetica', 'normal');
          doc.text(`${yearDisplay}${secDisplay}`, 15, currentY);
          currentY += 5;

          const tableBody: any[] = [];
          
          sec.courses.forEach((c: any) => {
            let totalCourseRows = 0;
            c.teachers.forEach((t: any) => {
                totalCourseRows += t.blocks.length;
            });

            if (totalCourseRows === 0) return;

            let isFirstCourseRow = true;

            c.teachers.forEach((t: any) => {
                const teacherRows = t.blocks.length;
                let isFirstTeacherRow = true;

                t.blocks.forEach((b: any) => {
                    const row: any[] = [];

                    // Apply rowSpan to the primary course details so they merge beautifully
                    if (isFirstCourseRow) {
                        row.push({ content: c.subject_code, rowSpan: totalCourseRows, styles: { valign: 'middle', halign: 'center' } });
                        row.push({ content: c.description, rowSpan: totalCourseRows, styles: { valign: 'middle' } });
                        row.push({ content: c.lec.toString(), rowSpan: totalCourseRows, styles: { valign: 'middle', halign: 'center' } });
                        row.push({ content: c.lab.toString(), rowSpan: totalCourseRows, styles: { valign: 'middle', halign: 'center' } });
                        isFirstCourseRow = false;
                    }

                    // Apply rowSpan to the teacher so horizontal lines appear correctly between their individual schedules
                    if (isFirstTeacherRow) {
                        row.push({ content: t.teacherName, rowSpan: teacherRows, styles: { valign: 'middle' } });
                        isFirstTeacherRow = false;
                    }

                    row.push({ content: b.day, styles: { valign: 'middle', halign: 'center' } });
                    row.push({ content: b.time, styles: { valign: 'middle', halign: 'center' } });

                    tableBody.push(row);
                });
            });
          });

          (doc as any).autoTable({
            startY: currentY,
            head: [['SUBJECT CODE', 'DESCRIPTION', 'LEC', 'LAB', 'TEACHER', 'DAY', 'TIME']],
            body: tableBody,
            theme: 'grid',
            headStyles: {
              fillColor: [255, 255, 255],
              textColor: [0, 0, 0],
              lineColor: [0, 0, 0],
              lineWidth: 0.3,
              fontStyle: 'bold',
              halign: 'center',
              valign: 'middle'
            },
            bodyStyles: {
              textColor: [0, 0, 0],
              lineColor: [0, 0, 0],
              lineWidth: 0.3,
            },
            styles: {
              font: 'helvetica',
              fontSize: 9,
              cellPadding: 3,
              overflow: 'linebreak',
            },
            columnStyles: {
              0: { cellWidth: 24, halign: 'center' },
              1: { cellWidth: 53 },
              2: { cellWidth: 13, halign: 'center' },
              3: { cellWidth: 13, halign: 'center' },
              4: { cellWidth: 40 },
              5: { cellWidth: 16, halign: 'center' },
              6: { cellWidth: 27, halign: 'center' },
            },
            margin: { left: 15, right: 15 }
          });
        });
      });
    });

    return doc.output('blob');
  }

  /**
   * Creates an Excel workbook blob containing program-grouped
   * preference data suitable for download.
   * @param programsData Grouped program data as returned by getGroupedProgramData().
   * @param academicYear Academic year string for headers and filenames.
   * @param semesterLabel Semester label for headers and filenames.
   * @returns Promise resolving to an Excel Blob.
   */
  private async generateProgramPreferencesExcelBlob(programsData: any[], academicYear: string, semesterLabel: string): Promise<Blob> {
    const workbook = new ExcelJS.Workbook();

    programsData.forEach((program: any) => {
      program.year_levels.forEach((yl: any) => {
        yl.sections.forEach((sec: any) => {
          const sheetName = `${program.program_code} Y${yl.year_level} S${sec.section_name}`.replace(/[^\w\s-]/gi, '').substring(0, 31);
          
          let uniqueSheetName = sheetName;
          let counter = 1;
          while (workbook.getWorksheet(uniqueSheetName)) {
              uniqueSheetName = `${sheetName.substring(0, 27)}_${counter}`;
              counter++;
          }
          const worksheet = workbook.addWorksheet(uniqueSheetName);

          worksheet.pageSetup = {
            orientation: 'portrait', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
            margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 }
          };

          worksheet.columns = [
            { width: 15 }, 
            { width: 40 }, 
            { width: 8 },  
            { width: 8 },  
            { width: 25 }, 
            { width: 10 }, 
            { width: 20 }, 
          ];

          worksheet.mergeCells('A1:G1');
          const header1 = worksheet.getCell('A1');
          header1.value = `${semesterLabel.toUpperCase()} SY ${academicYear}`;
          header1.font = { bold: true, size: 12 };
          header1.alignment = { horizontal: 'center' };

          worksheet.mergeCells('A2:G2');
          const header2 = worksheet.getCell('A2');
          header2.value = 'SECTION OFFERING';
          header2.font = { bold: true, size: 11 };
          header2.alignment = { horizontal: 'center' };

          worksheet.mergeCells('A3:G3');
          const header3 = worksheet.getCell('A3');
          header3.value = `${program.program_title.toUpperCase()} (TAGUIG)`;
          header3.font = { bold: true, size: 14 };
          header3.alignment = { horizontal: 'center', wrapText: true };
          worksheet.getRow(3).height = 30;

          worksheet.addRow([]);

          const yearStr = yl.year_level.toString();
          let yearDisplay = '';
          
          if (yearStr === 'N/A' || yearStr === 'null' || !yearStr) {
              yearDisplay = 'Unassigned Year';
          } else {
              let suffix = 'TH';
              if (yearStr.endsWith('1') && !yearStr.endsWith('11')) suffix = 'ST';
              else if (yearStr.endsWith('2') && !yearStr.endsWith('12')) suffix = 'ND';
              else if (yearStr.endsWith('3') && !yearStr.endsWith('13')) suffix = 'RD';
              yearDisplay = `${yearStr}${suffix} Year`;
          }

          let secDisplay = sec.section_name && sec.section_name !== 'N/A' && sec.section_name !== 'null' 
              ? ` - Section ${sec.section_name}` 
              : '';

          const ylRow = worksheet.addRow([`${yearDisplay}${secDisplay}`]);
          ylRow.font = { bold: true };
          
          const tableHeader = worksheet.addRow(['SUBJECT CODE', 'DESCRIPTION', 'LEC', 'LAB', 'TEACHER', 'DAY', 'TIME']);
          tableHeader.eachCell(cell => {
            cell.font = { bold: true };
            cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
            cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
          });

          sec.courses.forEach((c: any) => {
            const courseStartRow = worksheet.rowCount + 1;
            let totalRows = 0;

            c.teachers.forEach((t: any) => {
                const teacherStartRow = worksheet.rowCount + 1;
                
                t.blocks.forEach((b: any) => {
                    const row = worksheet.addRow([
                        c.subject_code, c.description, c.lec, c.lab, t.teacherName, b.day, b.time
                    ]);
                    row.eachCell((cell, colNum) => {
                        cell.alignment = { vertical: 'middle', horizontal: (colNum === 3 || colNum === 4 || colNum === 6 || colNum === 7) ? 'center' : 'left', wrapText: true };
                        cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
                    });
                    totalRows++;
                });

                if (t.blocks.length > 1) {
                    const teacherEndRow = worksheet.rowCount;
                    worksheet.mergeCells(`E${teacherStartRow}:E${teacherEndRow}`);
                }
            });

            if (totalRows > 1) {
                const courseEndRow = worksheet.rowCount;
                worksheet.mergeCells(`A${courseStartRow}:A${courseEndRow}`);
                worksheet.mergeCells(`B${courseStartRow}:B${courseEndRow}`);
                worksheet.mergeCells(`C${courseStartRow}:C${courseEndRow}`);
                worksheet.mergeCells(`D${courseStartRow}:D${courseEndRow}`);
            }
          });
        });
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  /**
   * Generates an Excel workbook blob containing one sheet per faculty
   * with their preference details.
   * @param isAll Whether the export is for all faculties.
   * @param faculties Array of faculties to include in the workbook.
   * @returns Promise resolving to an Excel Blob.
   */
  private async generateFacultyExcelBlob(isAll: boolean, faculties: Faculty[]): Promise<Blob> {
    const workbook = new ExcelJS.Workbook();

    for (const faculty of faculties) {
      const activeSemester = faculty.active_semesters?.[0];
      if (!activeSemester || !activeSemester.courses?.length) continue;

      let tabName = faculty.facultyName.split(',')[0].substring(0, 30).replace(/[^\w\s-]/gi, '');
      
      let uniqueTabName = tabName;
      let counter = 1;
      while (workbook.getWorksheet(uniqueTabName)) {
         uniqueTabName = `${tabName.substring(0, 27)}_${counter}`;
         counter++;
      }
      
      const worksheet = workbook.addWorksheet(uniqueTabName);

      worksheet.pageSetup = {
        orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
        margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 }
      };

      worksheet.columns = [
        { width: 5 },
        { width: 15 },
        { width: 20 },
        { width: 15 },
        { width: 35 },
        { width: 8 },
        { width: 8 },
        { width: 8 },
        { width: 30 }
      ];

      worksheet.mergeCells('A1:D1'); worksheet.mergeCells('E1:I1');
      worksheet.mergeCells('A2:D2'); worksheet.mergeCells('E2:I2');

      worksheet.getCell('A1').value = `Faculty Name: ${faculty.facultyName.toUpperCase()}`;
      worksheet.getCell('E1').value = `Faculty Code: ${faculty.facultyCode}`;
      worksheet.getCell('A2').value = `Academic Year: ${activeSemester.academic_year}`;
      worksheet.getCell('E2').value = `Semester: ${activeSemester.semester_label}`;

      ['A1', 'E1', 'A2', 'E2'].forEach(c => {
        const cell = worksheet.getCell(c);
        cell.font = { bold: true };
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
        cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
      });

      worksheet.addRow([]);

      const headerRow = worksheet.addRow([
        '#', 'Program Code', 'Year & Section', 'Course Code', 'Course Title', 'Lec', 'Lab', 'Units', 'Preferred Day & Time'
      ]);
      headerRow.height = 25;
      headerRow.eachCell(cell => {
        cell.font = { bold: true };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
      });

      activeSemester.courses.forEach((course: any, index: number) => {
        const preferredDays = course.preferred_days || [];
        const formattedDayTimes = this.formatPreferredDaysAndTime(preferredDays);

        const sectionName = course.section_details?.section_name || course.course_details?.section_name || '';
        const yearLevel = course.course_details?.year_level || '';
        const yearSection = yearLevel && sectionName ? `${yearLevel}-${sectionName}` : 'N/A';

        const row = worksheet.addRow([
          index + 1,
          course.course_details?.program_code || course.program_details?.program_code || 'N/A',
          yearSection,
          course.course_details?.course_code || 'N/A',
          course.course_details?.course_title || 'N/A',
          course.lec_hours || 0,
          course.lab_hours || 0,
          course.units || 0,
          formattedDayTimes || 'N/A'
        ]);

        row.eachCell((cell, colNum) => {
          cell.alignment = { vertical: 'middle', horizontal: colNum === 5 || colNum === 9 ? 'left' : 'center', wrapText: true };
          cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
        });
      });
    }

    if (workbook.worksheets.length === 0) {
      const emptySheet = workbook.addWorksheet('No Data');
      emptySheet.getCell('A1').value = 'No preferences available.';
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  /**
   * Generates a PDF document blob for provided faculty preferences.
   * @param isAll True when generating a combined report for all faculties.
   * @param faculties Array of faculty objects to render.
   * @param showPreview If true, the caller intends to display a preview.
   * @returns Blob representing the generated PDF.
   */
  generateFacultyPDF(
    isAll: boolean,
    faculties: Faculty[],
    showPreview: boolean = false,
  ): Blob {
    const doc = new jsPDF('p', 'mm', 'legal') as any;
    const pageWidth = doc.internal.pageSize.width;
    let currentY = 15;

    try {
      this.reportHeaderService
        .addHeader(
          doc,
          isAll
            ? 'All Faculty Preferences Report'
            : 'Faculty Preferences Report',
          currentY,
        )
        .subscribe((newY) => {
          currentY = newY;

          faculties.forEach((faculty, facultyIndex) => {
            const activeSemester = faculty.active_semesters?.[0];

            if (!activeSemester || !activeSemester.courses?.length) return;

            doc.setFontSize(12);
            doc.setFont('helvetica', 'normal');
            const facultyInfo = [
              `Faculty Name: ${faculty.facultyName}`,
              `Faculty Code: ${faculty.facultyCode}`,
              `Academic Year: ${activeSemester.academic_year}`,
              `Semester: ${activeSemester.semester_label}`,
            ];

            facultyInfo.forEach((info) => {
              doc.text(info, 10, currentY);
              currentY += 5;
            });
            currentY += 5;

            const courseData = activeSemester.courses.map(
              (course: any, index: number) => {
                const preferredDays = course.preferred_days || [];
                const formattedDayTimes = this.formatPreferredDaysAndTime(preferredDays);

                return [
                  (index + 1).toString(),
                  course.course_details?.program_code || 'N/A',
                  course.course_details?.year_level + '-' + course.course_details?.section_name || 'N/A',                
                  course.course_details?.course_code || 'N/A',
                  course.course_details?.course_title || 'N/A',
                  course.lec_hours.toString(),
                  course.lab_hours.toString(),
                  course.units.toString(),
                  formattedDayTimes || 'N/A',
                ];
              },
            );

            const tableHead = [
              [
                '#',
                'Program Code',
                'Year & Section',
                'Course Code',
                'Course Title',
                'Lec',
                'Lab',
                'Units',
                'Preferred Day & Time',
              ],
            ];
            const tableConfig = {
              startY: currentY,
              head: tableHead,
              body: courseData,
              theme: 'grid',
              headStyles: {
                fillColor: [128, 0, 0],
                textColor: [255, 255, 255],
                fontSize: 9,
              },
              bodyStyles: {
                fontSize: 8,
                textColor: [0, 0, 0],
              },
              styles: {
                lineWidth: 0.1,
                overflow: 'linebreak',
                cellPadding: 2,
              },
              columnStyles: {
                0: { cellWidth: 10 },
                1: { cellWidth: 20 },
                2: { cellWidth: 20 },
                3: { cellWidth: 30 },
                4: { cellWidth: 40 },
                5: { cellWidth: 13 },
                6: { cellWidth: 13 },
                7: { cellWidth: 13 },
                8: { cellWidth: 40 },
              },
              margin: { left: 10, right: 10 },
            };

            (doc as any).autoTable(tableConfig);

            currentY = (doc as any).lastAutoTable.finalY + 10;
            if (currentY > 270) {
              doc.addPage();
              this.reportHeaderService
                .addHeader(
                  doc,
                  isAll
                    ? 'All Faculty Preferences Report'
                    : 'Faculty Preferences Report',
                  15,
                )
                .subscribe((newPageY) => {
                  currentY = newPageY;
                });
            }
          });

          this.reportHeaderService.addStandardFooter(doc);
        });

      return doc.output('blob');
    } catch (error) {
      this.snackBar.open('Failed to generate PDF.', 'Close', {
        duration: 3000,
      });
      throw error;
    }
  }

  /**
   * Sanitizes a string to produce a safe filename.
   * @param fileName Original filename or label.
   * @returns Sanitized string containing only lowercase letters and digits/underscores.
   */
  sanitizeFileName(fileName: string): string {
    return fileName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  }

  /**
   * Converts a 24-hour time string (HH:MM(:SS) format) into 12-hour format.
   * @param time Time string in 24-hour format, or undefined.
   * @returns Formatted time in 12-hour notation or 'N/A' when missing.
   */
  formatTimeTo12Hour(time: string | undefined): string {
    if (!time) {
      return 'N/A';
    }
    const [hour, minute] = time.split(':');
    const hours = parseInt(hour, 10);
    const minutesFormatted = minute.length === 2 ? minute : `0${minute}`;
    const period = hours >= 12 ? 'PM' : 'AM';
    const formattedHour = hours % 12 || 12;
    return `${formattedHour}:${minutesFormatted} ${period}`;
  }

  /**
   * Detects whether the preferredDays array indicates "any day" or
   * "any time" modifiers.
   * @param preferredDays Array of preferred day/time objects.
   * @returns Object with flags `has_any_day` and `has_any_time`.
   */
  private detectAnyModifiers(preferredDays: any[]): { has_any_day: boolean; has_any_time: boolean } {
    const REQUIRED_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const ANY_DAY_START = '07:00:00';
    const ANY_DAY_END = '21:00:00';

    const presentDays = preferredDays.map(pref => pref.day);
    const has_any_day = REQUIRED_DAYS.every(day => presentDays.includes(day));

    const has_any_time = preferredDays.length > 0 && preferredDays.every(
      pref => pref.start_time === ANY_DAY_START && pref.end_time === ANY_DAY_END
    );

    return { has_any_day, has_any_time };
  }

  /**
   * Formats the preferredDays array into a readable string used in
   * exports and PDF tables.
   * @param preferredDays Array of preferred day/time objects.
   * @returns Formatted string describing days and time ranges.
   */
  private formatPreferredDaysAndTime(preferredDays: any[]): string {
    const { has_any_day, has_any_time } = this.detectAnyModifiers(preferredDays);

    if (has_any_day && has_any_time) {
      return 'Any Day, Any Time';
    }

    if (has_any_day && preferredDays.length > 0) {
      const firstDay = preferredDays[0];
      const timeRange = `${this.formatTimeTo12Hour(
        firstDay.start_time,
      )} - ${this.formatTimeTo12Hour(firstDay.end_time)}`;
      return `Any Day, ${timeRange}`;
    }

    if (has_any_time) {
      const daysString = preferredDays.map(pref => pref.day).join(', ');
      return `${daysString}, Any Time`;
    }

    return preferredDays
      .map((pref) => {
        const time = `${this.formatTimeTo12Hour(
          pref.start_time,
        )} - ${this.formatTimeTo12Hour(pref.end_time)}`;
        return `${pref.day} (${time})`;
      })
      .join('\n');
  }

  /**
   * Computes CSS class flags derived from the faculty type string.
   * @param facultyType Raw faculty type label.
   * @returns Record of CSS class booleans.
   */
  getFacultyTypeClass(facultyType: string): Record<string, boolean> {
    const type = facultyType.toLowerCase();
    return {
      'full-time': type.includes('full-time'),
      designee: type.includes('designee'),
      'part-time': type.includes('part-time'),
      temporary: type.includes('temporary'),
    };
  }

  /**
   * Returns the tooltip text for a given toggle type and faculty.
   * @param type Either 'global' or 'individual'.
   * @param faculty Optional faculty to derive the tooltip from.
   */
  public getTooltip(type: 'global' | 'individual', faculty?: Faculty): string {
    const state = this.getToggleState(faculty || this.allData[0]);
    return type === 'global' ? state.globalTooltip : state.individualTooltip;
  }

  /**
   * Computes the toggle enable/disable state and associated tooltips
   * for the provided faculty.
   * @param faculty Optional faculty to compute state for.
   */
  public getToggleState(faculty?: Faculty): ToggleState {
    if (!faculty || !this.allData.length) {
      return {
        isGlobalDisabled: true,
        isIndividualDisabled: true,
        globalTooltip: 'No faculty data available',
        individualTooltip: 'No faculty data available',
      };
    }

    const isGlobalDisabled =
      (this.hasIndividualDeadlines &&
        !this.isToggleAllChecked &&
        this.isEnabled) ||
      this.isIndividualStartDateSet;

    const isIndividualDisabled =
      this.isToggleAllChecked || this.isGlobalStartDateSet;

    const isGloballyScheduled = this.isGloballyScheduled();
    const isIndividuallyScheduled = this.isIndividuallyScheduled(faculty);

    const globalTooltip =
      isGloballyScheduled && !this.isToggleAllChecked
        ? 'Preferences submission is scheduled'
        : this.hasIndividualDeadlines && !this.isToggleAllChecked
        ? 'Global preferences toggle is disabled because individual preferences settings are set'
        : `${
            this.isToggleAllChecked ? 'Disable' : 'Enable'
          } preferences submission for ALL faculty`;

    const individualTooltip =
      isIndividuallyScheduled && !faculty.is_enabled
        ? 'Preferences submission is scheduled'
        : this.isGlobalStartDateSet
        ? 'Global submission start date has been set – individual changes disabled'
        : this.isToggleAllChecked
        ? 'Global preferences submission is active – individual changes disabled'
        : `${
            faculty.is_enabled ? 'Disable' : 'Enable'
          } preferences submission for ${faculty.facultyName} only`;

    return {
      isGlobalDisabled,
      isIndividualDisabled,
      globalTooltip,
      individualTooltip,
    };
  }
}
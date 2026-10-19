import { Component, Inject, OnInit, OnDestroy, signal, computed, effect, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

import { Subject, firstValueFrom } from 'rxjs';
import { debounceTime, distinctUntilChanged, startWith } from 'rxjs/operators';

import { MAT_DIALOG_DATA, MatDialogRef, MatDialog } from '@angular/material/dialog';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatRippleModule } from '@angular/material/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { MatSymbolDirective } from '../../core/imports/mat-symbol.directive';
import { LoadingComponent } from '../loading/loading.component';

import { DialogDayTimeComponent } from '../dialog-day-time/dialog-day-time.component';
import { DialogPrefSectionComponent } from '../dialog-pref-section/dialog-pref-section.component';
import { DialogGenericComponent } from '../dialog-generic/dialog-generic.component';

import { PreferencesService } from '../../core/services/faculty/preference/preferences.service';
import { ReportHeaderService } from '../../core/services/report-header/report-header.service';

import { fadeAnimation, cardEntranceAnimation, rowAdditionAnimation } from '../../core/animations/animations';

import jsPDF from 'jspdf';
import 'jspdf-autotable';

import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

interface Elective {
  course_code: string;
  course_title: string;
}

interface Course {
  course_id?: number;
  course_code: string;
  course_title: string;
  lec_hours: number;
  lab_hours: number;
  units: number;
  preferred_days: { day: string; start_time: string; end_time: string }[];
  year_section: string;
  program_code: string | null;
  is_temporary?: boolean;
  temporary_type?: string | null;
  temporary_status?: string | null;
  petition_required?: boolean;
  preferences_id?: number;
  is_ignored?: boolean;
  original_course_code?: string;
  elective_slot_name?: string;
  course_assignment_id?: number | null;
  temporary_course_offering_id?: number | null;
  year_level?: number | null;
  section?: any;
}

interface TableData extends Course {
  preferredDays: any[];
  isSubmitted: boolean;
  program_details: any;
}

interface DialogPrefData {
  facultyName: string;
  faculty_id: number;
  termId?: number | null;
  isViewOnlyTable?: boolean;
  isViewHistory?: boolean;
  isAdmin?: boolean;
  hasSubmitted?: boolean;
  generateExcelFunction?: () => Promise<void> | void; 
}

interface AcademicYearSemester {
  academic_year_id: number;
  academic_year: string;
  semester: Semester[];
}

interface Semester {
    semester_number: string;
    semester_id: number;
}

@Component({
  selector: 'app-dialog-pref',
  imports: [
    CommonModule,
    FormsModule,
    LoadingComponent,
    MatTableModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatSymbolDirective,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
    MatMenuModule,
    MatRippleModule,
    MatProgressSpinnerModule
],
  templateUrl: './dialog-pref.component.html',
  styleUrls: ['./dialog-pref.component.scss'],
  animations: [fadeAnimation, cardEntranceAnimation, rowAdditionAnimation],
})
export class DialogPrefComponent implements OnInit, OnDestroy {
  facultyName: string = '';
  academicYear: string = '';
  semesterLabel: string = '';
  courses: Course[] = []; // Used for PDF and simple table view
  isLoading = true;
  selectedView: 'set-preferences' | 'table-view' | 'pdf-view' | 'history-view' = 'table-view';
  selectedHistory: any;  
  academicYearList: AcademicYearSemester[] = [];  
  pdfBlobUrl: SafeResourceUrl | null = null;
  selectedYear: any;
  selectedSemester: any;

  // --- SET PREFERENCES UI STATE ---
  searchState = signal<'programSelection' | 'courseList' | 'searchResults' | 'noResults'>('programSelection');
  showProgramSelection = computed(() => this.searchState() === 'programSelection');
  showPossiblePrograms = signal(false);

  programs = signal<any[]>([]);
  availableCourses = signal<Course[]>([]);
  possiblePrograms = signal<any[]>([]);
  selectedProgram = signal<any | undefined>(undefined);
  selectedYearLevel = signal<number | null>(null);  
  selectedCourse = signal<Course | null>(null);
  selectedSection = signal<any | undefined>(undefined);
  
  dynamicYearLevels = computed(() => this.selectedProgram() ? this.selectedProgram()!.year_levels.map((yl: any) => yl.year_level) : []);
  
  activeSemesterId = signal<number | null>(null);
  semesterId = signal<number | null>(null);

  searchQuery = signal('');
  uniqueCourses = signal(new Map<string, Course>());
  electiveNameMap = signal(new Map<string, Elective>());

  private searchQuerySubject = new Subject<string>();
  @ViewChild('searchInput') searchInput!: ElementRef;

  // Table Data (Set Preferences view)
  allSelectedCourses = signal<TableData[]>([]);
  dataSource = computed(() => new MatTableDataSource(this.allSelectedCourses()));
  isRemoving = signal<{ [course_code: string]: boolean }>({});
  selectionDisplayedColumns: string[] = ['action', 'program', 'year_section', 'course_code', 'course_title', 'lec_hours', 'lab_hours', 'units', 'preferredDayTime'];
  
  readonly daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  private destroy$ = new Subject<void>();

  constructor(
    private preferencesService: PreferencesService,
    public dialogRef: MatDialogRef<DialogPrefComponent>,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    @Inject(MAT_DIALOG_DATA) public data: DialogPrefData,
    private sanitizer: DomSanitizer,
    private reportHeaderService: ReportHeaderService,
  ) {
    this.searchQuerySubject
      .pipe(debounceTime(300), distinctUntilChanged(), startWith(''))
      .subscribe((query) => {
        this.searchQuery.set(query);
        this.updateSearchState(query);
      });
  }

  ngOnInit(): void {
    this.loadFacultyPreferences();

    // Load academic years for history view
    this.preferencesService
      .getPreferencesHistoryByFacultyId(this.data.faculty_id.toString()).subscribe(
      (response) => {
          this.academicYearList = response.academic_years;
          if (this.data.isViewHistory) {
            this.preselectHistoryDefault();
          }
      },
      (error) => {
          console.error('Error fetching academic years:', error);
          this.showSnackbar('Failed to load academic years for history view.');
      }
    );
  }

  private loadFacultyPreferences() {
    this.isLoading = true;
    this.facultyName = this.data.facultyName;

    if (this.data.isAdmin && !this.data.hasSubmitted) {
      this.selectedView = 'set-preferences';
    } else if (this.data.isViewOnlyTable || (this.data.isAdmin && this.data.hasSubmitted)) {
      this.selectedView = 'table-view'; 
    } else if (this.data.isViewHistory) {
      this.selectedView = 'history-view'; 
    }

    const termId = this.data.termId || null;

    this.preferencesService
      .getPreferencesByFacultyId(this.data.faculty_id.toString(), true, termId)
      .subscribe({
        next: (response) => {
          const faculty = response.preferences;

          if (faculty) {
            const activeSemester = faculty.active_semesters[0];
            this.academicYear = activeSemester.academic_year;
            this.selectedYear = activeSemester.academic_year;
            this.semesterLabel = activeSemester.semester_label;
            this.activeSemesterId.set(activeSemester.active_semester_id);
            this.semesterId.set(activeSemester.semester_id);

            // Populate courses for PDF and Table view
            this.courses = activeSemester.courses.map((course: any) => ({
              course_code: course.course_details.course_code,
              course_title: course.course_details.course_title,
              lec_hours: course.lec_hours,
              lab_hours: course.lab_hours,
              units: course.units,
              preferred_days: course.preferred_days,
              year_section: `${course.course_details.year_level}-${course.section_details?.section_name || 'N/A'}`,
              program_code: course.course_details?.program_code ?? course.program_details?.program_code ?? null,
              preferences_id: course.preferences_id,
              is_ignored: course.is_ignored,
              is_temporary: course.is_temporary ?? course.course_details?.is_temporary ?? false,
              temporary_type: course.temporary_type ?? course.course_details?.temporary_type ?? null,
              temporary_status: course.temporary_status ?? course.course_details?.temporary_status ?? null,
              petition_required: course.petition_required ?? course.course_details?.petition_required ?? null,
              original_course_code: course.original_course_code ?? course.course_details?.original_course_code,
              elective_slot_name: course.elective_slot_name ?? course.course_details?.elective_slot_name,
            }));

            // Populate data for "Set Preferences" editable table
            this.allSelectedCourses.set(activeSemester.courses.map((course: any) => ({
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
                is_temporary: course.is_temporary ?? course.course_details?.is_temporary ?? false,
                temporary_type: course.temporary_type ?? course.course_details?.temporary_type ?? null,
                temporary_status: course.temporary_status ?? course.course_details?.temporary_status ?? null,
                petition_required: course.petition_required ?? course.course_details?.petition_required ?? null,
                program_details: course.program_details ?? undefined,
                year_section: `${course.course_details.year_level}-${course.section_details?.section_name || ''}`,
                original_course_code: course.original_course_code ?? course.course_details?.original_course_code,
                preferences_id: course.preferences_id
            })));
          }

          // If Admin is in Set Preferences mode, fetch master program list
          if (this.selectedView === 'set-preferences') {
             this.loadProgramsForSelection();
          } else {
             this.isLoading = false;
          }
        },
        error: (error) => {
          console.error('Error loading faculty preferences:', error);
          this.showSnackbar('Failed to load faculty preferences.');
          this.isLoading = false;
        }
      });
  }

  private loadProgramsForSelection() {
     this.preferencesService.getPrograms().subscribe({
         next: (resp) => {
             if (resp) {
                 const sortedPrograms = [...resp.programs].sort((a, b) => {
                   const aIsDiploma = /diploma/i.test(a.program_code) || /diploma/i.test(a.program_title);
                   const bIsDiploma = /diploma/i.test(b.program_code) || /diploma/i.test(b.program_title);
                   if (aIsDiploma !== bIsDiploma) return aIsDiploma ? 1 : -1;
                   return a.program_code.localeCompare(b.program_code);
                 });
                 this.programs.set(sortedPrograms);
                 this.activeSemesterId.set(resp.active_semester_id);
                 this.semesterId.set(resp.semester_id);

                 const allCoursesMap = new Map<string, Course>();
                 sortedPrograms.forEach((program) => this.populateUniqueCourses(program, allCoursesMap));
                 this.availableCourses.set([...allCoursesMap.values()].sort((a, b) => a.course_code.localeCompare(b.course_code)));
                 
                 this.loadElectiveNameMap(resp.programs, resp.academic_year_id);
             }
             this.isLoading = false;
         },
         error: (err) => {
             console.error('Error fetching programs', err);
             this.isLoading = false;
         }
     });
  }

  // --- SET PREFERENCES METHODS ---

  public onSearchInput(query: string): void {
    this.searchQuerySubject.next(query);
    this.showPossiblePrograms.set(false);
  }

  private updateSearchState(query: string): void {
    if (query) {
      if (this.selectedProgram()) {
        this.searchState.set(this.filteredSearchResults().length > 0 ? 'searchResults' : 'noResults');
      } else {
        this.searchState.set(this.filteredPrograms().length > 0 ? 'programSelection' : 'noResults');
      }
    } else {
      this.searchState.set(this.selectedProgram() ? 'courseList' : 'programSelection');
    }
  }

  public clearSearch(): void {
    this.showPossiblePrograms.set(false);
    this.selectedCourse.set(null);
    this.searchQuerySubject.next('');
  }

  public filterByYearLevel(year: number | null): void {
    this.selectedYearLevel.set(year);
  }

  public getYearLevelLabel(year: number): string {
    const labels: { [key: number]: string } = { 1: '1st Year', 2: '2nd Year', 3: '3rd Year', 4: '4th Year' };
    return labels[year] || `${year}th Year`;
  }

  filteredPrograms = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    if (!query) return this.programs();
    return this.programs().filter((program: any) =>
      program.program_code.toLowerCase().includes(query) ||
      program.program_title.toLowerCase().includes(query)
    );
  });

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
      coursesToFilter = this.availableCourses();
    }

    const filteredCourses = coursesToFilter.filter((course: Course) =>
        course.course_code.toLowerCase().includes(query) || course.course_title.toLowerCase().includes(query)
    );

    const uniqueCoursesMap = new Map<string, Course>();
    filteredCourses.forEach((course: Course) => {
      const key = this.getCourseListKey(course);
      if (!uniqueCoursesMap.has(key)) uniqueCoursesMap.set(key, course);
    });

    return Array.from(uniqueCoursesMap.values());
  });

  public filteredCoursesList = computed(() => {
    const yearLevel = this.selectedYearLevel();
    const program = this.selectedProgram();
    if (!program) return [];
    if (yearLevel === null) return Array.from(this.uniqueCourses().values());
    const yearLevelData = program.year_levels.find((yl: any) => yl.year_level === yearLevel);
    return yearLevelData ? yearLevelData.semester.courses.filter((course: any) => this.uniqueCourses().has(this.getCourseListKey(course))) : [];
  });

  public groupedCourses = computed(() => {
    const courses = this.filteredCoursesList();
    const groupsMap = new Map<number, Course[]>();
    courses.forEach((course: Course) => {
      const year = course.year_level ?? 0;
      if (!groupsMap.has(year)) groupsMap.set(year, []);
      groupsMap.get(year)!.push(course);
    });
    const groups: { yearLevel: number; courses: Course[] }[] = [];
    groupsMap.forEach((groupCourses: Course[], yearLevel: number) => {
      groupCourses.sort((a, b) => a.course_code.localeCompare(b.course_code));
      groups.push({ yearLevel, courses: groupCourses });
    });
    groups.sort((a, b) => a.yearLevel - b.yearLevel);
    return groups;
  });

  public selectProgram(program: any): void {
    this.selectedYearLevel.set(null);
    this.selectedProgram.set(program);
    this.searchState.set('courseList');
    this.uniqueCourses.set(new Map<string, Course>());
    this.populateUniqueCourses(program, this.uniqueCourses());
    this.clearSearch();
  }

  public backToProgramSelection(): void {
    this.selectedYearLevel.set(null);
    this.selectedProgram.set(undefined);
    this.showPossiblePrograms.set(false);
    this.selectedCourse.set(null);
    this.searchState.set('programSelection');
    this.clearSearch();
  }

  private populateUniqueCourses(program: any, coursesMap: Map<string, Course>): void {   
    program.year_levels.forEach((yearLevel: any) => {
      yearLevel.semester.courses.forEach((course: any) => {
        course.year_level = yearLevel.year_level;
        const key = this.getCourseListKey(course);
        coursesMap.set(key, course);
      });
    });
  }

  public async addCourseToTable(course: Course): Promise<void> {   
    if (this.selectedProgram() === undefined) {
      await this.populatePossiblePrograms(course);
      return;
    }
    const shouldProceed = await this.willSelectAnotherSection(course);
    if (!shouldProceed) return;

    const section = this.selectedSection();
    if (section) course.section = section;
    else {
      this.showSnackbar('Please select a section for this course.');
      return;
    }

    if (this.isCourseAlreadyAdded(course)) {
      this.selectedSection.set(undefined);
      this.showSnackbar('You already selected this course.');
      return;
    }

    const preferredDays = this.daysOfWeek.map((day) => {
      const existing = course.preferred_days?.find((d: any) => d.day === day);
      return {
        day,
        start_time: this.formatTimeForPayload(existing?.start_time ?? ''),
        end_time: this.formatTimeForPayload(existing?.end_time ?? ''),
      };
    });

    const newCourse: TableData = {
      ...course,
      preferredDays,
      isSubmitted: false, // Wait for admin to set time
      program_details: this.selectedProgram(),
      year_section: `${course.year_level}-${course.section.section_name}`
    };

    this.selectedCourse.set(null);
    this.selectedSection.set(undefined);
    this.allSelectedCourses.update((courses) => [...courses, newCourse]);
    this.showSnackbar(`${course.course_code} successfully added to preferences.`);
  }

  private async populatePossiblePrograms(course: Course): Promise<void> {
    const possiblePrograms: any[] = [];
    this.selectedCourse.set(course);
    this.searchState.set('courseList');

    this.programs().forEach((program: any) => {
      const hasCourse = program.year_levels.some((yearLevel: any) =>
        yearLevel.semester.courses.some((c: any) => this.isSameCourseOffering(c, course))
      );
      if (hasCourse) possiblePrograms.push(program);
    });

    if (possiblePrograms.length === 1) {
      await this.selectPossibleProgram(possiblePrograms[0]);
      return;
    }

    this.showPossiblePrograms.set(true);
    this.searchState.set('programSelection');
    this.possiblePrograms.set(possiblePrograms);
  }

  public async selectPossibleProgram(program: any): Promise<void> {
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
      if (courseAdded) break;
    }

    if (this.searchQuery() !== '') this.searchState.set('searchResults');
    else this.searchState.set('courseList');
  }

  private async willSelectAnotherSection(course: Course): Promise<boolean> {  
    if (this.selectedSection() !== undefined) return true;
    const yearLevels = this.selectedProgram()?.year_levels;
    if (course.year_level == null) return true;

    const targetYear = yearLevels?.find((yl: any) => yl.year_level === course.year_level);
    if (!targetYear) return true;

    const maxSections = targetYear.sections?.length ?? 0;
    if (maxSections <= 1) {
      const firstSection = targetYear.sections[0];
      if (firstSection) this.selectedSection.set(firstSection);
      return true;
    }

    const dialogRef = this.dialog.open(DialogPrefSectionComponent, {
      width: 'min(480px, 95vw)',
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

  public removeCourse(course: TableData): void {
    if (course.isSubmitted) {
      this.removeSubmittedCourse(course);
    } else {
      this.allSelectedCourses.update((courses: TableData[]) => courses.filter((c: TableData) => this.getSelectionKey(c) !== this.getSelectionKey(course)));
    }
  }

  private removeSubmittedCourse(course: TableData) {
    const hasPreferredTime = course.preferredDays.some((day: any) => day.start_time && day.end_time);
    if (hasPreferredTime) {
      const dialogRef = this.dialog.open(DialogGenericComponent, {
        data: {
          title: 'Remove Preference',
          content: `Are you sure you want to remove "${course.course_code}"? This action cannot be undone.`,
          actionText: 'Remove',
          cancelText: 'Cancel',
          action: 'Remove',
        },
        panelClass: 'dialog-base',
        autoFocus: true,
      });
      dialogRef.afterClosed().subscribe((result) => {
        if (result === 'Remove') this.proceedWithRemoval(course);
      });
    } else {
      this.proceedWithRemoval(course);
    }
  }

  private proceedWithRemoval(course: TableData) {
    const preferenceId = this.getPreferenceId(course);
    const { section_id } = course.section;
    if (!this.data.faculty_id || !this.activeSemesterId()) {
      this.showSnackbar('Error: Missing faculty or semester information.');
      return;
    }
    if (!preferenceId) {
      this.showSnackbar('Error: Missing preference identifier.');
      return;
    }

    this.isRemoving.update((value) => ({ ...value, [course.course_code]: true }));

    this.preferencesService
      .deletePreference(preferenceId, this.data.faculty_id.toString(), this.activeSemesterId()!, section_id ?? 0)
      .subscribe({
        next: () => {
          this.allSelectedCourses.update((courses: TableData[]) => courses.filter((c: TableData) => this.getSelectionKey(c) !== this.getSelectionKey(course)));
          this.isRemoving.update((value) => {
            const updatedValue = { ...value };
            delete updatedValue[course.course_code];
            return updatedValue;
          });
          this.showSnackbar(`${course.course_code} has been removed from preferences.`);
        },
        error: (error) => {
          this.showSnackbar(`Error removing ${course.course_code}.`);
          this.isRemoving.update((value) => ({ ...value, [course.course_code]: false }));
        },
      });
  }

  private isCourseAlreadyAdded(course: Course): boolean {
    return this.allSelectedCourses().some((subject: TableData) => this.getSelectionKey(subject) === this.getSelectionKey(course));
  }

  private getCourseIdentityKey(course: Course): string {
    if (course.is_temporary && course.temporary_type === 'bridging') return `bridging-${course.course_code.toLowerCase()}`;
    if (course.temporary_course_offering_id) return `temp-${course.temporary_course_offering_id}`;
    return `course-${course.course_code.toLowerCase()}`;
  }

  private isSameCourseOffering(candidate: Course, target: Course): boolean {
    if ((candidate.is_temporary && candidate.temporary_type === 'bridging') || (target.is_temporary && target.temporary_type === 'bridging')) {
      return candidate.course_code === target.course_code;
    }
    if (target.temporary_course_offering_id) return candidate.temporary_course_offering_id === target.temporary_course_offering_id;
    return candidate.course_code === target.course_code;
  }

  private getCourseListKey(course: Course): string {
    return this.getCourseIdentityKey(course);
  }

  private getSelectionKey(course: Course, programCode?: string | null): string {
    const base = this.getCourseIdentityKey(course);
    const sectionId = course.section?.section_id ?? 'none';
    const programPart = programCode ? `-program-${programCode}` : '';
    return `${base}${programPart}-section-${sectionId}`;
  }

  private getPreferenceId(course: Course): number | null {
    if (course.temporary_course_offering_id) return course.temporary_course_offering_id;
    return course.course_assignment_id ?? course.preferences_id ?? null;
  }

  public openDayTimeDialog(element: TableData): void {
    this.dialog
      .open(DialogDayTimeComponent, {
        data: {
          selectedDays: element.preferredDays,
          courseCode: element.course_code,
          courseTitle: element.course_title,
          facultyId: this.data.faculty_id.toString(),
          activeSemesterId: this.activeSemesterId(),
          courseAssignmentId: element.course_assignment_id,
          temporaryCourseOfferingId: element.temporary_course_offering_id ?? null,
          section_id: element.section.section_id,
          allSelectedCourses: this.allSelectedCourses(),
        },
        autoFocus: true,
      })
      .afterClosed()
      .subscribe((result) => {
        if (result) {
          const courseIndex = this.allSelectedCourses().findIndex((c: TableData) => this.getSelectionKey(c) === this.getSelectionKey(element));
          if (courseIndex !== -1) {
            this.allSelectedCourses.set(this.allSelectedCourses().map((course: TableData, index: number) =>
                index === courseIndex ? { ...course, preferredDays: result.days, isSubmitted: true } : course
            ));
          }
        }
      });
  }

  public getTooltipText(element: TableData): string {
    return element.preferredDays.some((pd: any) => pd.start_time && pd.end_time) ? 'Click to modify schedule' : '';
  }

  public formatSelectedDaysAndTime(element: TableData): string {
    const filteredDays = element.preferredDays.filter((pd: any) => pd.start_time && pd.end_time);
    if (filteredDays.length === 0) return 'Click to select day and time';

    const presentDays = filteredDays.map((pd: any) => pd.day);
    const has_any_day = this.daysOfWeek.every((day: string) => presentDays.includes(day));
    const has_any_time = filteredDays.every((pd: any) => pd.start_time === '07:00:00' && pd.end_time === '21:00:00');

    if (has_any_day && has_any_time) return 'Any Day, Any Time';
    if (has_any_day) return `Any Day, ${this.formatTime(filteredDays[0].start_time)} - ${this.formatTime(filteredDays[0].end_time)}`;
    if (has_any_time) return `${filteredDays.sort((a: any, b: any) => this.daysOfWeek.indexOf(a.day) - this.daysOfWeek.indexOf(b.day)).map((pd: any) => pd.day).join(', ')}, Any Time`;

    const grouped: { [key: string]: typeof filteredDays } = {};
    filteredDays.forEach((pd: any) => {
      if (!grouped[pd.day]) grouped[pd.day] = [];
      grouped[pd.day].push(pd);
    });

    return Object.keys(grouped)
      .sort((a, b) => this.daysOfWeek.indexOf(a) - this.daysOfWeek.indexOf(b))
      .map((dayName) => {
        const slots = grouped[dayName].sort((a: any, b: any) => a.start_time.localeCompare(b.start_time));
        const formattedSlots = slots.map((pd: any) => `${this.formatTime(pd.start_time)} - ${this.formatTime(pd.end_time)}`).join(', ');
        return `${dayName} (${formattedSlots})`;
      }).join('\n');
  }

  public formatPreferredDaysAndTime(course: Course): string {
    if (!course.preferred_days || course.preferred_days.length === 0) return 'Not Set';
    
    const filteredDays = course.preferred_days.filter((pd: any) => pd.start_time && pd.end_time);
    if (filteredDays.length === 0) return 'Not Set';

    const presentDays = filteredDays.map((pd: any) => pd.day);
    const has_any_day = this.daysOfWeek.every((day: string) => presentDays.includes(day));
    const has_any_time = filteredDays.every((pd: any) => pd.start_time === '07:00:00' && pd.end_time === '21:00:00');

    if (has_any_day && has_any_time) return 'Any Day, Any Time';
    if (has_any_day) return `Any Day, ${this.formatTime(filteredDays[0].start_time)} - ${this.formatTime(filteredDays[0].end_time)}`;
    if (has_any_time) return `${filteredDays.sort((a: any, b: any) => this.daysOfWeek.indexOf(a.day) - this.daysOfWeek.indexOf(b.day)).map((pd: any) => pd.day).join(', ')}, Any Time`;

    const grouped: { [key: string]: typeof filteredDays } = {};
    filteredDays.forEach((pd: any) => {
      if (!grouped[pd.day]) grouped[pd.day] = [];
      grouped[pd.day].push(pd);
    });

    return Object.keys(grouped)
      .sort((a, b) => this.daysOfWeek.indexOf(a) - this.daysOfWeek.indexOf(b))
      .map((dayName) => {
        const slots = grouped[dayName].sort((a: any, b: any) => a.start_time.localeCompare(b.start_time));
        const formattedSlots = slots.map((pd: any) => `${this.formatTime(pd.start_time)} - ${this.formatTime(pd.end_time)}`).join(', ');
        return `${dayName} (${formattedSlots})`;
      }).join('\n');
  }

  private formatTime(time: string): string {
    if (!time) return '';
    if (time.includes('AM') || time.includes('PM')) return time;
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  }

  public formatTimeForPayload(time?: string | null): string {
    if (!time) return '';
    if (!time.includes('AM') && !time.includes('PM')) return time;
    const [timePart, modifier] = time.split(' ');
    let [hours, minutes] = timePart.split(':').map(Number);
    hours = (hours % 12) + (modifier === 'PM' ? 12 : 0);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
  }

  // --- ELECTIVE RESOLUTION ---

  private loadElectiveNameMap(programs: any[], academicYearId: number): void {
    const curriculumYears = new Set<string>();
    programs.forEach((p: any) => p.year_levels.forEach((yl: any) => {
        if (yl.curriculum_year) curriculumYears.add(yl.curriculum_year);
    }));

    if (curriculumYears.size === 0 || !academicYearId) return;

    const newMap = new Map<string, Elective>();
    let pending = curriculumYears.size;

    curriculumYears.forEach((year: string) => {
      this.preferencesService.getResolvedCurriculumElectives(year, academicYearId).subscribe({
            next: (response: any) => {
              (response.electives || []).forEach((ce: any) => {
                if (ce.elective) newMap.set(ce.elective_slot_name, ce.elective);
              });
              pending--;
              if (pending === 0) this.electiveNameMap.set(newMap);
            },
            error: () => {
              pending--;
              if (pending === 0) this.electiveNameMap.set(newMap);
            }
          });
    });
  }

  public getResolvedElective(course: Course): Elective | null {
    const title = course.course_title;
    const isElective = title.toLowerCase().includes('elective');
    if (!isElective) return null;
    return this.electiveNameMap().get(title) ?? null;
  }

  public getDisplayCode(course: Course): string {
    const resolved = this.getResolvedElective(course);
    return resolved ? resolved.course_code : course.course_code;
  }

  public getDisplayTitle(course: Course): string {
    const resolved = this.getResolvedElective(course);
    return resolved ? resolved.course_title : course.course_title;
  }


  // --- VIEW / PDF / HISTORY SWITCHING ---

  onViewChange(): void {
    if (this.selectedView === 'pdf-view') {
      this.generateAndDisplayPdf();
    } else if (this.selectedView === 'set-preferences') {
      if (this.programs().length === 0) this.loadProgramsForSelection();
    } else {
      this.pdfBlobUrl = null;
    }
  }

  onSemesterChange(event?: any): void {
    let semesterId: number | null = null;
    
    if (event && event.value !== undefined) {
      semesterId = Number(event.value);
    } else if (typeof event === 'number') {
      semesterId = event;
    } else if (this.selectedHistory && (this.selectedHistory.semester_id || this.selectedHistory.semester_id === 0)) {
      semesterId = Number(this.selectedHistory.semester_id);
    } else if (this.selectedSemester) {
      semesterId = Number(this.selectedSemester);
    }

    if (!semesterId) return;

    this.selectedSemester = semesterId;
    if (this.selectedHistory) this.academicYear = this.selectedHistory.academic_year;
    this.updateTableFromSelection();
  }

  onAcademicYearChange(event?: any) {    
    let yearObj: any = null;

    if (event && event.value !== undefined) yearObj = event.value;
    else if (event && typeof event === 'object' && event.academic_year_id) yearObj = event;
    else if (this.selectedHistory && this.selectedHistory.academic_year_id) yearObj = this.selectedHistory;
    else if (this.selectedYear) yearObj = this.academicYearList.find(y => y.academic_year_id === this.selectedYear) ?? null;

    if (!yearObj) return;

    this.selectedYear = yearObj.academic_year_id;
    this.selectedHistory = yearObj;
    this.academicYear = yearObj.academic_year;
    this.updateTableFromSelection();
  }

  private updateTableFromSelection(): void {
    if (!this.selectedYear || !this.selectedSemester) return;
    this.isLoading = true;

    const ay = this.academicYearList.find((y) => y.academic_year_id === this.selectedYear);
    if (ay) this.academicYear = ay.academic_year;
    if (!ay) { this.isLoading = false; return; }

    const semesters: any[] = (ay as any).semesters ?? (ay as any).semester ?? [];
    const sem = semesters.find((s: any) => s.semester_id === this.selectedSemester || s.semester_number === String(this.selectedSemester));

    if (!sem) { this.isLoading = false; return; }

    const sourceCourses = sem.courses ?? sem.preferences ?? [];
    this.semesterLabel = sem.semester_label ?? (sem.semester_number === 1 || sem.semester_id === 1 ? 'First Semester' : sem.semester_number === 2 || sem.semester_id === 2 ? 'Second Semester' : sem.semester_number === 3 || sem.semester_id === 3 ? 'Summer Semester' : '');

    this.courses = sourceCourses.map((course: any) => ({
      course_code: course.course_details?.course_code ?? course.course_code ?? 'N/A',
      course_title: course.course_details?.course_title ?? course.course_title ?? 'N/A',
      lec_hours: course.lec_hours ?? 0,
      lab_hours: course.lab_hours ?? 0,
      units: course.units ?? 0,
      preferred_days: course.preferred_days ?? course.preferredDays ?? [],
      year_section: `${course.course_details?.year_level ?? 'N/A'}-${course.section_details?.section_name ?? 'N/A'}`,
      program_code: course.course_details?.program_code ?? course.program_details?.program_code ?? null,
      preferences_id: course.preferences_id,
      is_ignored: course.is_ignored,
      is_temporary: course.is_temporary ?? course.course_details?.is_temporary ?? false,
      temporary_type: course.temporary_type ?? course.course_details?.temporary_type ?? null,
      temporary_status: course.temporary_status ?? course.course_details?.temporary_status ?? null,
      petition_required: course.petition_required ?? course.course_details?.petition_required ?? null,
      original_course_code: course.original_course_code ?? course.course_details?.original_course_code,
      elective_slot_name: course.elective_slot_name ?? course.course_details?.elective_slot_name,
    }));

    this.isLoading = false;
  }

  private preselectHistoryDefault(): void {
    if (!this.academicYearList?.length) return;
    const firstAy = this.academicYearList[0];
    const semesters = (firstAy as any).semesters ?? (firstAy as any).semester ?? [];
    
    const firstSem = semesters.find((s: any) => (s.preferences ?? s.courses ?? []).length > 0) ?? semesters[0];
    if (!firstSem) return;

    this.selectedHistory = firstAy;
    this.selectedYear = firstAy.academic_year_id;
    this.selectedSemester = firstSem.semester_id;
    this.updateTableFromSelection();
  }

  generateAndDisplayPdf(): void {
    const pdfBlob = this.generateFacultyPDF(false, [this.courses], true);
    if (pdfBlob instanceof Blob) {
      const blobUrl = URL.createObjectURL(pdfBlob);
      this.pdfBlobUrl = this.sanitizer.bypassSecurityTrustResourceUrl(blobUrl);
    } else {
      this.showSnackbar('Failed to generate PDF preview.');
    }
  }

  downloadPdf(): void {
    const pdfBlob = this.generateFacultyPDF(false, [this.courses], false);
    if (pdfBlob instanceof Blob) {
      const fileName = `${this.sanitizeFileName(this.facultyName)}_preferences_report.pdf`;
      saveAs(pdfBlob, fileName);
    }
  }

  public async downloadExcel(): Promise<void> {
    if (this.data.generateExcelFunction) {
      try { await this.data.generateExcelFunction(); } catch (error) { console.error('Error executing parent Excel function:', error); }
      return;
    }

    if (!this.courses || this.courses.length === 0) {
      this.showSnackbar('No preferences available to export.');
      return;
    }

    const workbook = new ExcelJS.Workbook();
    const tabName = this.facultyName.split(',')[0].substring(0, 31).replace(/[^\w\s-]/gi, '');
    const worksheet = workbook.addWorksheet(tabName);

    worksheet.pageSetup = {
      orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 }
    };

    worksheet.columns = [
      { width: 5 },  { width: 15 }, { width: 20 }, { width: 15 }, { width: 35 }, { width: 8 },  { width: 8 },  { width: 8 },  { width: 30 } 
    ];

    worksheet.mergeCells('A1:D1'); worksheet.mergeCells('E1:I1');
    worksheet.mergeCells('A2:D2'); worksheet.mergeCells('E2:I2');

    worksheet.getCell('A1').value = `Faculty Name: ${this.facultyName.toUpperCase()}`;
    worksheet.getCell('E1').value = ``; 
    worksheet.getCell('A2').value = `Academic Year: ${this.academicYear}`;
    worksheet.getCell('E2').value = `Semester: ${this.semesterLabel}`;

    ['A1', 'E1', 'A2', 'E2'].forEach(c => {
      const cell = worksheet.getCell(c);
      cell.font = { bold: true };
      cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
    });

    worksheet.addRow([]);
    const headerRow = worksheet.addRow(['#', 'Program Code', 'Year & Section', 'Course Code', 'Course Title', 'Lec', 'Lab', 'Units', 'Preferred Day & Time']);
    headerRow.height = 25;
    headerRow.eachCell(cell => {
      cell.font = { bold: true };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
    });

    this.courses.forEach((course: Course, index: number) => {
      const scheduleString = this.formatDaysExcel(course).replace(/\n/g, ', ');
      const displayCode = course.original_course_code ? `${course.course_code} (${course.original_course_code})` : course.course_code;

      const row = worksheet.addRow([
        index + 1, course.program_code || '—', course.year_section || '—', displayCode, course.course_title,
        course.lec_hours || 0, course.lab_hours || 0, course.units || 0,
        scheduleString === 'Click to select day and time' || !scheduleString ? 'Not Set' : scheduleString
      ]);

      row.eachCell((cell, colNum) => {
        cell.alignment = { vertical: 'middle', horizontal: colNum === 5 || colNum === 9 ? 'left' : 'center', wrapText: true };
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const safeName = this.sanitizeFileName(this.facultyName);
    saveAs(blob, `${safeName}_Preferences_${this.academicYear.replace('/', '_')}.xlsx`);
  }

  private formatDaysExcel(course: Course): string {
     const filteredDays = course.preferred_days.filter((pd: any) => pd.start_time && pd.end_time);
     if (filteredDays.length === 0) return '';
 
     const presentDays = filteredDays.map((pd: any) => pd.day);
     const has_any_day = this.daysOfWeek.every((day: string) => presentDays.includes(day));
     const has_any_time = filteredDays.every((pd: any) => pd.start_time === '07:00:00' && pd.end_time === '21:00:00');
 
     if (has_any_day && has_any_time) return 'Any Day, Any Time';
     if (has_any_day) return `Any Day, ${this.formatTime(filteredDays[0].start_time)} - ${this.formatTime(filteredDays[0].end_time)}`;
     if (has_any_time) return `${filteredDays.sort((a: any, b: any) => this.daysOfWeek.indexOf(a.day) - this.daysOfWeek.indexOf(b.day)).map((pd: any) => pd.day).join(', ')}, Any Time`;
 
     const grouped: { [key: string]: typeof filteredDays } = {};
     filteredDays.forEach((pd: any) => {
       if (!grouped[pd.day]) grouped[pd.day] = [];
       grouped[pd.day].push(pd);
     });
 
     return Object.keys(grouped).sort((a, b) => this.daysOfWeek.indexOf(a) - this.daysOfWeek.indexOf(b)).map((dayName) => {
         const slots = grouped[dayName].sort((a: any, b: any) => a.start_time.localeCompare(b.start_time));
         const formattedSlots = slots.map((pd: any) => `${this.formatTime(pd.start_time)} - ${this.formatTime(pd.end_time)}`).join(', ');
         return `${dayName} (${formattedSlots})`;
     }).join('\n');
  }

  public toggleIgnore(course: Course): void {
    if (!this.data.isAdmin || !course.preferences_id) return;
    const action = course.is_ignored ? 'restoring' : 'ignoring';
    this.showSnackbar(`Please wait, ${action} preference...`);

    this.preferencesService.toggleIgnorePreference(course.preferences_id, this.data.faculty_id.toString())
      .subscribe({
        next: (response) => {
          course.is_ignored = response.is_ignored;
          this.showSnackbar(response.message || `Preference successfully ${course.is_ignored ? 'ignored' : 'restored'}.`);
        },
        error: (error) => {
          this.showSnackbar(error.error?.message || error.message || `Failed to ${course.is_ignored ? 'restore' : 'ignore'} preference.`);
        }
      });
  }

  closeDialog(): void {
    this.dialogRef.close();
  }

  generateFacultyPDF(isAll: boolean, coursesArray: Course[][], showPreview: boolean = false): Blob {
    const doc = new jsPDF('p', 'mm', 'a4') as any;
    let currentY = 15;

    try {
      this.reportHeaderService.addHeader(doc, isAll ? 'All Faculty Preferences Report' : 'Faculty Preferences Report', currentY).subscribe((newY: number) => {
          currentY = newY;
          this.reportHeaderService.addStandardFooter(doc);

          coursesArray.forEach((courses: Course[]) => {
            if (!courses || courses.length === 0) return;

            doc.setFontSize(12); doc.setFont('helvetica', 'normal');
            const facultyInfo = [
              `Faculty Name: ${this.facultyName}`,
              `Academic Year: ${this.academicYear}`,
              `Semester: ${this.semesterLabel}`,
            ];

            facultyInfo.forEach((info) => { doc.text(info, 10, currentY); currentY += 5; });
            currentY += 5;

            const courseData = courses.map((course: Course, index: number) => {
              const displayCode = course.original_course_code ? `${course.course_code} (${course.original_course_code})` : (course.course_code || 'N/A');
              return [
                (index + 1).toString(), course.program_code || 'N/A', course.year_section || 'N/A', displayCode, course.course_title || 'N/A',
                course.lec_hours.toString(), course.lab_hours.toString(), course.units.toString(), this.formatDaysExcel(course),
              ];
            });

            const tableHead = [['#', 'Program Code', 'Year & Section', 'Course Code', 'Course Title', 'Lec', 'Lab', 'Units', 'Preferred Day & Time']];
            const tableConfig = {
              startY: currentY, head: tableHead, body: courseData, theme: 'grid',
              headStyles: { fillColor: [128, 0, 0], textColor: [255, 255, 255], fontSize: 9 },
              bodyStyles: { fontSize: 8, textColor: [0, 0, 0] },
              styles: { lineWidth: 0.1, overflow: 'linebreak', cellPadding: 2 },
              columnStyles: {
                0: { cellWidth: 8 }, 1: { cellWidth: 18 }, 2: { cellWidth: 18 }, 3: { cellWidth: 30 }, 4: { cellWidth: 40 },
                5: { cellWidth: 13 }, 6: { cellWidth: 13 }, 7: { cellWidth: 13 }, 8: { cellWidth: 35 }
              },
              margin: { left: 10, right: 10 },
            };

            (doc as any).autoTable(tableConfig);
            currentY = (doc as any).lastAutoTable.finalY + 10;
            if (currentY > 270) {
              doc.addPage();
              this.reportHeaderService.addHeader(doc, isAll ? 'All Faculty Preferences Report' : 'Faculty Preferences Report', 15).subscribe((newPageY: number) => {
                  currentY = newPageY;
                  this.reportHeaderService.addStandardFooter(doc);
              });
            }
          });

          this.reportHeaderService.addStandardFooter(doc);
        });

      return doc.output('blob');
    } catch (error) {
      console.error('Failed to generate PDF:', error);
      throw error;
    }
  }

  private showSnackbar(message: string): void {
    this.snackBar.open(message, 'Close', { duration: 3000, panelClass: ['error-snackbar'] });
  }

  sanitizeFileName(fileName: string): string {
    return fileName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  }

  public getTemporaryBadgeText(course: Course): string {
    if (!course.is_temporary) return '';
    const typeLabel = this.formatTemporaryType(course.temporary_type);
    return typeLabel ? `Temporary (${typeLabel})` : 'Temporary';
  }

  public getTemporaryTooltip(course: Course): string {
    if (!course.is_temporary) return '';
    const parts: string[] = [this.getTemporaryBadgeText(course)];
    if (course.temporary_status) parts.push(`Status: ${this.formatTemporaryType(course.temporary_status)}`);
    if (course.petition_required) parts.push('Petition required');
    return parts.join(' | ');
  }

  private formatTemporaryType(type?: string | null): string {
    if (!type) return '';
    return type.toString().replace(/[_-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
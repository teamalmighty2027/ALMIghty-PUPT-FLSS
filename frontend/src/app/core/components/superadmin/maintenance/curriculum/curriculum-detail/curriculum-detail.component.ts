import { Component, OnInit, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';

import { forkJoin, Observable, Subject } from 'rxjs';
import { finalize, switchMap, takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';

import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';

import { TableGenericComponent } from '../../../../../../shared/table-generic/table-generic.component';
import { TableHeaderComponent, InputField } from '../../../../../../shared/table-header/table-header.component';
import {
  TableDialogComponent,
  DialogConfig,
} from '../../../../../../shared/table-dialog/table-dialog.component';
import { DialogExportComponent } from '../../../../../../shared/dialog-export/dialog-export.component';
import { LoadingComponent } from '../../../../../../shared/loading/loading.component';
import { fadeAnimation, pageFloatUpAnimation } from '../../../../../animations/animations';

import {
  CurriculumService,
  Curriculum,
  Program,
  YearLevel,
  Semester,
  Course,
  BridgingCourse,
  CourseWithRequirements,
  CourseRequirementLink,
} from '../../../../../services/superadmin/curriculum/curriculum.service';
import { ReportHeaderService } from '../../../../../services/report-header/report-header.service';

import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

interface TableCell {
  content: string;
  colSpan?: number;
}

@Component({
  selector: 'app-curriculum-detail',
  imports: [
    CommonModule,
    TableGenericComponent,
    TableHeaderComponent,
    LoadingComponent,
  ],
  templateUrl: './curriculum-detail.component.html',
  styleUrls: ['./curriculum-detail.component.scss'],
  animations: [fadeAnimation, pageFloatUpAnimation],
})
export class CurriculumDetailComponent implements OnInit, OnDestroy {
  public curriculum: Curriculum | undefined;

  public selectedProgram: string | number = 'All';
  public selectedYear: string | number = 'All';
  public selectedSemester: string | number = 'All';
  public searchQuery: string = '';
  
  public renderGroups: any[] = []; 
  
  public customExportOptions: { all: string; current: string } | null = null;
  private destroy$ = new Subject<void>();
  private searchQuery$ = new Subject<string>();
  public showPreview: boolean = false;
  public isLoading: boolean = true;
  public isManagingPrograms: boolean = false;
  public isManagingBridging: boolean = false;
  public isLoadingBridging: boolean = false;
  public bridgingCourses: Array<
    BridgingCourse & { pre_req: string; co_req: string }
  > = [];

  headerInputFields: InputField[] = [];

  columns = [
    { key: 'index', label: '#' },
    { key: 'course_code', label: 'Course Code' },
    { key: 'pre_req', label: 'Pre-requisites' },
    { key: 'co_req', label: 'Co-requisites' },
    { key: 'course_title', label: 'Course Title' },
    { key: 'lec_hours', label: 'Lec Hours' },
    { key: 'lab_hours', label: 'Lab Hours' },
    { key: 'units', label: 'Units' },
    { key: 'tuition_hours', label: 'Tuition Hours' },
  ];

  displayedColumns: string[] = [
    'index',
    'course_code',
    'pre_req',
    'co_req',
    'course_title',
    'lec_hours',
    'lab_hours',
    'units',
    'tuition_hours',
    'action',
  ];

  bridgingColumns = [
    { key: 'index', label: '#' },
    { key: 'course_code', label: 'Course Code' },
    { key: 'pre_req', label: 'Pre-requisites' },
    { key: 'co_req', label: 'Co-requisites' },
    { key: 'course_title', label: 'Course Title' },
    { key: 'lec_hours', label: 'Lec Hours' },
    { key: 'lab_hours', label: 'Lab Hours' },
    { key: 'units', label: 'Units' },
    { key: 'tuition_hours', label: 'Tuition Hours' },
  ];

  bridgingDisplayedColumns: string[] = [
    'index',
    'course_code',
    'pre_req',
    'co_req',
    'course_title',
    'lec_hours',
    'lab_hours',
    'units',
    'tuition_hours',
    'action',
  ];

  constructor(
    private route: ActivatedRoute,
    private curriculumService: CurriculumService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef,
    private reportHeaderService: ReportHeaderService,
  ) {}

  ngOnInit() {
    const curriculumYear = this.route.snapshot.paramMap.get('year');

    // Setup debounced search
    this.searchQuery$
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      )
      .subscribe((query) => {
        this.searchQuery = query;
        this.updateRenderGroups();
      });

    if (curriculumYear) this.fetchCurriculum(curriculumYear);
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // isSilentRefresh flag to prevent full page reload
  fetchCurriculum(year: string, isSilentRefresh: boolean = false) {
    if (!isSilentRefresh) {
      this.isLoading = true;
    }

    this.curriculumService
      .getCurriculumByYear(year)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (curriculum) => {
          if (curriculum) {
            this.curriculum = curriculum;
            this.updateHeaderInputFields();
            this.updateRenderGroups();
            this.updateCustomExportOptions();
            this.loadBridgingCourses();
            this.cdr.markForCheck();
          }
          this.isLoading = false; // Clear loading overlay
        },
        error: (error) => {
          console.error('Error fetching curriculum:', error);
          this.snackBar.open(
            `Error fetching curriculum: ${error.message || 'Please try again.'}`,
            'Close',
            { duration: 3000 },
          );
          this.isLoading = false;
        },
      });
  }

  updateHeaderInputFields() {
    const programOptions = [
      { key: 'All', label: 'All Programs' },
      ...(this.curriculum?.programs.map((p) => ({
        key: p.curricula_program_id,
        label: `${p.name} - ${p.program_title}`,
      })) || [])
    ];

    let yearLevelOptions: any[] = [{ key: 'All', label: 'All Year Levels' }];

    if (this.selectedProgram !== 'All') {
      const selectedProgramData = this.curriculum?.programs.find(
        (p) => p.curricula_program_id === Number(this.selectedProgram)
      );

      if (selectedProgramData) {
        const programYears = Array.from(
          new Set(
            (selectedProgramData.year_levels || []).map((level) => level.year)
          )
        ).sort((a, b) => a - b);

        const yearOptions = programYears.length
          ? programYears.map((year) => ({ key: year, label: `Year ${year}` }))
          : Array.from({ length: selectedProgramData.number_of_years }, (_, i) => ({
              key: i + 1,
              label: `Year ${i + 1}`,
            }));

        yearLevelOptions = [{ key: 'All', label: 'All Year Levels' }, ...yearOptions];
      }

    } else {
      yearLevelOptions = [
        { key: 'All', label: 'All Year Levels' },
        { key: 1, label: 'Year 1' }, { key: 2, label: 'Year 2' },
        { key: 3, label: 'Year 3' }, { key: 4, label: 'Year 4' }, { key: 5, label: 'Year 5' }
      ];
    }

    const semesterOptions: any[] = [
      { key: 'All', label: 'All Semesters' },
      { key: 1, label: '1st Semester' },
      { key: 2, label: '2nd Semester' },
      { key: 3, label: 'Summer Term' }
    ];

    this.headerInputFields = [
      { type: 'text', label: 'Search Course', key: 'courseSearch', placeholder: 'Search by code or title' },
      { type: 'select', label: 'Program', key: 'program', options: programOptions },
      { type: 'select', label: 'Year Level', key: 'yearLevel', options: yearLevelOptions },
      { type: 'select', label: 'Semester', key: 'semester', options: semesterOptions },
    ];
  }

  updateCustomExportOptions() {
    let currentLabel = 'Export current view';

    if (this.selectedProgram !== 'All') {
      const selectedProg = this.curriculum?.programs.find(
        (p) => p.curricula_program_id === Number(this.selectedProgram)
      );
      currentLabel = `Export ${selectedProg?.name || 'Program'} curriculum`;
    }

    this.customExportOptions = {
      all: 'Export entire curriculum (All Programs)',
      current: currentLabel,
    };
    this.cdr.detectChanges();
  }

  updateRenderGroups() {
    if (!this.curriculum) return;

    let groups: any[] = [];
    const searchLower = this.searchQuery.toLowerCase().trim();

    const programsToProcess = this.selectedProgram === 'All'
      ? this.curriculum.programs
      : this.curriculum.programs.filter(p => p.curricula_program_id === Number(this.selectedProgram));

    for (const prog of programsToProcess) {
      const yearsToProcess = this.selectedYear === 'All'
        ? prog.year_levels
        : prog.year_levels.filter(y => y.year === Number(this.selectedYear));

      for (const yl of yearsToProcess) {
        const semestersToProcess = this.selectedSemester === 'All'
          ? yl.semesters
          : yl.semesters.filter(s => s.semester === Number(this.selectedSemester));

        for (const sem of semestersToProcess) {
          let heading = this.getSemesterDisplay(sem.semester);

          if (this.selectedProgram === 'All' || this.selectedYear === 'All') {
             heading = `${prog.name} - Year ${yl.year} - ${heading}`;
          }

          const processedCourses = sem.courses
            .filter(course => {
              // If no search query, include all courses
              if (!searchLower) return true;
              // Filter by course code or course title
              const courseCodeMatch = course.course_code.toLowerCase().includes(searchLower);
              const courseTitleMatch = course.course_title.toLowerCase().includes(searchLower);
              return courseCodeMatch || courseTitleMatch;
            })
            .map(course => ({
              ...course,
              pre_req: course.prerequisites?.map(p => p.course_code).join(', ') || 'None',
              co_req: course.corequisites?.map(c => c.course_code).join(', ') || 'None',
            }));

          // Only add group if it has courses after filtering
          if (processedCourses.length > 0) {
            groups.push({
              id: `${prog.curricula_program_id}-${yl.year}-${sem.semester}`,
              heading: heading,
              courses: processedCourses,
              originalSemester: sem,
              program: prog,
              yearLevel: yl
            });
          }
        }
      }
    }

    this.renderGroups = groups;
    this.cdr.detectChanges();
  }

  onInputChange(values: { [key: string]: any }) {
    let refreshBridging = false;
    let needsRender = false;

    if (values['courseSearch'] !== undefined) {
      // Emit to debounced search subject instead of directly updating
      this.searchQuery$.next(values['courseSearch']);
    }

    const programChanged =
      values['program'] !== undefined && values['program'] !== this.selectedProgram;
    const yearChanged =
      values['yearLevel'] !== undefined && values['yearLevel'] !== this.selectedYear;
    const semesterChanged =
      values['semester'] !== undefined && values['semester'] !== this.selectedSemester;

    if (programChanged) {
      this.selectedProgram = values['program'];
      this.selectedYear = 'All';
      this.selectedSemester = 'All';
      refreshBridging = true;
      needsRender = true;
    } else {
      if (yearChanged) {
        this.selectedYear = values['yearLevel'];
        refreshBridging = true;
        needsRender = true;
      }

      if (semesterChanged) {
        this.selectedSemester = values['semester'];
        refreshBridging = true;
        needsRender = true;
      }
    }

    // Update header and render if any filter (except search) changed
    if (needsRender) {
      this.updateHeaderInputFields();
      this.updateRenderGroups();
      this.updateCustomExportOptions();
    }

    if (refreshBridging) {
      this.loadBridgingCourses();
    }
  }

  // ===========================
  // Duplicate Detection Logic
  // ===========================
  isCourseDuplicate(courseCode: string, excludeCourseId?: number, isBridging: boolean = false): boolean {
    if (!this.curriculum || isBridging) return false;
    
    const codeToCheck = courseCode.trim().toLowerCase();

    return this.curriculum.programs.some(prog =>
      prog.year_levels.some(yl =>
        yl.semesters.some(sem =>
          sem.courses.some(c =>
            c.course_code.trim().toLowerCase() === codeToCheck && 
            c.course_id !== excludeCourseId // Ignore the current course if editing
          )
        )
      )
    );
  }

  // ===========================
  // Course Management
  // ===========================
  onEditCourse(course: Course, group: any) {
    const dialogConfig = this.getCourseDialogConfig(course, undefined, group);
    const dialogRef = this.dialog.open(TableDialogComponent, {
      data: dialogConfig,
      disableClose: true,
      autoFocus: true,
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        
        // Check for duplicates before updating
        if (this.isCourseDuplicate(result.course_code, course.course_id)) {
          this.snackBar.open(`Error: Course Code '${result.course_code}' is already used in this curriculum!`, 'Close', { duration: 4000 });
          return;
        }

        const preReqIds = this.mapTitlesToIds(result.pre_req);
        const coReqIds = this.mapTitlesToIds(result.co_req);

        const updatedCourse = {
          ...result,
          curriculum_id: this.curriculum?.curriculum_id,
          semester_id: group.originalSemester.semester_id,
          year_level_id: group.yearLevel.year_level_id,
          curricula_program_id: group.program.curricula_program_id,
          requirements: [
            ...preReqIds.map((id: number) => ({ requirement_type: 'pre', required_course_id: id })),
            ...coReqIds.map((id: number) => ({ requirement_type: 'co', required_course_id: id })),
          ],
        };

        this.curriculumService.updateCourse(course.course_id, updatedCourse).subscribe({
          next: () => {
            this.snackBar.open(`Course updated successfully.`, 'Close', { duration: 3000 });
            this.fetchCurriculum(this.curriculum!.curriculum_year.toString(), true); 
          },
          error: (error) => {
            console.error('Error updating course:', error);
            this.snackBar.open(`Error updating course.`, 'Close', { duration: 3000 });
          },
        });
      }
    });
  }

  onDeleteCourse(course: Course, group: any) {
    this.curriculumService.deleteCourse(course.course_id).subscribe({
      next: () => {
        this.snackBar.open(`Course deleted successfully.`, 'Close', { duration: 3000 });
        this.fetchCurriculum(this.curriculum!.curriculum_year.toString(), true); 
      },
      error: (error) => {
        console.error('Error deleting course:', error);
        this.snackBar.open(`Error deleting course.`, 'Close', { duration: 3000 });
      },
    });
  }

  onAddCourse(group: any) {
    if (!this.curriculum) return;

    const dialogConfig = this.getCourseDialogConfig(undefined, group.originalSemester.semester, group);
    const dialogRef = this.dialog.open(TableDialogComponent, {
      data: dialogConfig,
      disableClose: true,
      autoFocus: true,
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        
        // Check for duplicates before adding
        if (this.isCourseDuplicate(result.course_code)) {
          this.snackBar.open(`Error: Course Code '${result.course_code}' is already used in this curriculum!`, 'Close', { duration: 4000 });
          return;
        }

        const preReqIds = this.mapTitlesToIds(result.pre_req);
        const coReqIds = this.mapTitlesToIds(result.co_req);

        const newCourse = {
          ...result,
          curriculum_id: this.curriculum!.curriculum_id,
          semester_id: group.originalSemester.semester_id,
          year_level_id: group.yearLevel.year_level_id,
          curricula_program_id: group.program.curricula_program_id,
          requirements: [
            ...preReqIds.map((id: number) => ({
              requirement_type: 'pre',
              required_course_id: id,
            })),
            ...coReqIds.map((id: number) => ({
              requirement_type: 'co',
              required_course_id: id,
            })),
          ],
        };

        this.curriculumService.addCourse(newCourse).subscribe({
          next: () => {
            this.snackBar.open(`Course added successfully.`, 'Close', { duration: 3000 });
            this.fetchCurriculum(this.curriculum!.curriculum_year.toString(), true);
          },
          error: (error) => {
            console.error('Error adding course:', error);
            this.snackBar.open('Error adding course. Please try again.', 'Close', { duration: 3000 });
          },
        });
      }
    });
  }

  private mapTitlesToIds(titles: any, programBridgingCourses: BridgingCourse[] = []): number[] {
    return Array.isArray(titles)
      ? titles
          .filter((title: string) => title && title !== 'None')
          .map((title: string) => this.getCourseIdByTitle(title, programBridgingCourses))
          .filter((id: number | undefined) => id !== undefined) as number[]
      : [];
  }

  getCourseIdByTitle(title: string, programBridgingCourses: BridgingCourse[] = []): number | undefined {
    // Check bridging courses first
    const bridgingCourse = programBridgingCourses.find(bc => `${bc.course_code} - ${bc.course_title}` === title);
    if (bridgingCourse) return bridgingCourse.course_id;

    const course = this.curriculum?.programs
      .flatMap((program) => program.year_levels)
      .flatMap((yearLevel) => yearLevel.semesters)
      .flatMap((sem) => sem.courses)
      .find((course) => `${course.course_code} - ${course.course_title}` === title);
    return course?.course_id;
  }

  // ===========================
  // Bridging Course Management
  // ===========================
  get canManageBridgingCourses(): boolean {
    return (
      !!this.curriculum &&
      this.selectedProgram !== 'All' &&
      this.selectedYear !== 'All' &&
      this.selectedSemester !== 'All'
    );
  }

  get bridgingHeading(): string {
    const program = this.getSelectedProgramData();
    if (!program || this.selectedYear === 'All' || this.selectedSemester === 'All') {
      return 'Bridging Courses';
    }

    const programLabel = program.program_code || program.name;
    return `Bridging Courses - ${programLabel} - Year ${this.selectedYear} - ${this.getSemesterDisplay(Number(this.selectedSemester))}`;
  }

  private getSelectedProgramData(): Program | undefined {
    if (!this.curriculum || this.selectedProgram === 'All') {
      return undefined;
    }

    return this.curriculum.programs.find(
      (p) => p.curricula_program_id === Number(this.selectedProgram)
    );
  }

  private getSelectedYearLevelData(program: Program, yearLevel: number): YearLevel | undefined {
    return program.year_levels.find((yl) => yl.year === yearLevel);
  }

  private getSelectedSemesterData(
    yearLevel: YearLevel,
    semesterValue: number
  ): Semester | undefined {
    return yearLevel.semesters.find((sem) => sem.semester === semesterValue);
  }

  private getProgramYearCourses(
    program: Program,
    yearLevel: number,
    semesterValue?: number
  ): Course[] {
    const year = this.getSelectedYearLevelData(program, yearLevel);
    if (!year) {
      return [];
    }

    const semesters = semesterValue
      ? year.semesters.filter((sem) => sem.semester === semesterValue)
      : year.semesters;
    const allCourses = semesters.flatMap((sem) => sem.courses || []);
    const uniqueCourses = new Map<number, Course>();
    allCourses.forEach((course) => {
      uniqueCourses.set(course.course_id, course);
    });

    return Array.from(uniqueCourses.values()).sort((a, b) =>
      a.course_code.localeCompare(b.course_code)
    );
  }

  private getBridgingDialogConfig(
    program: Program,
    yearLevel: number,
    course?: BridgingCourse,
    preReqTitles: string[] = [],
    coReqTitles: string[] = [],
    programBridgingCourses: BridgingCourse[] = []
  ): DialogConfig {
    // Collect regular courses on the given program
    const regularCourses = Array.from(
      new Set(
        program.year_levels
          .flatMap((yl) => yl.semesters)
          .flatMap((sem) => sem.courses)
          .map((item) => `${item.course_code} - ${item.course_title}`)
      )
    );

    // Collect all bridging courses for this program
    const bridgingCourses = programBridgingCourses.map(bc => `${bc.course_code} - ${bc.course_title}`);

    // Combine unique titles and sort alphabetically
    const availableCourseTitles = Array.from(new Set([...regularCourses, ...bridgingCourses]))
      .sort((a, b) => a.localeCompare(b));

    return {
      title: course ? 'Edit Bridging Course' : 'Add Bridging Course',
      isEdit: !!course,
      fields: [
        {
          label: 'Course Code',
          formControlName: 'course_code',
          type: 'text',
          maxLength: 50,
          required: true,
        },
        {
          label: 'Pre-requisite',
          formControlName: 'pre_req',
          type: 'multiselect',
          options: availableCourseTitles,
          required: false,
        },
        {
          label: 'Co-requisite',
          formControlName: 'co_req',
          type: 'multiselect',
          options: availableCourseTitles,
          required: false,
        },
        {
          label: 'Course Title',
          formControlName: 'course_title',
          type: 'text',
          maxLength: 100,
          required: true,
        },
        {
          label: 'Lecture Hours',
          formControlName: 'lec_hours',
          type: 'number',
          min: 0,
          maxLength: 2,
          required: true,
        },
        {
          label: 'Laboratory Hours',
          formControlName: 'lab_hours',
          type: 'number',
          min: 0,
          maxLength: 2,
          required: true,
        },
        {
          label: 'Units',
          formControlName: 'units',
          type: 'number',
          min: 0,
          maxLength: 2,
          required: true,
        },
        {
          label: 'Tuition Hours',
          formControlName: 'tuition_hours',
          type: 'number',
          min: 0,
          maxLength: 2,
          required: true,
        },
      ],
      initialValue: course
        ? {
            course_code: course.course_code,
            course_title: course.course_title,
            lec_hours: course.lec_hours,
            lab_hours: course.lab_hours,
            units: course.units,
            tuition_hours: course.tuition_hours,
            pre_req: preReqTitles,
            co_req: coReqTitles,
          }
        : {
            pre_req: preReqTitles,
            co_req: coReqTitles,
          },
    };
  }

  private mapRequirementTitles(
    requirements: CourseRequirementLink[] | undefined,
    courses: CourseWithRequirements[],
    type: 'pre' | 'co'
  ): string[] {
    if (!requirements?.length) {
      return [];
    }

    return requirements
      .filter((req) => req.requirement_type === type)
      .map((req) => {
        const course = courses.find(
          (candidate) => candidate.course_id === req.required_course_id
        );
        return course
          ? `${course.course_code} - ${course.course_title}`
          : null;
      })
      .filter((title): title is string => !!title);
  }

  private loadBridgingCourses(): void {
    if (!this.canManageBridgingCourses || !this.curriculum) {
      this.bridgingCourses = [];
      return;
    }

    const program = this.getSelectedProgramData();
    const yearLevel = Number(this.selectedYear);
    const semesterValue = Number(this.selectedSemester);

    const programId = program?.program_id;

    const yearLevelData = program
      ? this.getSelectedYearLevelData(program, yearLevel)
      : undefined;
    const semesterData = yearLevelData
      ? this.getSelectedSemesterData(yearLevelData, semesterValue)
      : undefined;

    if (
      !program ||
      !programId ||
      !yearLevel ||
      !yearLevelData ||
      !yearLevelData.year_level_id ||
      !semesterData
    ) {
      this.bridgingCourses = [];
      return;
    }

    this.isLoadingBridging = true;

    this.curriculumService
      .getBridgingCourses(
        this.curriculum.curriculum_id,
        programId,
        yearLevelData.year_level_id,
        semesterData.semester_id
      )
      .pipe(finalize(() => (this.isLoadingBridging = false)))
      .subscribe({
        next: (courses) => {
          this.bridgingCourses = courses.map((course) => ({
            ...course,
            pre_req: 'None',
            co_req: 'None',
          }));
          this.cdr.markForCheck();
        },
        error: (error) => {
          console.error('Error fetching bridging courses:', error);
          this.snackBar.open(
            'Error fetching bridging courses. Please try again.',
            'Close',
            { duration: 3000 }
          );
        },
      });
  }

  onAddBridgingCourse(): void {
    if (!this.canManageBridgingCourses || !this.curriculum) {
      this.snackBar.open(
        'Select a program, year level, and semester to manage bridging courses.',
        'Close',
        { duration: 3000 }
      );
      return;
    }

    const program = this.getSelectedProgramData();
    const yearLevel = Number(this.selectedYear);
    const semesterValue = Number(this.selectedSemester);

    const programId = program?.program_id;

    const yearLevelData = program
      ? this.getSelectedYearLevelData(program, yearLevel)
      : undefined;
    const semesterData = yearLevelData
      ? this.getSelectedSemesterData(yearLevelData, semesterValue)
      : undefined;

    if (
      !program ||
      !programId ||
      !yearLevel ||
      !yearLevelData ||
      !yearLevelData.year_level_id ||
      !semesterData
    ) {
      return;
    }

    this.curriculumService
      .getBridgingCourses(this.curriculum.curriculum_id, programId)
      .subscribe({
        next: (programBridgingCourses) => {
          const dialogConfig = this.getBridgingDialogConfig(
            program,
            yearLevel,
            undefined,
            [],
            [],
            programBridgingCourses
          );

          const dialogRef = this.dialog.open(TableDialogComponent, {
            data: dialogConfig,
            disableClose: true,
            autoFocus: true,
          });

          dialogRef.afterClosed().subscribe((result) => {
            if (!result) {
              return;
            }

            if (this.bridgingCourses.length > 0) {
              this.snackBar.open(
                'A bridging course already exists for this program, year level, and semester.',
                'Close',
                { duration: 3000 }
              );
              return;
            }

            // Check for duplicates (skipped for bridging courses as per request)
            if (this.isCourseDuplicate(result.course_code, undefined, true)) {
              this.snackBar.open(
                `Error: Course Code '${result.course_code}' is already used in this curriculum!`,
                'Close',
                { duration: 4000 }
              );
              return;
            }

            const preReqIds = this.mapTitlesToIds(
              result.pre_req,
              programBridgingCourses
            );
            const coReqIds = this.mapTitlesToIds(
              result.co_req,
              programBridgingCourses
            );

            this.isManagingBridging = true;

            this.curriculumService
              .addCourse({
                course_code: result.course_code,
                course_title: result.course_title,
                lec_hours: Number(result.lec_hours),
                lab_hours: Number(result.lab_hours),
                units: Number(result.units),
                tuition_hours: Number(result.tuition_hours),
                requirements: [
                  ...preReqIds.map((id: number) => ({
                    requirement_type: 'pre',
                    required_course_id: id,
                  })),
                  ...coReqIds.map((id: number) => ({
                    requirement_type: 'co',
                    required_course_id: id,
                  })),
                ],
              })
              .pipe(
                switchMap((response) => {
                  const createdCourseId = response?.course?.course_id;
                  if (!createdCourseId) {
                    throw new Error('Course creation response missing course id.');
                  }

                  if (
                    yearLevelData.year_level_id === undefined ||
                    semesterData.semester_id === undefined
                  ) {
                    throw new Error('Invalid year level or semester data.');
                  }

                  return this.curriculumService.addBridgingCourse({
                    curriculum_id: this.curriculum!.curriculum_id,
                    program_id: programId,
                    year_level_id: yearLevelData.year_level_id,
                    semester_id: semesterData.semester_id,
                    course_id: createdCourseId,
                  });
                })
              )
              .pipe(finalize(() => (this.isManagingBridging = false)))
              .subscribe({
                next: () => {
                  this.snackBar.open(
                    'Bridging course added successfully.',
                    'Close',
                    {
                      duration: 3000,
                    }
                  );
                  this.loadBridgingCourses();
                },
                error: (error) => {
                  console.error('Error adding bridging course:', error);
                  this.snackBar.open(
                    error?.error?.message ||
                      error?.message ||
                      'Error adding bridging course. Please try again.',
                    'Close',
                    { duration: 3000 }
                  );
                },
              });
          });
        },
        error: (error) => {
          console.error('Error loading program bridging courses:', error);
          this.snackBar.open(
            'Error loading prerequisite options. Please try again.',
            'Close',
            { duration: 3000 }
          );
        },
      });
  }

  onEditBridgingCourse(bridgingCourse: BridgingCourse): void {
    if (!this.curriculum) {
      return;
    }

    const program = this.getSelectedProgramData();
    const yearLevel = Number(this.selectedYear);
    const semesterValue = Number(this.selectedSemester);

    const programId = program?.program_id;

    const yearLevelData = program
      ? this.getSelectedYearLevelData(program, yearLevel)
      : undefined;
    const semesterData = yearLevelData
      ? this.getSelectedSemesterData(yearLevelData, semesterValue)
      : undefined;

    if (
      !program ||
      !programId ||
      !yearLevel ||
      !yearLevelData ||
      !yearLevelData.year_level_id ||
      !semesterData
    ) {
      return;
    }

    forkJoin({
      courses: this.curriculumService.getAllCourses(),
      programBridgingCourses: this.curriculumService.getBridgingCourses(
        this.curriculum.curriculum_id,
        programId
      ),
    }).subscribe({
      next: ({ courses, programBridgingCourses }) => {
        const currentCourse = courses.find(
          (course) => course.course_id === bridgingCourse.course_id
        );
        const preReqTitles = this.mapRequirementTitles(
          currentCourse?.requirements,
          courses,
          'pre'
        );
        const coReqTitles = this.mapRequirementTitles(
          currentCourse?.requirements,
          courses,
          'co'
        );

        const dialogConfig = this.getBridgingDialogConfig(
          program,
          yearLevel,
          bridgingCourse,
          preReqTitles,
          coReqTitles,
          programBridgingCourses
        );

        const dialogRef = this.dialog.open(TableDialogComponent, {
          data: dialogConfig,
          disableClose: true,
          autoFocus: true,
        });

        dialogRef.afterClosed().subscribe((result) => {
          if (!result) {
            return;
          }

          const preReqIds = this.mapTitlesToIds(
            result.pre_req,
            programBridgingCourses
          );
          const coReqIds = this.mapTitlesToIds(
            result.co_req,
            programBridgingCourses
          );

          this.isManagingBridging = true;

          this.curriculumService
            .updateCourse(bridgingCourse.course_id, {
              course_code: result.course_code,
              course_title: result.course_title,
              lec_hours: Number(result.lec_hours),
              lab_hours: Number(result.lab_hours),
              units: Number(result.units),
              tuition_hours: Number(result.tuition_hours),
              requirements: [
                ...preReqIds.map((id: number) => ({
                  requirement_type: 'pre',
                  required_course_id: id,
                })),
                ...coReqIds.map((id: number) => ({
                  requirement_type: 'co',
                  required_course_id: id,
                })),
              ],
            })
            .pipe(finalize(() => (this.isManagingBridging = false)))
            .subscribe({
              next: () => {
                this.snackBar.open(
                  'Bridging course updated successfully.',
                  'Close',
                  { duration: 3000 }
                );
                this.loadBridgingCourses();
              },
              error: (error) => {
                console.error('Error updating bridging course:', error);
                this.snackBar.open(
                  error?.error?.message ||
                    error?.message ||
                    'Error updating bridging course. Please try again.',
                  'Close',
                  { duration: 3000 }
                );
              },
            });
        });
      },
      error: (error) => {
        console.error('Error loading course details:', error);
        this.snackBar.open(
          'Error loading course details. Please try again.',
          'Close',
          { duration: 3000 }
        );
      },
    });
  }

  onDeleteBridgingCourse(bridgingCourse: BridgingCourse): void {
    this.isManagingBridging = true;

    this.curriculumService
      .deleteBridgingCourse(bridgingCourse.bridging_course_id)
      .pipe(finalize(() => (this.isManagingBridging = false)))
      .subscribe({
        next: () => {
          this.snackBar.open('Bridging course deleted successfully.', 'Close', {
            duration: 3000,
          });
          this.loadBridgingCourses();
        },
        error: (error) => {
          console.error('Error deleting bridging course:', error);
          this.snackBar.open(
            error?.error?.message ||
              'Error deleting bridging course. Please try again.',
            'Close',
            { duration: 3000 }
          );
        },
      });
  }

  // ===========================
  // Program Management
  // ===========================
  onManagePrograms() {
    const curriculumYear = this.curriculum?.curriculum_year;
    if (!curriculumYear) return;

    this.isManagingPrograms = true;
    
    forkJoin({
      allPrograms: this.curriculumService.getAllPrograms(),
      curriculumDetails: this.curriculumService.getCurriculumByYear(curriculumYear),
    }).subscribe({
      next: ({ allPrograms, curriculumDetails }) => {
        this.isManagingPrograms = false;
        if (!curriculumDetails || !curriculumDetails.programs) return;

        const associatedPrograms = new Set(curriculumDetails.programs.map((program) => program.name));

        const dialogConfig: DialogConfig = {
          title: 'Manage Programs',
          isEdit: false,
          fields: allPrograms.map((program) => ({
            label: `${program.program_code} - ${program.program_title}`,
            formControlName: program.program_code,
            type: 'checkbox' as 'checkbox',
            required: false,
            checked: associatedPrograms.has(program.program_code),
          })),
          initialValue: allPrograms.reduce((acc, program) => {
            acc[program.program_code] = associatedPrograms.has(program.program_code);
            return acc;
          }, {} as { [key: string]: boolean }),
        };

        const dialogRef = this.dialog.open(TableDialogComponent, {
          data: dialogConfig, width: '25rem', disableClose: true,
          autoFocus: true,
        });

        dialogRef.afterClosed().subscribe((result) => {

          if (result) {
            let programsChanged = false;
            const programUpdates: Observable<any>[] = [];

            allPrograms.forEach((program) => {
              const isSelected = result[program.program_code];
              const isInCurriculum = associatedPrograms.has(program.program_code);

              if (isSelected && !isInCurriculum) {
                programsChanged = true;
                programUpdates.push(this.curriculumService.addProgramToCurriculum(curriculumYear, program.program_id));
              } else if (!isSelected && isInCurriculum) {
                programsChanged = true;
                programUpdates.push(this.curriculumService.removeProgramFromCurriculum(curriculumYear, program.program_id));
              }
            });

            if (programsChanged) {
              this.isManagingPrograms = true;

              forkJoin(programUpdates).pipe(
                finalize(() => this.isManagingPrograms = false),
                switchMap(() => this.curriculumService.getCurriculumByYear(curriculumYear))
              ).subscribe({
                next: (updatedCurriculum) => {
                  this.curriculum = updatedCurriculum;
                  
                  if (this.selectedProgram !== 'All') {
                    const exists = updatedCurriculum.programs.some(p => p.curricula_program_id === Number(this.selectedProgram));
                    if (!exists) this.selectedProgram = 'All';
                  }

                  this.updateHeaderInputFields();
                  this.updateRenderGroups();
                  this.updateCustomExportOptions();
                  this.cdr.detectChanges();
                }
              });
            }
          }
        });
      },
      error: (error) => {
        this.isManagingPrograms = false;
        console.error('Error loading programs:', error);
      },
    });
  }

  // ===========================
  // Dialog Configuration
  // ===========================
  private getCourseDialogConfig(course?: Course, semester?: number, group?: any): DialogConfig {
    const program = group ? group.program : this.curriculum?.programs[0];
    const availableCourseTitles = program?.year_levels
      .flatMap((yl: any) => yl.semesters)
      .flatMap((sem: any) => sem.courses)
      .map((c: any) => `${c.course_code} - ${c.course_title}`) || [];

    let existingPreReqs: string[] = course?.prerequisites ? course.prerequisites.map(p => `${p.course_code} - ${p.course_title}`) : [];
    let existingCoReqs: string[] = course?.corequisites ? course.corequisites.map(c => `${c.course_code} - ${c.course_title}`) : [];

    return {
      title: course ? 'Edit Course' : 'Add Course',
      isEdit: !!course,
      fields: [
        { label: 'Course Code', formControlName: 'course_code', type: 'text', maxLength: 50, required: true },
        { label: 'Pre-requisite', formControlName: 'pre_req', type: 'multiselect', options: availableCourseTitles, required: false, initialSelection: existingPreReqs },
        { label: 'Co-requisite', formControlName: 'co_req', type: 'multiselect', options: availableCourseTitles, required: false, initialSelection: existingCoReqs },
        { label: 'Course Title', formControlName: 'course_title', type: 'text', maxLength: 100, required: true },
        { label: 'Lecture Hours', formControlName: 'lec_hours', type: 'number', min: 0, maxLength: 2, required: true },
        { label: 'Laboratory Hours', formControlName: 'lab_hours', type: 'number', min: 0, maxLength: 2, required: true },
        { label: 'Units', formControlName: 'units', type: 'number', min: 0, maxLength: 2, required: true },
        { label: 'Tuition Hours', formControlName: 'tuition_hours', type: 'number', min: 0, maxLength: 2, required: true },
      ],
      initialValue: course ? this.populateCourseRequisites(course) : { semester },
    };
  }

  populateCourseRequisites(course: Course): Course {
    return {
      ...course,
      pre_req: course.prerequisites?.length ? course.prerequisites.map(p => `${p.course_code}`) : ['None'],
      co_req: course.corequisites?.length ? course.corequisites.map(c => `${c.course_code}`) : ['None'],
    } as any;
  }

  getSemesterDisplay(semester: number): string {
    return this.curriculumService.mapSemesterToEnum(semester);
  }

  // Check if a program actually has matching courses BEFORE rendering
  private programHasCourses(
    program: Program, 
    filterYear: string | number, 
    filterSemester: string | number
  ): boolean {
    let yearLevels = program.year_levels;
    
    if (filterYear !== 'All') {
      yearLevels = yearLevels.filter(yl => yl.year === Number(filterYear));
    }

    for (const yl of yearLevels) {
      let semesters = yl.semesters;
      
      if (filterSemester !== 'All') {
        semesters = semesters.filter(sem => sem.semester === Number(filterSemester));
      }
      
      // If ANY semester in this program matches the filters and has courses
      if (semesters.some(sem => sem.courses && sem.courses.length > 0)) {
        return true;
      }
    }
    
    return false;
  }

  // ===========================
  // PDF Export
  // ===========================
  onExport(option: string | undefined): void {
    if (option === 'all') {
      this.openPdfPreviewDialog(true);
    } else if (option === 'current') {
      this.openPdfPreviewDialog(false);
    }
  }

  openPdfPreviewDialog(exportAll: boolean): void {
    const dialogRef = this.dialog.open(DialogExportComponent, {
      data: {
        exportType: exportAll ? 'all' : 'single',
        generatePdfFunction: (showPreview: boolean) => this.generatePDF(showPreview, exportAll),
      },
      maxWidth: '70rem', width: '100%',
      autoFocus: true,
    });
    dialogRef.afterClosed().subscribe(() => {});
  }

  generatePDF(
    showPreview: boolean = false, exportAll: boolean = false
  ): void | Blob {
    const doc = new jsPDF('p', 'mm', 'letter') as any;

    if (this.curriculum) {

      const yearFilter = exportAll ? 'All' : this.selectedYear;
      const semFilter = exportAll ? 'All' : this.selectedSemester;

      let programsToExport = exportAll 
        ? this.curriculum.programs 
        : (this.selectedProgram === 'All'
            ? this.curriculum.programs
            : this.curriculum.programs.filter(p => p.curricula_program_id === Number(this.selectedProgram)));

      // Filter the programs to exclude empty headers
      const activePrograms = programsToExport.filter(p => this.programHasCourses(p, yearFilter, semFilter));

      if (activePrograms.length === 0) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(14);
        doc.text("No courses available for the selected filters.", 10, 20);
      } else {
        activePrograms.forEach((program, index) => {
          this.addProgramToPDF(doc, program, index === 0, yearFilter, semFilter);
        });
      }

      this.reportHeaderService.addStandardFooter(doc); 

      const pdfBlob = doc.output('blob');
      
      if (showPreview) {
        return pdfBlob;
      } else {
        doc.save('curriculum_report.pdf');
      }
    }
  }

  private addProgramToPDF(
    doc: any,
    program: Program,
    isFirstProgram: boolean,
    filterYear: string | number,
    filterSemester: string | number
  ): void {
    const pageHeight = doc.internal.pageSize.height;
    const margin = 10;
    const topMargin = 15;
    const bottomMargin = 20; 

    if (!isFirstProgram) {
      this.reportHeaderService.addStandardFooter(doc); 
      doc.addPage();
    }

    let currentY = topMargin;

    this.reportHeaderService.addHeader(
      doc, 
      `Curriculum Year ${this.curriculum?.curriculum_year || ''}`, currentY
    )
      .subscribe((newY) => {
        currentY = newY;

        let sortedYearLevels = program.year_levels.sort((a, b) => a.year - b.year);
        
        if (filterYear !== 'All') {
          sortedYearLevels = sortedYearLevels.filter(yl => yl.year === Number(filterYear));
        }

        for (const yearLevel of sortedYearLevels) {
          
          let sortedSemesters = yearLevel.semesters.sort((a, b) => a.semester - b.semester);
          
          if (filterSemester !== 'All') {
            sortedSemesters = sortedSemesters.filter(sem => sem.semester === Number(filterSemester));
          }

          const populatedSemesters = sortedSemesters.filter(sem => sem.courses && sem.courses.length > 0);

          if (populatedSemesters.length === 0) {
            continue; 
          }

          if (currentY + 20 > pageHeight - bottomMargin) {
            this.reportHeaderService.addStandardFooter(doc); 
            doc.addPage();
            this.reportHeaderService.addHeader(
              doc, 
              `Curriculum Year ${this.curriculum?.curriculum_year || ''}`, topMargin
            )
              .subscribe((newPageY) => currentY = newPageY);
          }

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(15);
          doc.text(`${program.name} - Year ${yearLevel.year}`, margin, currentY);
          currentY += 10;

          for (const semester of populatedSemesters) {
            
            if (currentY + 40 > pageHeight - bottomMargin) {
              this.reportHeaderService.addStandardFooter(doc); 
              doc.addPage();
              this.reportHeaderService.addHeader(
                doc, 
                `Curriculum Year ${this.curriculum?.curriculum_year || ''}`, topMargin
              )
                .subscribe((newPageY) => currentY = newPageY);
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(15);
              doc.text(`${program.name} - Year ${yearLevel.year} (continued)`, margin, currentY);
              currentY += 10;
            }

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(13);
            doc.text(this.getSemesterDisplay(semester.semester), margin, currentY);
            currentY += 6;

            const tableData: (string | TableCell)[][] = semester.courses.map((course) => {
              const processedCourse = this.populateCourseRequisites(course);
              return [
                processedCourse.course_code || 'N/A',
                Array.isArray(processedCourse.pre_req) ? processedCourse.pre_req.join(', ') : 'None',
                Array.isArray(processedCourse.co_req) ? processedCourse.co_req.join(', ') : 'None',
                processedCourse.course_title || 'N/A',
                processedCourse.lec_hours?.toString() || '0',
                processedCourse.lab_hours?.toString() || '0',
                processedCourse.units?.toString() || '0',
                processedCourse.tuition_hours?.toString() || '0',
              ];
            });

            const totalUnits = semester.courses.reduce((sum, course) => sum + (course.units || 0), 0);
            const totalTuition = semester.courses.reduce((sum, course) => sum + (course.tuition_hours || 0), 0);

            tableData.push([
              { content: 'TOTAL: ', colSpan: 6, styles: { halign: 'left' } } as TableCell,
              { content: totalUnits.toString(), styles: { halign: 'center' } } as TableCell,
              { content: totalTuition.toString(), styles: { halign: 'center' } } as TableCell,
            ]);

            doc.autoTable({
              startY: currentY,
              head: [['Code', 'Pre-req', 'Co-req', 'Title', 'Lec', 'Lab', 'Units', 'Tuition']],
              body: tableData as Array<(string | TableCell)[]>,
              theme: 'grid',
              headStyles: { fillColor: [128, 0, 0], textColor: [255, 255, 255], fontSize: 10, halign: 'center', cellPadding: 1 },
              bodyStyles: { fontSize: 9, textColor: [0, 0, 0] },
              styles: { lineWidth: 0.1, overflow: 'linebreak', cellPadding: 0.5 },
              columnStyles: { 4: { halign: 'center' }, 5: { halign: 'center' }, 6: { halign: 'center' }, 7: { halign: 'center' } },
              
              didParseCell: function (data: any) {
                if (data.row.index === tableData.length - 1) {
                  data.cell.styles.fontStyle = 'bold';
                  data.cell.styles.lineWidth = 0.5;
                }
              },
              margin: { left: 10, right: 10 },
            });
            currentY = (doc as any).lastAutoTable.finalY + 8;
          }
          currentY += 5;
        }
      });
  }

  cancelPreview(): void {
    this.showPreview = false;
  }
}
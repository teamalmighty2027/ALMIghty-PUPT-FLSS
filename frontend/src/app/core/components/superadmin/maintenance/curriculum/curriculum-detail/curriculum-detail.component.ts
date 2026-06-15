import { Component, OnInit, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';

import { forkJoin, Observable, Subject, of, firstValueFrom } from 'rxjs';
import { finalize, switchMap, takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';

import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSelect, MatOption } from "@angular/material/select";

import { TableGenericComponent } from '../../../../../../shared/table-generic/table-generic.component';
import { TableHeaderComponent, InputField } from '../../../../../../shared/table-header/table-header.component';
import { DialogGenericComponent } from '../../../../../../shared/dialog-generic/dialog-generic.component';
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
  CourseRequirement,
  CourseWithRequirements,
  CourseRequirementLink,
  Elective,
  CurriculumElective,
  CurriculumElectivesResponse,
} from '../../../../../services/superadmin/curriculum/curriculum.service';
import { AcademicYearService } from '../../../../../services/admin/academic-year/academic-year.service';
import { ReportHeaderService } from '../../../../../services/report-header/report-header.service';

import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

interface TableCell {
  content: string;
  colSpan?: number;
}

interface ElectiveSlotSelection {
  slotName: string;
  options: Elective[];
}

@Component({
  selector: 'app-curriculum-detail',
  standalone: true,
  imports: [
    CommonModule,
    TableGenericComponent,
    TableHeaderComponent,
    LoadingComponent,
    MatSelect,
    MatOption
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
  public selectedCategory: 'Regular' | 'Bridging' = 'Regular';
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
  public isLoadingElectives: boolean = false;
  public electiveSlots: ElectiveSlotSelection[] = [];

  public academicYearsForCurriculum: {
    academic_year_id: number;
    year_start: number;
    year_end: number;
    is_active: boolean;
  }[] = [];
  
  public selectedAcademicYearId: number | null = null;
  public selectedAYForSlot: Record<string, number> = {};
  public activeElectiveMap: Record<string, number> = {};
  public isSavingElective: boolean = false;

  private electiveVariants: Record<string, Elective[]> = {};
  private electivesLoadedForYear: string | null = null;

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
    private academicYearService: AcademicYearService,
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
            this.loadSelectionCaches();
            this.updateHeaderInputFields();
            this.updateRenderGroups();
            this.updateCustomExportOptions();
            this.loadBridgingCourses();
            this.loadElectiveData(year);
            this.cdr.markForCheck();
          }
          this.isLoading = false;
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

  /**
   * Restores cached filter selections from localStorage with safety checks.
   */
  private loadSelectionCaches(): void {
    const cachedCategory =
      localStorage.getItem('curriculum_selected_category');
    if (cachedCategory === 'Regular' || cachedCategory === 'Bridging') {
      this.selectedCategory = cachedCategory;
    }

    const cachedProgram =
      localStorage.getItem('curriculum_selected_program');
    if (cachedProgram) {
      const programExists =
        cachedProgram === 'All' ||
        (this.curriculum?.programs.some(
          (p) => p.curricula_program_id === Number(cachedProgram)
        ));
      this.selectedProgram = programExists
        ? (cachedProgram === 'All' ? 'All' : Number(cachedProgram))
        : 'All';
    }

    const cachedYear =
      localStorage.getItem('curriculum_selected_year');
    if (cachedYear) {
      let yearExists = cachedYear === 'All';
      if (!yearExists && this.selectedProgram !== 'All' && this.curriculum) {
        const programData = this.curriculum.programs.find(
          (p) => p.curricula_program_id === Number(this.selectedProgram)
        );
        if (programData) {
          const programYears = (programData.year_levels || []).map(
            (l) => l.year
          );
          yearExists =
            programYears.includes(Number(cachedYear)) ||
            Number(cachedYear) <= programData.number_of_years;
        }
      }
      this.selectedYear = yearExists
        ? (cachedYear === 'All' ? 'All' : Number(cachedYear))
        : 'All';
    }

    const cachedSemester =
      localStorage.getItem('curriculum_selected_semester');
    if (cachedSemester) {
      const semExists =
        cachedSemester === 'All' ||
        [1, 2, 3].includes(Number(cachedSemester));
      this.selectedSemester = semExists
        ? (cachedSemester === 'All' ? 'All' : Number(cachedSemester))
        : 'All';
    }
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
      { type: 'select', label: 'Category', key: 'category', options: [
        { key: 'Regular', label: 'Regular Courses' },
        { key: 'Bridging', label: 'Bridging Courses' }
      ]},
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
      const catLabel = this.selectedCategory === 'Bridging' ? ' bridging' : '';
      currentLabel = `Export ${selectedProg?.name || 'Program'}${catLabel} curriculum`;
    } else if (this.selectedCategory === 'Bridging') {
      currentLabel = 'Export bridging courses (All Programs)';
    }

    this.customExportOptions = {
      all: 'Export entire curriculum (All Programs)',
      current: currentLabel,
    };
    this.cdr.detectChanges();
  }

  updateRenderGroups() {
    if (!this.curriculum) return;

    if (this.selectedCategory === 'Bridging') {
      this.updateBridgingRenderGroups();
      return;
    }

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
              if (!searchLower) return true;
              const courseCodeMatch = course.course_code.toLowerCase().includes(searchLower);
              const courseTitleMatch = course.course_title.toLowerCase().includes(searchLower);
              return courseCodeMatch || courseTitleMatch;
            })
            .map(course => ({
              ...course,
              pre_req: course.prerequisites?.map(p => p.course_code).join(', ') || 'None',
              co_req: course.corequisites?.map(c => c.course_code).join(', ') || 'None',
            }));

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
    this.updateElectiveSlots();
    this.cdr.detectChanges();
  }

  /**
   * Updates the render groups for bridging courses.
   * This method is called when the selected category is 'Bridging'.
   */
  updateBridgingRenderGroups() {
    if (!this.curriculum) return;

    const searchLower = this.searchQuery.toLowerCase().trim();
    const programsToProcess = this.selectedProgram === 'All'
      ? this.curriculum.programs
      : this.curriculum.programs.filter(p => p.curricula_program_id === Number(this.selectedProgram));

    // Handle empty case early
    if (programsToProcess.length === 0) {
      this.renderGroups = [];
      this.cdr.detectChanges();
      return;
    }

    this.isLoadingBridging = true;
    this.renderGroups = []; 

    const observables = programsToProcess.map(prog => {
      // Find yearLevel and semester IDs if filtered
      let yearLevelId: number | undefined;
      let semesterId: number | undefined;

      if (this.selectedYear !== 'All') {
        const yl = prog.year_levels.find(yl => yl.year === Number(this.selectedYear));
        yearLevelId = yl?.year_level_id;
      }

      if (this.selectedSemester !== 'All' && yearLevelId) {
        const yl = prog.year_levels.find(y => y.year_level_id === yearLevelId);
        const sem = yl?.semesters.find(s => s.semester === Number(this.selectedSemester));
        semesterId = sem?.semester_id;
      }

      return this.curriculumService.getBridgingCourses(
        this.curriculum!.curriculum_id,
        prog.program_id,
        yearLevelId,
        semesterId
      ).pipe(
        // Attach program context for grouping later
        switchMap(courses => of({ prog, courses }))
      );
    });

    forkJoin(observables).pipe(
      finalize(() => {
        this.isLoadingBridging = false;
        this.cdr.detectChanges();
      }),
      takeUntil(this.destroy$)
    ).subscribe(results => {
      let groups: any[] = [];

      results.forEach(({ prog, courses }) => {
        // Group these bridging courses by year and semester for this program
        const courseMap = new Map<string, any[]>();

        courses.forEach((course: BridgingCourse) => {
          // Apply search filter
          const codeMatch = course.course_code.toLowerCase().includes(searchLower);
          const titleMatch = course.course_title.toLowerCase().includes(searchLower);
          if (searchLower && !codeMatch && !titleMatch) return;

          const yearLevelData = prog.year_levels.find((yl: YearLevel) => yl.year_level_id === course.year_level_id);
          const semesterData = yearLevelData?.semesters.find((sem: Semester) => sem.semester_id === course.semester_id);
          
          if (!yearLevelData || !semesterData) return;

          // Manual filtering for cases where API returns more than requested (e.g. All Years + Specific Semester)
          if (this.selectedYear !== 'All' && yearLevelData.year !== Number(this.selectedYear)) return;
          if (this.selectedSemester !== 'All' && semesterData.semester !== Number(this.selectedSemester)) return;

          const key = `${prog.program_id}-${yearLevelData.year}-${semesterData.semester}`;
          if (!courseMap.has(key)) {
            courseMap.set(key, []);
          }

          // Format for generic table
          const preReqCodes = course.prerequisites?.map((p: CourseRequirement) => p.course_code) || [];
          const coReqCodes = course.corequisites?.map((c: CourseRequirement) => c.course_code) || [];

          courseMap.get(key)!.push({
            ...course,
            pre_req: preReqCodes.length ? preReqCodes.join(', ') : 'None',
            co_req: coReqCodes.length ? coReqCodes.join(', ') : 'None',
            // Field for action handling
            originalSemester: semesterData,
            program: prog,
            yearLevel: yearLevelData
          });
        });

        courseMap.forEach((groupedCourses, key) => {
          const first = groupedCourses[0];
          let heading = `Bridging Courses - ${this.getSemesterDisplay(first.originalSemester.semester)}`;
          
          if (this.selectedProgram === 'All' || this.selectedYear === 'All') {
             heading = `${first.program.name} - Year ${first.yearLevel.year} - ${heading}`;
          }

          groups.push({
            id: key,
            heading: heading,
            courses: groupedCourses,
            originalSemester: first.originalSemester,
            program: first.program,
            yearLevel: first.yearLevel,
            isBridging: true
          });
        });
      });

      // Sort groups by Program, Year, Semester
      this.renderGroups = groups.sort((a, b) => {
        if (a.program.name !== b.program.name) return a.program.name.localeCompare(b.program.name);
        if (a.yearLevel.year !== b.yearLevel.year) return a.yearLevel.year - b.yearLevel.year;
        return a.originalSemester.semester - b.originalSemester.semester;
      });
      
      this.cdr.detectChanges();
    });
  }

  // ===========================
  // Elective Pool Management
  // ===========================

  /**
   * Load the masterlist of electives (the pool) and the
   * academic years that reference this curriculum so the
   * superadmin can set the active elective per AY.
   */
  private loadElectiveData(curriculumYear: string): void {
    if (this.electivesLoadedForYear === curriculumYear) {
      this.updateElectiveSlots();
      return;
    }

    this.isLoadingElectives = true;

    // Load pool of variants, academic years, and active year details
    forkJoin({
      variants: this.curriculumService.getElectives(),
      academicYears: this.academicYearService.getAcademicYears(),
      activeYearInfo: this.academicYearService.getActiveYearAndSemester(),
    }).pipe(
      finalize(() => (this.isLoadingElectives = false)),
      takeUntil(this.destroy$)
    ).subscribe({
      next: ({ variants, academicYears, activeYearInfo }) => {
        this.electiveVariants = variants;
        this.electivesLoadedForYear = curriculumYear;

        this.academicYearsForCurriculum = (academicYears as any[]).map(
          (ay: any) => {
            const parts = (ay.academic_year || '').split('-');
            const yearStart = parts[0] ? Number(parts[0]) : 0;
            const yearEnd = parts[1] ? Number(parts[1]) : 0;
            const isActive = ay.academic_year === activeYearInfo?.activeYear;

            return {
              academic_year_id: ay.academic_year_id,
              year_start: yearStart,
              year_end: yearEnd,
              is_active: isActive,
            };
          }
        );

        // Default to the active AY
        const activeAY = this.academicYearsForCurriculum.find(
          (ay) => ay.is_active
        );
        if (activeAY && !this.selectedAcademicYearId) {
          this.selectedAcademicYearId = activeAY.academic_year_id;
        }

        this.updateElectiveSlots();
        this.loadActiveElectiveMap(curriculumYear);
        this.cdr.markForCheck();
      },
      error: () => {
        this.snackBar.open(
          'Error loading electives. Please try again.',
          'Close',
          { duration: 3000 }
        );
      }
    });
  }

  /**
   * Eager load active elective assignments for all AYs.
   * Resolves the activeElectiveMap for the curriculum.
   */
  private loadActiveElectiveMap(curriculumYear: string): void {
    this.curriculumService
      .getCurriculumElectives(curriculumYear)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.activeElectiveMap = {};

          response.electives.forEach((ce) => {
            const key = this.buildElectiveKey(
              ce.program_id,
              ce.year_level,
              ce.semester_id,
              ce.elective_slot_name,
              ce.academic_year_id
            );
            this.activeElectiveMap[key] = ce.selected_elective_id;
          });

          this.cdr.markForCheck();
        },
        error: () => {
          this.snackBar.open(
            'Error loading active elective data.',
            'Close',
            { duration: 3000 }
          );
        },
      });
  }

  /**
   * Build the map key for activeElectiveMap.
   */
  private buildElectiveKey(
    programId: number,
    yearLevel: number,
    semesterId: number,
    slotName: string,
    academicYearId: number | null
  ): string {
    return `${programId}_${yearLevel}_${semesterId}_${slotName}`
      + `_${academicYearId ?? 'null'}`;
  }

  /**
   * Returns the AY label string, e.g. "2024-2025".
   */
  public getAYLabel(ayId: number): string {
    const ay = this.academicYearsForCurriculum.find(
      a => a.academic_year_id === ayId
    );
    return ay ? `${ay.year_start}–${ay.year_end}` : '';
  }

  /**
   * Called when the user changes the AY selector.
   * Reloads activeElectiveMap for the new AY.
   */
  public onAcademicYearChange(ayId: number): void {
    this.selectedAcademicYearId = ayId;
    const year = this.curriculum?.curriculum_year?.toString();

    if (year) {
      this.loadActiveElectiveMap(year);
    }
  }

  /**
   * Returns the active elective_id for a slot in the
   * specified academic year context, or null if none set.
   */
  public getActiveElectiveForSlot(
    slotName: string,
    academicYearId: number | null
  ): number | null {
    if (!academicYearId) return null;

    const program = this.getSelectedProgramData();
    const yearLevelData = program
      ? this.getSelectedYearLevelData(
          program,
          Number(this.selectedYear)
        )
      : null;
    const semesterData = yearLevelData
      ? this.getSelectedSemesterData(
          yearLevelData,
          Number(this.selectedSemester)
        )
      : null;

    if (!program || !yearLevelData || !semesterData) {
      return null;
    }

    const key = this.buildElectiveKey(
      program.program_id,
      yearLevelData.year,
      semesterData.semester_id,
      slotName,
      academicYearId
    );

    return this.activeElectiveMap[key] ?? null;
  }

  /**
   * Saves the active elective for a slot to the backend
   * and updates the local map optimistically.
   */
  public setActiveElectiveForSlot(
    slotName: string,
    academicYearId: number | null,
    electiveId: number
  ): void {
    if (!this.curriculum || !academicYearId) return;

    const program = this.getSelectedProgramData();
    const yearLevelData = program
      ? this.getSelectedYearLevelData(
          program,
          Number(this.selectedYear)
        )
      : null;
    const semesterData = yearLevelData
      ? this.getSelectedSemesterData(
          yearLevelData,
          Number(this.selectedSemester)
        )
      : null;

    if (!program || !yearLevelData || !semesterData) return;

    const key = this.buildElectiveKey(
      program.program_id,
      yearLevelData.year,
      semesterData.semester_id,
      slotName,
      academicYearId
    );

    // Optimistic update
    this.activeElectiveMap[key] = electiveId;
    this.isSavingElective = true;

    this.curriculumService.saveCurriculumElective({
      curriculum_id: this.curriculum.curriculum_id,
      program_id: program.program_id,
      year_level: yearLevelData.year,
      semester_id: semesterData.semester_id,
      elective_slot_name: slotName,
      selected_elective_id: electiveId,
      academic_year_id: academicYearId,
    }).pipe(
      takeUntil(this.destroy$),
      finalize(() => {
        this.isSavingElective = false;
        this.cdr.markForCheck();
      })
    ).subscribe({
      next: () => {
        this.snackBar.open(
          'Active elective saved.',
          'Close',
          { duration: 2000 }
        );
      },
      error: (err) => {
        console.error(err);
        // Revert optimistic update on error
        delete this.activeElectiveMap[key];
        this.snackBar.open(
          'Error saving elective. Please try again.',
          'Close',
          { duration: 3000 }
        );
      }
    });
  }

  /**
   * Update the elective slots based on the current filters.
   */
  private updateElectiveSlots(): void {
    if (!this.curriculum || !this.canManageElectives) {
      this.electiveSlots = [];
      return;
    }

    const program = this.getSelectedProgramData();
    const yearLevel = Number(this.selectedYear);
    const semesterValue = Number(this.selectedSemester);

    if (!program) {
      this.electiveSlots = [];
      return;
    }

    const yearLevelData = this.getSelectedYearLevelData(program, yearLevel);
    const semesterData = yearLevelData
      ? this.getSelectedSemesterData(yearLevelData, semesterValue)
      : undefined;

    if (!yearLevelData || !semesterData) {
      this.electiveSlots = [];
      return;
    }

    const slotNames = this.getElectiveSlotsFromCourses(semesterData.courses);
    const activeAY = this.academicYearsForCurriculum.find(
      (ay) => ay.is_active
    );
    const defaultAYId = activeAY
      ? activeAY.academic_year_id
      : (this.academicYearsForCurriculum[0]?.academic_year_id || null);

    this.electiveSlots = slotNames.map((slotName) => {
      if (defaultAYId && !this.selectedAYForSlot[slotName]) {
        this.selectedAYForSlot[slotName] = defaultAYId;
      }
      return {
        slotName,
        options: this.electiveVariants[slotName] || [],
      };
    });
  }

  /**
   * Detect elective slot names from the curriculum courses.
   */
  private getElectiveSlotsFromCourses(courses: Course[]): string[] {
    const slotNames = new Set<string>();

    courses.forEach((course) => {
      if (course.course_title.toLowerCase().includes('elective') || course.course_code.toLowerCase().includes('elective')) {
        slotNames.add(course.course_title.trim()); 
      }
    });

    return Array.from(slotNames.values()).sort((a, b) => a.localeCompare(b));
  }

  /**
   * Open Dialog to Add an Option to the Pool
   */
  openManageElectiveDialog(slotName: string) {
    const dialogConfig: DialogConfig = {
      title: `Add Option for ${slotName}`,
      isEdit: false,
      fields: [
        { label: 'Course Code', formControlName: 'course_code', type: 'text', maxLength: 50, required: true },
        { label: 'Course Title', formControlName: 'course_title', type: 'text', maxLength: 100, required: true },
        { label: 'Lecture Hours', formControlName: 'lec_hours', type: 'number', min: 0, maxLength: 2, required: true },
        { label: 'Laboratory Hours', formControlName: 'lab_hours', type: 'number', min: 0, maxLength: 2, required: true },
        { label: 'Units', formControlName: 'units', type: 'number', min: 0, maxLength: 2, required: true },
        { label: 'Tuition Hours', formControlName: 'tuition_hours', type: 'number', min: 0, maxLength: 2, required: true },
      ],
      initialValue: {}
    };

    const dialogRef = this.dialog.open(TableDialogComponent, {
      data: dialogConfig,
      autoFocus: true
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        const payload = {
          ...result,
          elective_slot_name: slotName
        };

        // Call the service to save it to the database
        this.curriculumService.addElectiveOption(payload).subscribe({
          next: () => {
            this.snackBar.open('Elective option added successfully!', 'Close', { duration: 3000 });
            // Force a refresh of the pool
            this.electivesLoadedForYear = null; 
            this.loadElectiveData(this.curriculum!.curriculum_year.toString());
          },
          error: (err) => {
            console.error(err);
            this.snackBar.open('Error adding elective.', 'Close', { duration: 3000 });
          }
        });
      }
    });
  }

  /**
   * Open Dialog to Edit an existing Option
   */
  openEditElectiveDialog(slotName: string, option: Elective) {
    const dialogConfig: DialogConfig = {
      title: `Edit Option for ${slotName}`,
      isEdit: true,
      fields: [
        { label: 'Course Code', formControlName: 'course_code', type: 'text', maxLength: 50, required: true },
        { label: 'Course Title', formControlName: 'course_title', type: 'text', maxLength: 100, required: true },
        { label: 'Lecture Hours', formControlName: 'lec_hours', type: 'number', min: 0, maxLength: 2, required: true },
        { label: 'Laboratory Hours', formControlName: 'lab_hours', type: 'number', min: 0, maxLength: 2, required: true },
        { label: 'Units', formControlName: 'units', type: 'number', min: 0, maxLength: 2, required: true },
        { label: 'Tuition Hours', formControlName: 'tuition_hours', type: 'number', min: 0, maxLength: 2, required: true },
      ],
      initialValue: {
        course_code: option.course_code,
        course_title: option.course_title,
        lec_hours: option.lec_hours,
        lab_hours: option.lab_hours,
        units: option.units,
        tuition_hours: option.tuition_hours
      }
    };

    const dialogRef = this.dialog.open(TableDialogComponent, {
      data: dialogConfig,
      autoFocus: true
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        // Call the service to update it in the database
        this.curriculumService.updateElectiveOption(option.elective_id, result).subscribe({
          next: () => {
            this.snackBar.open('Elective option updated successfully!', 'Close', { duration: 3000 });
            // Force a refresh of the pool
            this.electivesLoadedForYear = null; 
            this.loadElectiveData(this.curriculum!.curriculum_year.toString());
          },
          error: (err) => {
            console.error(err);
            this.snackBar.open('Error updating elective.', 'Close', { duration: 3000 });
          }
        });
      }
    });
  }

  /**
   * Delete an Option from the Pool (Using Material Dialog)
   */
  deleteElectiveOption(electiveId: number) {
    const dialogRef = this.dialog.open(DialogGenericComponent, {
      width: '400px',
      data: {
        title: 'Remove Elective Option',
        content: 'Are you sure you want to remove this elective from the pool? It will no longer be available for scheduling.',
        actionText: 'Remove',
        cancelText: 'Cancel',
        action: 'Remove',
      },
      autoFocus: true,
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        // User clicked "Remove", proceed with API call
        this.curriculumService.deleteElectiveOption(electiveId).subscribe({
            next: () => {
                this.snackBar.open('Elective removed.', 'Close', { duration: 3000 });
                // Force a refresh of the pool
                this.electivesLoadedForYear = null;
                this.loadElectiveData(this.curriculum!.curriculum_year.toString());
            },
            error: (err) => {
                console.error(err);
                this.snackBar.open('Error removing elective.', 'Close', { duration: 3000 });
            }
        });
      }
    });
  }

  onInputChange(values: { [key: string]: any }) {
    let refreshBridging = false;
    let needsRender = false;

    if (values['courseSearch'] !== undefined) {
      this.searchQuery$.next(values['courseSearch']);
    }

    const categoryChanged =
      values['category'] !== undefined &&
      values['category'] !== this.selectedCategory;
    const programChanged =
      values['program'] !== undefined &&
      values['program'] !== this.selectedProgram;
    const yearChanged =
      values['yearLevel'] !== undefined &&
      values['yearLevel'] !== this.selectedYear;
    const semesterChanged =
      values['semester'] !== undefined &&
      values['semester'] !== this.selectedSemester;

    if (categoryChanged) {
      this.selectedCategory = values['category'];
      localStorage.setItem(
        'curriculum_selected_category',
        this.selectedCategory
      );
      this.renderGroups = []; // Immediate clear
      needsRender = true;
      if (this.selectedCategory === 'Bridging') {
        refreshBridging = true;
        this.electiveSlots = [];
      }
    }

    if (programChanged) {
      this.selectedProgram = values['program'];
      this.selectedYear = 'All';
      this.selectedSemester = 'All';
      localStorage.setItem(
        'curriculum_selected_program',
        String(this.selectedProgram)
      );
      localStorage.setItem(
        'curriculum_selected_year',
        String(this.selectedYear)
      );
      localStorage.setItem(
        'curriculum_selected_semester',
        String(this.selectedSemester)
      );
      refreshBridging = true;
      needsRender = true;
    } else {
      if (yearChanged) {
        this.selectedYear = values['yearLevel'];
        localStorage.setItem(
          'curriculum_selected_year',
          String(this.selectedYear)
        );
        refreshBridging = true;
        needsRender = true;
      }
      if (semesterChanged) {
        this.selectedSemester = values['semester'];
        localStorage.setItem(
          'curriculum_selected_semester',
          String(this.selectedSemester)
        );
        refreshBridging = true;
        needsRender = true;
      }
    }

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
  isCourseDuplicate(
    courseCode: string,
    excludeCourseId?: number,
    curriculaProgramId?: number,
    isBridging: boolean = false
  ): boolean {
    if (!this.curriculum || isBridging) return false;
    
    const codeToCheck = courseCode.trim().toLowerCase();

    if (curriculaProgramId !== undefined) {
      const prog = this.curriculum.programs.find(
        p => p.curricula_program_id === curriculaProgramId
      );
      if (!prog) return false;

      return prog.year_levels.some(yl =>
        yl.semesters.some(sem =>
          sem.courses.some(c =>
            c.course_code.trim().toLowerCase() === codeToCheck && 
            c.course_id !== excludeCourseId
          )
        )
      );
    }

    return this.curriculum.programs.some(prog =>
      prog.year_levels.some(yl =>
        yl.semesters.some(sem =>
          sem.courses.some(c =>
            c.course_code.trim().toLowerCase() === codeToCheck && 
            c.course_id !== excludeCourseId
          )
        )
      )
    );
  }

  onEditCourse(course: Course, group: any) {
    const dialogConfig = this.getCourseDialogConfig(course, undefined, group);
    const dialogRef = this.dialog.open(TableDialogComponent, {
      data: dialogConfig, autoFocus: true,
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        if (
          this.isCourseDuplicate(
            result.course_code,
            course.course_id,
            group.program.curricula_program_id
          )
        ) {
          this.snackBar.open(
            `Error: Course Code '${result.course_code}' is already used!`,
            'Close',
            { duration: 4000 }
          );
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
            this.snackBar.open(`Error updating course.`, 'Close', { duration: 3000 });
          },
        });
      }
    });
  }

  onDeleteCourse(course: Course, group: any) {
    this.curriculumService.deleteCourse(course.course_id).subscribe({
      next: () => {
        this.snackBar.open(
          `Course deleted successfully.`,
          'Close',
          { duration: 3000 }
        );

        // Optimistically remove from local state for instant feedback
        this.removeCourseLocally(course.course_id, group);

        // Silent background refresh to sync with server
        this.fetchCurriculum(
          this.curriculum!.curriculum_year.toString(), true
        );
      },
      error: () => {
        this.snackBar.open(
          `Error deleting course.`, 'Close', { duration: 3000 }
        );
      },
    });
  }

  onAddCourse(group: any) {
    if (!this.curriculum) return;

    const dialogConfig = this.getCourseDialogConfig(undefined, group.originalSemester.semester, group);
    const dialogRef = this.dialog.open(TableDialogComponent, {
      data: dialogConfig, autoFocus: true,
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        if (
          this.isCourseDuplicate(
            result.course_code,
            undefined,
            group.program.curricula_program_id
          )
        ) {
          this.snackBar.open(
            `Error: Course Code '${result.course_code}' is already used!`,
            'Close',
            { duration: 4000 }
          );
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
            ...preReqIds.map((id: number) => ({ requirement_type: 'pre', required_course_id: id })),
            ...coReqIds.map((id: number) => ({ requirement_type: 'co', required_course_id: id })),
          ],
        };

        this.curriculumService.addCourse(newCourse).subscribe({
          next: () => {
            this.snackBar.open(`Course added successfully.`, 'Close', { duration: 3000 });
            this.fetchCurriculum(this.curriculum!.curriculum_year.toString(), true);
          },
          error: (error) => {
            this.snackBar.open('Error adding course. Please try again.', 'Close', { duration: 3000 });
          },
        });
      }
    });
  }


  /**
   * Removes a course from the local curriculum data structure
   * immediately, without waiting for a server round-trip.
   */
  private removeCourseLocally(
    courseId: number,
    group: any
  ): void {
    const sem = group.originalSemester;

    if (sem && Array.isArray(sem.courses)) {
      sem.courses = sem.courses.filter(
        (c: Course) => c.course_id !== courseId
      );
    }

    this.updateRenderGroups();
    this.cdr.detectChanges();
  }

  private mapTitlesToIds(
    titles: any,
    programBridgingCourses: BridgingCourse[] = []
  ): number[] {
    return Array.isArray(titles)
      ? titles.filter((title: string) => title && title !== 'None')
          .map((title: string) =>
            this.getCourseIdByTitle(title, programBridgingCourses)
          )
          .filter(
            (id: number | undefined) => id !== undefined
          ) as number[]
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

  get canManageBridgingCourses(): boolean {
    return (!!this.curriculum && this.selectedProgram !== 'All' && this.selectedYear !== 'All' && this.selectedSemester !== 'All');
  }

  get canManageElectives(): boolean {
    return (
      !!this.curriculum &&
      this.selectedProgram !== 'All' &&
      this.selectedYear !== 'All' &&
      this.selectedSemester !== 'All'
    );
  }

  get bridgingHeading(): string {
    const program = this.getSelectedProgramData();
    if (!program || this.selectedYear === 'All' || this.selectedSemester === 'All') return 'Bridging Courses';
    const programLabel = program.program_code || program.name;
    return `Bridging Courses - ${programLabel} - Year ${this.selectedYear} - ${this.getSemesterDisplay(Number(this.selectedSemester))}`;
  }

  private getSelectedProgramData(): Program | undefined {
    if (!this.curriculum || this.selectedProgram === 'All') return undefined;
    return this.curriculum.programs.find((p) => p.curricula_program_id === Number(this.selectedProgram));
  }

  private getSelectedYearLevelData(program: Program, yearLevel: number): YearLevel | undefined {
    return program.year_levels.find((yl) => yl.year === yearLevel);
  }

  private getSelectedSemesterData(yearLevel: YearLevel, semesterValue: number): Semester | undefined {
    return yearLevel.semesters.find((sem) => sem.semester === semesterValue);
  }

  private getProgramYearCourses(program: Program, yearLevel: number, semesterValue?: number): Course[] {
    const year = this.getSelectedYearLevelData(program, yearLevel);
    if (!year) return [];

    const semesters = semesterValue ? year.semesters.filter((sem) => sem.semester === semesterValue) : year.semesters;
    const allCourses = semesters.flatMap((sem) => sem.courses || []);
    const uniqueCourses = new Map<number, Course>();
    allCourses.forEach((course) => { uniqueCourses.set(course.course_id, course); });

    return Array.from(uniqueCourses.values()).sort((a, b) => a.course_code.localeCompare(b.course_code));
  }

  private getBridgingDialogConfig(program: Program, yearLevel: number, course?: BridgingCourse, preReqTitles: string[] = [], coReqTitles: string[] = [], programBridgingCourses: BridgingCourse[] = []): DialogConfig {
    const regularCourses = Array.from(new Set(program.year_levels.flatMap((yl) => yl.semesters).flatMap((sem) => sem.courses).map((item) => `${item.course_code} - ${item.course_title}`)));
    const bridgingCourses = programBridgingCourses.map(bc => `${bc.course_code} - ${bc.course_title}`);
    const availableCourseTitles = Array.from(new Set([...regularCourses, ...bridgingCourses])).sort((a, b) => a.localeCompare(b));

    return {
      title: course ? 'Edit Bridging Course' : 'Add Bridging Course',
      isEdit: !!course,
      fields: [
        { label: 'Course Code', formControlName: 'course_code', type: 'text', maxLength: 50, required: true },
        { label: 'Pre-requisite', formControlName: 'pre_req', type: 'multiselect', options: availableCourseTitles, required: false },
        { label: 'Co-requisite', formControlName: 'co_req', type: 'multiselect', options: availableCourseTitles, required: false },
        { label: 'Course Title', formControlName: 'course_title', type: 'text', maxLength: 100, required: true },
        { label: 'Lecture Hours', formControlName: 'lec_hours', type: 'number', min: 0, maxLength: 2, required: true },
        { label: 'Laboratory Hours', formControlName: 'lab_hours', type: 'number', min: 0, maxLength: 2, required: true },
        { label: 'Units', formControlName: 'units', type: 'number', min: 0, maxLength: 2, required: true },
        { label: 'Tuition Hours', formControlName: 'tuition_hours', type: 'number', min: 0, maxLength: 2, required: true },
      ],
      initialValue: course ? { course_code: course.course_code, course_title: course.course_title, lec_hours: course.lec_hours, lab_hours: course.lab_hours, units: course.units, tuition_hours: course.tuition_hours, pre_req: preReqTitles, co_req: coReqTitles } : { pre_req: preReqTitles, co_req: coReqTitles },
    };
  }

  private mapRequirementTitles(requirements: CourseRequirementLink[] | undefined, courses: CourseWithRequirements[], type: 'pre' | 'co'): string[] {
    if (!requirements?.length) return [];
    return requirements.filter((req) => req.requirement_type === type).map((req) => {
        const course = courses.find((candidate) => candidate.course_id === req.required_course_id);
        return course ? `${course.course_code} - ${course.course_title}` : null;
      }).filter((title): title is string => !!title);
  }

  /**
   * Handles adding a bridging course from a specific group.
   * @param group The group from which to add a bridging course.
   */
  onAddBridgingCourseFromGroup(group: any): void {
    if (!this.curriculum) return;

    const program = group.program;
    const yearLevelData = group.yearLevel;
    const semesterData = group.originalSemester;
    const programId = program.program_id;

    if (!program || !programId || !yearLevelData || !yearLevelData.year_level_id || !semesterData) return;

    this.curriculumService.getBridgingCourses(this.curriculum.curriculum_id, programId).subscribe({
      next: (programBridgingCourses) => {
        const dialogConfig = this.getBridgingDialogConfig(program, yearLevelData.year, undefined, [], [], programBridgingCourses);
        const dialogRef = this.dialog.open(TableDialogComponent, { data: dialogConfig, autoFocus: true });

        dialogRef.afterClosed().subscribe((result) => {
          if (!result) return;

          const preReqIds = this.mapTitlesToIds(result.pre_req, programBridgingCourses);
          const coReqIds = this.mapTitlesToIds(result.co_req, programBridgingCourses);

          this.isManagingBridging = true;

          this.curriculumService.addCourse({
            course_code: result.course_code, course_title: result.course_title, lec_hours: Number(result.lec_hours), lab_hours: Number(result.lab_hours), units: Number(result.units), tuition_hours: Number(result.tuition_hours),
            requirements: [
              ...preReqIds.map((id: number) => ({ requirement_type: 'pre', required_course_id: id })),
              ...coReqIds.map((id: number) => ({ requirement_type: 'co', required_course_id: id })),
            ],
          })
            .pipe(
              switchMap((response) => {
                const createdCourseId = response?.course?.course_id;
                if (!createdCourseId) throw new Error('Course creation response missing course id.');
                return this.curriculumService.addBridgingCourse({
                  curriculum_id: this.curriculum!.curriculum_id, program_id: programId, year_level_id: yearLevelData.year_level_id, semester_id: semesterData.semester_id, course_id: createdCourseId,
                });
              })
            )
            .pipe(finalize(() => (this.isManagingBridging = false)))
            .subscribe({
              next: () => {
                this.snackBar.open('Bridging course added successfully.', 'Close', { duration: 3000 });
                if (this.selectedCategory === 'Bridging') {
                  this.updateBridgingRenderGroups();
                } else {
                  this.loadBridgingCourses();
                }
              },
              error: (error) => { this.snackBar.open(error?.error?.message || error?.message || 'Error adding bridging course. Please try again.', 'Close', { duration: 3000 }); },
            });
        });
      },
      error: (error) => { this.snackBar.open('Error loading prerequisite options. Please try again.', 'Close', { duration: 3000 }); },
    });
  }

  private loadBridgingCourses(): void {
    if (!this.canManageBridgingCourses || !this.curriculum) { this.bridgingCourses = []; return; }

    const program = this.getSelectedProgramData();
    const yearLevel = Number(this.selectedYear);
    const semesterValue = Number(this.selectedSemester);
    const programId = program?.program_id;

    const yearLevelData = program ? this.getSelectedYearLevelData(program, yearLevel) : undefined;
    const semesterData = yearLevelData ? this.getSelectedSemesterData(yearLevelData, semesterValue) : undefined;

    if (!program || !programId || !yearLevel || !yearLevelData || !yearLevelData.year_level_id || !semesterData) {
      this.bridgingCourses = [];
      return;
    }

    this.isLoadingBridging = true;

    this.curriculumService.getBridgingCourses(this.curriculum.curriculum_id, programId, yearLevelData.year_level_id, semesterData.semester_id)
      .pipe(finalize(() => (this.isLoadingBridging = false)))
      .subscribe({
        next: (courses) => {
          this.bridgingCourses = courses.map((course) => {
            const preReqCodes = course.prerequisites?.map((req) => req.course_code) || [];
            const coReqCodes = course.corequisites?.map((req) => req.course_code) || [];

            return {
              ...course,
              pre_req: preReqCodes.length ? preReqCodes.join(', ') : 'None',
              co_req: coReqCodes.length ? coReqCodes.join(', ') : 'None',
            };
          });
          this.cdr.markForCheck();
        },
        error: (error) => { this.snackBar.open('Error fetching bridging courses. Please try again.', 'Close', { duration: 3000 }); },
      });
  }

  onAddBridgingCourse(): void {
    if (!this.canManageBridgingCourses || !this.curriculum) {
      this.snackBar.open('Select a program, year level, and semester to manage bridging courses.', 'Close', { duration: 3000 });
      return;
    }

    const program = this.getSelectedProgramData();
    const yearLevel = Number(this.selectedYear);
    const semesterValue = Number(this.selectedSemester);
    const programId = program?.program_id;

    const yearLevelData = program ? this.getSelectedYearLevelData(program, yearLevel) : undefined;
    const semesterData = yearLevelData ? this.getSelectedSemesterData(yearLevelData, semesterValue) : undefined;

    if (!program || !programId || !yearLevel || !yearLevelData || !yearLevelData.year_level_id || !semesterData) return;

    this.curriculumService.getBridgingCourses(this.curriculum.curriculum_id, programId).subscribe({
        next: (programBridgingCourses) => {
          const dialogConfig = this.getBridgingDialogConfig(program, yearLevel, undefined, [], [], programBridgingCourses);
          const dialogRef = this.dialog.open(TableDialogComponent, { data: dialogConfig, autoFocus: true });

          dialogRef.afterClosed().subscribe((result) => {
            if (!result) return;

            const preReqIds = this.mapTitlesToIds(result.pre_req, programBridgingCourses);
            const coReqIds = this.mapTitlesToIds(result.co_req, programBridgingCourses);

            this.isManagingBridging = true;

            this.curriculumService.addCourse({
                course_code: result.course_code, course_title: result.course_title, lec_hours: Number(result.lec_hours), lab_hours: Number(result.lab_hours), units: Number(result.units), tuition_hours: Number(result.tuition_hours),
                requirements: [
                  ...preReqIds.map((id: number) => ({ requirement_type: 'pre', required_course_id: id })),
                  ...coReqIds.map((id: number) => ({ requirement_type: 'co', required_course_id: id })),
                ],
              })
              .pipe(
                switchMap((response) => {
                  const createdCourseId = response?.course?.course_id;
                  if (!createdCourseId) throw new Error('Course creation response missing course id.');
                  if (yearLevelData.year_level_id === undefined || semesterData.semester_id === undefined) throw new Error('Invalid year level or semester data.');
                  return this.curriculumService.addBridgingCourse({
                    curriculum_id: this.curriculum!.curriculum_id, program_id: programId, year_level_id: yearLevelData.year_level_id, semester_id: semesterData.semester_id, course_id: createdCourseId,
                  });
                })
              )
              .pipe(finalize(() => (this.isManagingBridging = false)))
              .subscribe({
                next: () => { this.snackBar.open('Bridging course added successfully.', 'Close', { duration: 3000 }); this.loadBridgingCourses(); },
                error: (error) => { this.snackBar.open(error?.error?.message || error?.message || 'Error adding bridging course. Please try again.', 'Close', { duration: 3000 }); },
              });
          });
        },
        error: (error) => { this.snackBar.open('Error loading prerequisite options. Please try again.', 'Close', { duration: 3000 }); },
      });
  }

  onEditBridgingCourse(bridgingCourse: BridgingCourse): void {
    if (!this.curriculum) return;

    // Use context from the course item if available (from aggregated view), otherwise fallback to global filters
    const bc = bridgingCourse as any;
    const program = bc.program || this.getSelectedProgramData();
    const yearLevel = bc.yearLevel?.year || Number(this.selectedYear);
    const semesterValue = bc.originalSemester?.semester || Number(this.selectedSemester);
    const programId = program?.program_id;

    const yearLevelData = bc.yearLevel || (program ? this.getSelectedYearLevelData(program, yearLevel) : undefined);
    const semesterData = bc.originalSemester || (yearLevelData ? this.getSelectedSemesterData(yearLevelData, semesterValue) : undefined);

    if (!program || !programId || (this.selectedYear !== 'All' && !yearLevel) || !yearLevelData || !yearLevelData.year_level_id || !semesterData) {
      this.snackBar.open('Cannot determine course context for editing.', 'Close', { duration: 3000 });
      return;
    }

    forkJoin({
      courses: this.curriculumService.getAllCourses(),
      programBridgingCourses: this.curriculumService.getBridgingCourses(this.curriculum.curriculum_id, programId),
    }).subscribe({
      next: ({ courses, programBridgingCourses }) => {
        const currentCourse = courses.find((course) => course.course_id === bridgingCourse.course_id);
        const preReqTitles = this.mapRequirementTitles(currentCourse?.requirements, courses, 'pre');
        const coReqTitles = this.mapRequirementTitles(currentCourse?.requirements, courses, 'co');

        const dialogConfig = this.getBridgingDialogConfig(program, yearLevel, bridgingCourse, preReqTitles, coReqTitles, programBridgingCourses);
        const dialogRef = this.dialog.open(TableDialogComponent, { data: dialogConfig, autoFocus: true });

        dialogRef.afterClosed().subscribe((result) => {
          if (!result) return;
          const preReqIds = this.mapTitlesToIds(result.pre_req, programBridgingCourses);
          const coReqIds = this.mapTitlesToIds(result.co_req, programBridgingCourses);

          this.isManagingBridging = true;

          this.curriculumService.updateCourse(bridgingCourse.course_id, {
              course_code: result.course_code, course_title: result.course_title, lec_hours: Number(result.lec_hours), lab_hours: Number(result.lab_hours), units: Number(result.units), tuition_hours: Number(result.tuition_hours),
              requirements: [
                ...preReqIds.map((id: number) => ({ requirement_type: 'pre', required_course_id: id })),
                ...coReqIds.map((id: number) => ({ requirement_type: 'co', required_course_id: id })),
              ],
            })
            .pipe(finalize(() => (this.isManagingBridging = false)))
            .subscribe({
              next: () => {
                this.snackBar.open('Bridging course updated successfully.', 'Close', { duration: 3000 });
                if (this.selectedCategory === 'Bridging') {
                  this.updateBridgingRenderGroups();
                } else {
                  this.loadBridgingCourses();
                }
              },
              error: (error) => { this.snackBar.open(error?.error?.message || error?.message || 'Error updating bridging course.', 'Close', { duration: 3000 }); },
            });
        });
      },
      error: (error) => { this.snackBar.open('Error loading course details.', 'Close', { duration: 3000 }); },
    });
  }

  onDeleteBridgingCourse(bridgingCourse: BridgingCourse): void {
    this.isManagingBridging = true;

    this.curriculumService.deleteBridgingCourse(bridgingCourse.bridging_course_id)
      .pipe(finalize(() => (this.isManagingBridging = false)))
      .subscribe({
        next: () => {
          this.snackBar.open('Bridging course deleted successfully.', 'Close', { duration: 3000 });
          if (this.selectedCategory === 'Bridging') {
            this.updateBridgingRenderGroups();
          } else {
            this.loadBridgingCourses();
          }
        },
        error: (error) => { this.snackBar.open(error?.error?.message || 'Error deleting bridging course.', 'Close', { duration: 3000 }); },
      });
  }

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
          data: dialogConfig, width: '25rem', autoFocus: true,
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
      error: (error) => { this.isManagingPrograms = false; },
    });
  }

  private getCourseDialogConfig(course?: Course, semester?: number, group?: any): DialogConfig {
    const program = group ? group.program : this.curriculum?.programs[0];
    const availableCourseTitles = program?.year_levels
      .flatMap((yl: any) => yl.semesters).flatMap((sem: any) => sem.courses)
      .map((c: any) => `${c.course_code} - ${c.course_title}`)
      .sort((a: string, b: string) => a.localeCompare(b)) || [];

    let existingPreReqs: string[] = course?.prerequisites ? course.prerequisites
      .map(p => `${p.course_code} - ${p.course_title}`) : [];
    let existingCoReqs: string[] = course?.corequisites ? course.corequisites
      .map(c => `${c.course_code} - ${c.course_title}`) : [];

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
        { label: 'Tuition Hours', formControlName: 'tuition_hours', type: 'number', min: 0, maxLength: 2, required: true},
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

  private programHasCourses(program: Program, filterYear: string | number, filterSemester: string | number): boolean {
    let yearLevels = program.year_levels;
    if (filterYear !== 'All') yearLevels = yearLevels.filter(yl => yl.year === Number(filterYear));

    for (const yl of yearLevels) {
      let semesters = yl.semesters;
      if (filterSemester !== 'All') semesters = semesters.filter(sem => sem.semester === Number(filterSemester));
      if (semesters.some(sem => sem.courses && sem.courses.length > 0)) return true;
    }
    return false;
  }

  // ===========================
  // EXPORT (PDF & EXCEL)
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
        customTitle: exportAll ? 'All Programs Curriculum' : (this.selectedCategory === 'Bridging' ? 'Bridging Courses Curriculum' : 'Curriculum Export'),
        subtitle: `Curriculum Year ${this.curriculum?.curriculum_year}`,
        generatePdfFunction: (showPreview: boolean) => this.generatePDF(showPreview, exportAll),
        
        generateFileNameFunction: () => {
          const base = exportAll ? 'All_Programs' : 'Curriculum';
          const cat = this.selectedCategory === 'Bridging' ? '_Bridging' : '';
          return `${base}${cat}_${this.curriculum?.curriculum_year}.pdf`;
        },

        generateExcelFunction: async () => {
          const excelBlob = await this.generateExcel(exportAll);
          const base = exportAll ? 'All_Programs' : 'Curriculum';
          const cat = this.selectedCategory === 'Bridging' ? '_Bridging' : '';
          const fileName = `${base}${cat}_${this.curriculum?.curriculum_year}.xlsx`;
          saveAs(excelBlob, fileName);
        },

      },
      maxWidth: '70rem', width: '100%',
      autoFocus: true,
    });
    dialogRef.afterClosed().subscribe(() => {});
  }

  // --- NEW: EXCEL GENERATOR LOGIC ---
  private async generateExcel(exportAll: boolean): Promise<Blob> {
    const workbook = new ExcelJS.Workbook();
    const yearFilter = exportAll ? 'All' : this.selectedYear;
    const semFilter = exportAll ? 'All' : this.selectedSemester;

    let programsToExport = exportAll 
      ? this.curriculum!.programs 
      : (this.selectedProgram === 'All'
          ? this.curriculum!.programs
          : this.curriculum!.programs.filter(p => p.curricula_program_id === Number(this.selectedProgram)));

    // For Bridging Courses, we need to fetch data first
    let bridgingData: Map<number, BridgingCourse[]> = new Map();
    if (this.selectedCategory === 'Bridging') {
      const observables = programsToExport.map(p => 
        this.curriculumService.getBridgingCourses(this.curriculum!.curriculum_id, p.program_id, 
          yearFilter !== 'All' ? p.year_levels.find(yl => yl.year === Number(yearFilter))?.year_level_id : undefined,
          undefined // Fetch all semesters, filter later for consistency
        ).pipe(switchMap(courses => of({ programId: p.program_id, courses })))
      );
      const results = await firstValueFrom(forkJoin(observables));
      results.forEach(r => bridgingData.set(r.programId, r.courses));
    }

    const activePrograms = programsToExport.filter(p => 
      this.selectedCategory === 'Bridging' 
        ? (bridgingData.get(p.program_id)?.length || 0) > 0
        : this.programHasCourses(p, yearFilter, semFilter)
    );

    if (activePrograms.length === 0) {
      const sheet = workbook.addWorksheet('No Data');
      sheet.getCell('A1').value = 'No courses available for the selected filters.';
    } else {
      activePrograms.forEach((program) => {
        let tabName = program.name.substring(0, 31).replace(/[^\w\s-]/gi, '');
        const worksheet = workbook.addWorksheet(tabName);

        worksheet.pageSetup = {
          orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
          margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 }
        };

        worksheet.columns = [
          { width: 5 },  // #
          { width: 15 }, // Course Code
          { width: 20 }, // Pre-req
          { width: 20 }, // Co-req
          { width: 40 }, // Title
          { width: 8 },  // Lec
          { width: 8 },  // Lab
          { width: 8 },  // Units
          { width: 12 }  // Tuition
        ];

        worksheet.mergeCells('A1:I1');
        worksheet.mergeCells('A2:I2');
        
        const titleCell = worksheet.getCell('A1');
        const catLabel = this.selectedCategory === 'Bridging' ? ' (Bridging Courses)' : '';
        titleCell.value = `Program: ${program.program_title.toUpperCase()} (${program.name})${catLabel}`;
        titleCell.font = { bold: true, size: 14 };
        
        const subCell = worksheet.getCell('A2');
        subCell.value = `Curriculum Year: ${this.curriculum?.curriculum_year}`;
        subCell.font = { bold: true };
        
        worksheet.addRow([]);

        let sortedYearLevels = program.year_levels.sort((a, b) => a.year - b.year);
        if (yearFilter !== 'All') {
          sortedYearLevels = sortedYearLevels.filter(yl => yl.year === Number(yearFilter));
        }

        sortedYearLevels.forEach(yearLevel => {
          let sortedSemesters = yearLevel.semesters.sort((a, b) => a.semester - b.semester);
          if (semFilter !== 'All') {
            sortedSemesters = sortedSemesters.filter(sem => sem.semester === Number(semFilter));
          }

          sortedSemesters.forEach(semester => {
            let coursesToExport: any[] = [];
            if (this.selectedCategory === 'Bridging') {
              coursesToExport = bridgingData.get(program.program_id)
                ?.filter(bc => bc.year_level_id === yearLevel.year_level_id && bc.semester_id === semester.semester_id) || [];
            } else {
              coursesToExport = semester.courses || [];
            }

            // Apply Search Filter for "Current View" export
            if (!exportAll && this.searchQuery) {
              const searchLower = this.searchQuery.toLowerCase().trim();
              coursesToExport = coursesToExport.filter(c => 
                c.course_code.toLowerCase().includes(searchLower) || 
                c.course_title.toLowerCase().includes(searchLower)
              );
            }

            if (coursesToExport.length === 0) return;

            // Semester Header Row
            const semPrefix = this.selectedCategory === 'Bridging' ? 'Bridging - ' : '';
            const semRow = worksheet.addRow([`${semPrefix}Year ${yearLevel.year} - ${this.getSemesterDisplay(semester.semester)}`]);
            worksheet.mergeCells(`A${semRow.number}:I${semRow.number}`);
            semRow.font = { bold: true, size: 12 };
            semRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
            semRow.getCell(1).border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };

            // Table Headers
            const headerRow = worksheet.addRow(['#', 'Course Code', 'Pre-req', 'Co-req', 'Course Title', 'Lec', 'Lab', 'Units', 'Tuition']);
            headerRow.font = { bold: true };
            headerRow.eachCell(cell => {
              cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
              cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF800000' } };
              cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
            });

            let totalUnits = 0;
            let totalTuition = 0;

            coursesToExport.forEach((course, idx) => {
              const processedCourse = this.selectedCategory === 'Bridging' 
                ? {
                    ...course,
                    pre_req: course.prerequisites?.map((p: any) => p.course_code) || [],
                    co_req: course.corequisites?.map((c: any) => c.course_code) || [],
                  }
                : this.populateCourseRequisites(course);

              const preReqs = Array.isArray(processedCourse.pre_req) ? processedCourse.pre_req.join(', ') : 'None';
              const coReqs = Array.isArray(processedCourse.co_req) ? processedCourse.co_req.join(', ') : 'None';

              const row = worksheet.addRow([
                idx + 1,
                processedCourse.course_code || 'N/A',
                preReqs,
                coReqs,
                processedCourse.course_title || 'N/A',
                processedCourse.lec_hours || 0,
                processedCourse.lab_hours || 0,
                processedCourse.units || 0,
                processedCourse.tuition_hours || 0
              ]);
              
              totalUnits += (processedCourse.units || 0);
              totalTuition += (processedCourse.tuition_hours || 0);

              row.eachCell((cell, colNum) => {
                cell.alignment = { vertical: 'middle', horizontal: colNum >= 6 ? 'center' : 'left', wrapText: true };
                cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
              });
            });

            // Totals Row
            const totalRow = worksheet.addRow(['TOTAL:', '', '', '', '', '', '', totalUnits, totalTuition]);
            worksheet.mergeCells(`A${totalRow.number}:G${totalRow.number}`);
            totalRow.getCell(1).alignment = { horizontal: 'right', vertical: 'middle' };
            totalRow.font = { bold: true };
            totalRow.eachCell((cell, colNum) => {
              if (colNum === 1 || colNum >= 8) {
                 cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
                 if (colNum >= 8) cell.alignment = { horizontal: 'center' };
              }
            });

            worksheet.addRow([]); // Blank row for spacing
          });
        });
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  // --- PDF LOGIC ---
  async generatePDF(
    showPreview: boolean = false, exportAll: boolean = false
  ): Promise<void | Blob> {
    const doc = new jsPDF('p', 'mm', 'letter') as any;

    if (this.curriculum) {
      const yearFilter = exportAll ? 'All' : this.selectedYear;
      const semFilter = exportAll ? 'All' : this.selectedSemester;

      let programsToExport = exportAll 
        ? this.curriculum.programs 
        : (this.selectedProgram === 'All'
            ? this.curriculum.programs
            : this.curriculum.programs.filter(p => p.curricula_program_id === Number(this.selectedProgram)));

      // Fetch bridging data if needed
      let bridgingData: Map<number, BridgingCourse[]> = new Map();
      if (this.selectedCategory === 'Bridging') {
        const observables = programsToExport.map(p => 
          this.curriculumService.getBridgingCourses(this.curriculum!.curriculum_id, p.program_id, 
            yearFilter !== 'All' ? p.year_levels.find(yl => yl.year === Number(yearFilter))?.year_level_id : undefined,
            undefined
          ).pipe(switchMap(courses => of({ programId: p.program_id, courses })))
        );
        const results = await firstValueFrom(forkJoin(observables));
        results.forEach(r => bridgingData.set(r.programId, r.courses));
      }

      const activePrograms = programsToExport.filter(p => 
        this.selectedCategory === 'Bridging'
          ? (bridgingData.get(p.program_id)?.length || 0) > 0
          : this.programHasCourses(p, yearFilter, semFilter)
      );

      if (activePrograms.length === 0) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(14);
        doc.text("No courses available for the selected filters.", 10, 20);
      } else {
        for (const [index, program] of activePrograms.entries()) {
          await this.addProgramToPDF(
            doc, 
            program, 
            index === 0, 
            yearFilter, 
            semFilter, 
            exportAll, 
            bridgingData.get(program.program_id)
          );
        }
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

  private async addProgramToPDF(
    doc: any,
    program: Program,
    isFirstProgram: boolean,
    filterYear: string | number,
    filterSemester: string | number,
    exportAll: boolean,
    bridgingCourses?: BridgingCourse[]
  ): Promise<void> {
    const pageHeight = doc.internal.pageSize.height;
    const margin = 10;
    const topMargin = 15;
    const bottomMargin = 20; 

    if (!isFirstProgram) {
      this.reportHeaderService.addStandardFooter(doc); 
      doc.addPage();
    }

    let currentY = topMargin;

    return new Promise((resolve) => {
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

              for (const semester of sortedSemesters) {
                let coursesToExport: any[] = [];
                if (this.selectedCategory === 'Bridging' && bridgingCourses) {
                  coursesToExport = bridgingCourses.filter(bc => bc.year_level_id === yearLevel.year_level_id && bc.semester_id === semester.semester_id);
                } else {
                  coursesToExport = semester.courses || [];
                }

                // Apply Search Filter for "Current View" export
                if (!exportAll && this.searchQuery) {
                  const searchLower = this.searchQuery.toLowerCase().trim();
                  coursesToExport = coursesToExport.filter(c => 
                    c.course_code.toLowerCase().includes(searchLower) || 
                    c.course_title.toLowerCase().includes(searchLower)
                  );
                }

                if (coursesToExport.length === 0) continue;

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
              const mainTitle = this.selectedCategory === 'Bridging' ? `${program.name} - Bridging Courses` : `${program.name} - Year ${yearLevel.year}`;
              doc.text(mainTitle, margin, currentY);
              currentY += 10;

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
                doc.text(`${mainTitle} (continued)`, margin, currentY);
                currentY += 10;
              }

              doc.setFont('helvetica', 'bold');
              doc.setFontSize(13);
              doc.text(`Year ${yearLevel.year} - ${this.getSemesterDisplay(semester.semester)}`, margin, currentY);
              currentY += 6;

              const tableData: (string | TableCell)[][] = coursesToExport.map((course) => {
                const processedCourse = this.selectedCategory === 'Bridging'
                  ? {
                      ...course,
                      pre_req: course.prerequisites?.map((p: any) => p.course_code) || [],
                      co_req: course.corequisites?.map((c: any) => c.course_code) || [],
                    }
                  : this.populateCourseRequisites(course);

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

              const totalUnits = coursesToExport.reduce((sum, course) => sum + (course.units || 0), 0);
              const totalTuition = coursesToExport.reduce((sum, course) => sum + (course.tuition_hours || 0), 0);

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
          resolve();
        });
    });
  }

  cancelPreview(): void {
    this.showPreview = false;
  }
}
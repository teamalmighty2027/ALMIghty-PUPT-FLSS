import { Component, OnInit, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';

import { forkJoin, Observable, Subject } from 'rxjs';
import { finalize, switchMap, takeUntil, tap } from 'rxjs/operators';

import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';

import { TableGenericComponent } from '../../../../../../shared/table-generic/table-generic.component';
import { TableHeaderComponent, InputField } from '../../../../../../shared/table-header/table-header.component';
import { TableDialogComponent, DialogConfig } from '../../../../../../shared/table-dialog/table-dialog.component';
import { DialogExportComponent } from '../../../../../../shared/dialog-export/dialog-export.component';
import { LoadingComponent } from '../../../../../../shared/loading/loading.component';
import { fadeAnimation, pageFloatUpAnimation } from '../../../../../animations/animations';

import { CurriculumService, Curriculum, Program, YearLevel, Semester, Course, CourseRequirement } from '../../../../../services/superadmin/curriculum/curriculum.service';
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
  
  public renderGroups: any[] = []; 
  
  public customExportOptions: { all: string; current: string } | null = null;
  private destroy$ = new Subject<void>();
  public showPreview: boolean = false;
  public isLoading: boolean = true;
  public isManagingPrograms: boolean = false;

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
    if (curriculumYear) {
      this.fetchCurriculum(curriculumYear);
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  fetchCurriculum(year: string) {
    this.isLoading = true;

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

  updateHeaderInputFields() {
    const programOptions = [
      { key: 'All', label: 'All Programs' },
      ...(this.curriculum?.programs.map((p) => ({
        key: p.curricula_program_id,
        label: `${p.name} - ${p.program_title}`,
      })) || [])
    ];

    // FIX: Set type to any[] to allow mixing 'All' (string) and numbers
    let yearLevelOptions: any[] = [{ key: 'All', label: 'All Year Levels' }];
    if (this.selectedProgram !== 'All') {
      const selectedProgramData = this.curriculum?.programs.find(
        (p) => p.curricula_program_id === Number(this.selectedProgram)
      );
      if (selectedProgramData) {
        yearLevelOptions = [
          { key: 'All', label: 'All Year Levels' },
          ...Array.from({ length: selectedProgramData.number_of_years }, (_, i) => ({
            key: i + 1,
            label: `Year ${i + 1}`,
          }))
        ];
      }
    } else {
      yearLevelOptions = [
        { key: 'All', label: 'All Year Levels' },
        { key: 1, label: 'Year 1' }, { key: 2, label: 'Year 2' },
        { key: 3, label: 'Year 3' }, { key: 4, label: 'Year 4' }, { key: 5, label: 'Year 5' }
      ];
    }

    // FIX: Set type to any[]
    const semesterOptions: any[] = [
      { key: 'All', label: 'All Semesters' },
      { key: 1, label: '1st Semester' },
      { key: 2, label: '2nd Semester' },
      { key: 3, label: 'Summer Term' }
    ];

    this.headerInputFields = [
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

          const processedCourses = sem.courses.map(course => ({
            ...course,
            pre_req: course.prerequisites?.map(p => p.course_code).join(', ') || 'None',
            co_req: course.corequisites?.map(c => c.course_code).join(', ') || 'None',
          }));

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

    this.renderGroups = groups;
    this.cdr.detectChanges();
  }

  onInputChange(values: { [key: string]: any }) {
    let resetYear = false;

    if (values['program'] !== undefined && values['program'] !== this.selectedProgram) {
      this.selectedProgram = values['program'];
      resetYear = true;
    }
    if (values['yearLevel'] !== undefined) {
      this.selectedYear = values['yearLevel'];
    }
    if (values['semester'] !== undefined) {
      this.selectedSemester = values['semester'];
    }

    if (resetYear) {
      this.selectedYear = 'All';
    }

    this.updateHeaderInputFields();
    this.updateRenderGroups();
    this.updateCustomExportOptions();
  }

  // ===========================
  // Duplicate Detection Logic
  // ===========================
  isCourseDuplicate(courseCode: string, excludeCourseId?: number): boolean {
    if (!this.curriculum) return false;
    
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
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        
        // NEW: Check for duplicates before updating
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
            this.fetchCurriculum(this.curriculum!.curriculum_year.toString());
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
        this.fetchCurriculum(this.curriculum!.curriculum_year.toString());
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
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        
        // NEW: Check for duplicates before adding
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
            ...preReqIds.map((id: number) => ({ requirement_type: 'pre', required_course_id: id })),
            ...coReqIds.map((id: number) => ({ requirement_type: 'co', required_course_id: id })),
          ],
        };

        this.curriculumService.addCourse(newCourse).subscribe({
          next: () => {
            this.snackBar.open(`Course added successfully.`, 'Close', { duration: 3000 });
            this.fetchCurriculum(this.curriculum!.curriculum_year.toString());
          },
          error: (error) => {
            console.error('Error adding course:', error);
            this.snackBar.open('Error adding course. Please try again.', 'Close', { duration: 3000 });
          },
        });
      }
    });
  }

  private mapTitlesToIds(titles: any): number[] {
    return Array.isArray(titles)
      ? titles
          .filter((title: string) => title && title !== 'None')
          .map((title: string) => this.getCourseIdByTitle(title))
          .filter((id: number | undefined) => id !== undefined) as number[]
      : [];
  }

  getCourseIdByTitle(title: string): number | undefined {
    const course = this.curriculum?.programs
      .flatMap((program) => program.year_levels)
      .flatMap((yearLevel) => yearLevel.semesters)
      .flatMap((sem) => sem.courses)
      .find((course) => `${course.course_code} - ${course.course_title}` === title);
    return course?.course_id;
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
    });
    dialogRef.afterClosed().subscribe(() => {});
  }

  generatePDF(showPreview: boolean = false, exportAll: boolean = false): void {
    const doc = new jsPDF('p', 'mm', 'letter') as any;

    if (this.curriculum) {
      if (exportAll) {
        this.curriculum.programs.forEach((program, index) => {
          this.addProgramToPDF(doc, program, index === 0, 'All', 'All');
        });
      } else {
        const programsToExport = this.selectedProgram === 'All'
          ? this.curriculum.programs
          : this.curriculum.programs.filter(p => p.curricula_program_id === Number(this.selectedProgram));

        programsToExport.forEach((program, index) => {
          this.addProgramToPDF(doc, program, index === 0, this.selectedYear, this.selectedSemester);
        });
      }

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
    const bottomMargin = 15;

    if (!isFirstProgram) doc.addPage();

    let currentY = topMargin;

    this.reportHeaderService.addHeader(doc, `Curriculum Year ${this.curriculum?.curriculum_year || ''}`, currentY)
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

          const hasCoursesInYear = sortedSemesters.some(sem => sem.courses && sem.courses.length > 0);
          if (!hasCoursesInYear) continue;

          if (currentY + 20 > pageHeight - bottomMargin) {
            doc.addPage();
            this.reportHeaderService.addHeader(doc, `Curriculum Year ${this.curriculum?.curriculum_year || ''}`, topMargin)
              .subscribe((newPageY) => currentY = newPageY);
          }

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(15);
          doc.text(`${program.name} - Year ${yearLevel.year}`, margin, currentY);
          currentY += 10;

          for (const semester of sortedSemesters) {
            if (!semester.courses || semester.courses.length === 0) continue;
            
            if (currentY + 40 > pageHeight - bottomMargin) {
              doc.addPage();
              this.reportHeaderService.addHeader(doc, `Curriculum Year ${this.curriculum?.curriculum_year || ''}`, topMargin)
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
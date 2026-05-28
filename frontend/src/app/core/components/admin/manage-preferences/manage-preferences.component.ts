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
  inputFields: InputField[] = [
    {
      type: 'text',
      label: 'Search Faculty',
      key: 'searchFaculty',
    },
  ];

  displayedColumns: string[] = [
    'index',
    'facultyName',
    'facultyCode',
    'facultyType',
    'action',
    'requests',
    'toggle',
  ];

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

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadTerms(): void {
    this.reportsService.getAllTermsForDropdown().subscribe({
      next: (data) => {
        if (this.selectedTermId === null) {
          const activeTerm = data.find((term: any) => term.is_active === 1);
          if (activeTerm) {
            this.selectedTermId = activeTerm.active_semester_id;
          }
        }
        
        this.loadFacultyPreferences(this.selectedTermId);
      },
      error: (error) => {
        console.error('Error loading terms:', error);
      }
    });
  }

  onTermChange(termId: number | null): void {
    if (termId !== null && this.selectedTermId !== termId) {
      this.selectedTermId = termId;
      this.preferencesService.clearPreferencesCache();
      this.loadFacultyPreferences(termId);
    }
  }

  private setupFilterPredicate(): void {
    this.dataSource.filterPredicate = (data: Faculty, filter: string) => {
      return (
        data.facultyName.toLowerCase().includes(filter) ||
        data.facultyCode.toLowerCase().includes(filter) ||
        data.facultyType.toLowerCase().includes(filter)
      );
    };
  }

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

  private handleEmptyData(): void {
    this.allData = [];
    this.filteredData = [];
    this.dataSource.data = [];
    this.isLoading.next(false);
  }

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

    if (this.paginator) {
      this.paginator.firstPage();
    }
  }

  filterPredicate(data: Faculty, filter: string): boolean {
    return (
      data.facultyName.toLowerCase().includes(filter) ||
      data.facultyCode.toLowerCase().includes(filter) ||
      data.facultyType.toLowerCase().includes(filter)
    );
  }

  updateDisplayedData(): void {
    this.dataSource.data = [...this.filteredData];
  }

  onInputChange(inputValues: { [key: string]: any }): void {
    const searchValue = inputValues['searchFaculty'] || '';
    this.searchSubject.next(searchValue);
  }

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

  checkGlobalStartDate(): void {
    this.isGlobalStartDateSet = this.allData.some((faculty) =>
      faculty.active_semesters?.some(
        (semester) => semester.global_start_date !== null,
      ),
    );
  }

  checkIndividualStartDate(): void {
    this.isIndividualStartDateSet = this.allData.some((faculty) =>
      faculty.active_semesters?.some(
        (semester) => semester.individual_start_date !== null,
      ),
    );
  }

  updateHasAnyPreferences(): void {
    this.hasAnyPreferences = this.allData.some((faculty) =>
      this.hasSubmittedPreferences(faculty),
    );
  }

  hasSubmittedPreferences(faculty: Faculty): boolean {
    return !!(
      faculty.active_semesters &&
      faculty.active_semesters.length > 0 &&
      faculty.active_semesters.some(
        (semester) => semester.courses && semester.courses.length > 0,
      )
    );
  }

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

  isGloballyScheduled(): boolean {
    return this.allData.some((faculty) =>
      faculty.active_semesters?.some(
        (semester) =>
          semester.global_start_date !== null ||
          semester.global_deadline !== null,
      ),
    );
  }

  isIndividuallyScheduled(faculty?: Faculty): boolean {
    if (!faculty) return false;
    return this.facultyScheduledState.get(faculty.faculty_id) ?? false;
  }

  initializeScheduledFacultyState(): void {
    this.allData.forEach((faculty: Faculty) => {
      this.facultyScheduledState.set(
        faculty.faculty_id,
        this.calculateIsIndividuallyScheduled(faculty),
      );
    });
  }

  calculateIsIndividuallyScheduled(faculty: Faculty): boolean {
    return (
      faculty.active_semesters?.some(
        (semester) =>
          semester.individual_start_date !== null ||
          semester.individual_deadline !== null,
      ) ?? false
    );
  }

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
        this.cdr.markForCheck();
      }
    });
  }

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
            this.cdr.detectChanges();
          }
        });
      }
    });
  }

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
        generatePdfFunction: generatePdfFunction,
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

  sanitizeFileName(fileName: string): string {
    return fileName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  }

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

  getFacultyTypeClass(facultyType: string): Record<string, boolean> {
    const type = facultyType.toLowerCase();
    return {
      'full-time': type.includes('full-time'),
      designee: type.includes('designee'),
      'part-time': type.includes('part-time'),
      temporary: type.includes('temporary'),
    };
  }

  public getTooltip(type: 'global' | 'individual', faculty?: Faculty): string {
    const state = this.getToggleState(faculty || this.allData[0]);
    return type === 'global' ? state.globalTooltip : state.individualTooltip;
  }

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
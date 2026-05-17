import { Component, Inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

import { Subject } from 'rxjs';

import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatSymbolDirective } from '../../core/imports/mat-symbol.directive';

import { LoadingComponent } from '../loading/loading.component';

import { PreferencesService } from '../../core/services/faculty/preference/preferences.service';
import { ReportHeaderService } from '../../core/services/report-header/report-header.service';

import { fadeAnimation } from '../../core/animations/animations';

import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { MatFormField, MatLabel } from "@angular/material/form-field";
import { MatSelect, MatOption } from "@angular/material/select";
import { MatSnackBar } from '@angular/material/snack-bar';

import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

interface Course {
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
}

interface DialogPrefData {
  facultyName: string;
  faculty_id: number;
  isViewOnlyTable?: boolean;
  isViewHistory?: boolean;
  isAdmin?: boolean;
  /** Optional callback to generate an Excel file directly from the parent view. */
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
    MatFormField,
    MatLabel,
    MatSelect,
    MatOption
],
  templateUrl: './dialog-pref.component.html',
  styleUrls: ['./dialog-pref.component.scss'],
  animations: [fadeAnimation],
})
export class DialogPrefComponent implements OnInit, OnDestroy {
  facultyName: string = '';
  academicYear: string = '';
  semesterLabel: string = '';
  courses: Course[] = [];
  isLoading = true;
  selectedView: 'table-view' | 'pdf-view' | 'history-view' = 'table-view';
  selectedHistory: any;  
  academicYearList: AcademicYearSemester[] = [];  
  pdfBlobUrl: SafeResourceUrl | null = null;
  selectedYear: any;
  selectedSemester: any;

  private destroy$ = new Subject<void>();

  constructor(
    private preferencesService: PreferencesService,
    public dialogRef: MatDialogRef<DialogPrefComponent>,
    private snackBar: MatSnackBar,
    @Inject(MAT_DIALOG_DATA) public data: DialogPrefData,
    private sanitizer: DomSanitizer,
    private reportHeaderService: ReportHeaderService,
  ) {}

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

  /**
   * Fetches the specific faculty preferences from the database based on the provided faculty ID.
   */
  private loadFacultyPreferences() {
    this.isLoading = true;
    this.facultyName = this.data.facultyName;

    if (this.data.isViewOnlyTable) {
      this.selectedView = 'table-view'; 
    } else if (this.data.isViewHistory) {
      this.selectedView = 'history-view'; 
    }

    this.preferencesService
      .getPreferencesByFacultyId(this.data.faculty_id.toString(), true)
      .subscribe(
        (response) => {
          const faculty = response.preferences;

          if (faculty) {
            const activeSemester = faculty.active_semesters[0];
            this.academicYear = activeSemester.academic_year;
            this.selectedYear = activeSemester.academic_year;
            this.semesterLabel = activeSemester.semester_label;

            this.courses = activeSemester.courses.map((course: any) => ({
              course_code: course.course_details.course_code,
              course_title: course.course_details.course_title,
              lec_hours: course.lec_hours,
              lab_hours: course.lab_hours,
              units: course.units,
              preferred_days: course.preferred_days,
              year_section: `${course.course_details.year_level}-${course.section_details.section_name}`,
              program_code: course.course_details?.program_code ?? course.program_details?.program_code ?? null,
              preferences_id: course.preferences_id,
              is_ignored: course.is_ignored,
              is_temporary: course.is_temporary ?? course.course_details?.is_temporary ?? false,
              temporary_type: course.temporary_type ?? course.course_details?.temporary_type ?? null,
              temporary_status: course.temporary_status ?? course.course_details?.temporary_status ?? null,
              petition_required: course.petition_required ?? course.course_details?.petition_required ?? null,
            }));
          }

          this.isLoading = false;
          if (!this.data.isViewOnlyTable && this.selectedView === 'pdf-view') {
            this.generateAndDisplayPdf();
          }
        },
        (error) => {
          console.error('Error loading faculty preferences:', error);
          this.showSnackbar('Failed to load faculty preferences. Please try again later.');
          this.isLoading = false;
        }
      );
  }

  /**
   * Handles changes between Table, PDF, and History views.
   */
  onViewChange(): void {
    if (this.selectedView === 'pdf-view') {
      this.generateAndDisplayPdf();
    } else {
      this.pdfBlobUrl = null;
    }
  }

  /**
   * Updates the selected semester during History View.
   * @param event Emitted event containing the semester selection.
   */
  onSemesterChange(event?: any): void {
    let semesterId: number | null = null;
    
    if (event && event.value !== undefined) {
      semesterId = Number(event.value);
    } else if (typeof event === 'number') {
      semesterId = event;
    } else if (this.selectedHistory && 
        (this.selectedHistory.semester_id 
        || this.selectedHistory.semester_id === 0)
    ) {
      semesterId = Number(this.selectedHistory.semester_id);
    } else if (this.selectedSemester) {
      semesterId = Number(this.selectedSemester);
    }

    if (!semesterId) return;

    this.selectedSemester = semesterId;

    // Ensure academic year label is updated from the current selection
    if (this.selectedHistory) {
      this.academicYear = this.selectedHistory.academic_year;
    }

    this.updateTableFromSelection();
  }

  /**
   * Updates the selected academic year during History View.
   * @param event Emitted event containing the academic year selection.
   */
  onAcademicYearChange(event?: any) {    
    let yearObj: any = null;

    if (event && event.value !== undefined) {
      yearObj = event.value;
    } else if (event && typeof event === 'object' && event.academic_year_id) {
      yearObj = event;
    } else if (this.selectedHistory && this.selectedHistory.academic_year_id) {
      yearObj = this.selectedHistory;
    } else if (this.selectedYear) {
      yearObj = this.academicYearList.find(y => y.academic_year_id === this.selectedYear) ?? null;
    }

    if (!yearObj) return;

    this.selectedYear = yearObj.academic_year_id;
    this.selectedHistory = yearObj;
    this.academicYear = yearObj.academic_year;
    this.updateTableFromSelection();
  }

  /**
   * Retrieves matching course data from the academic year list to populate the History table.
   */
  private updateTableFromSelection(): void {
    if (!this.selectedYear || !this.selectedSemester) return;

    this.isLoading = true;

    const ay = this.academicYearList.find(
      (y) => y.academic_year_id === this.selectedYear
    );

    if (ay) {
      this.academicYear = ay.academic_year;
    }

    if (!ay) {
      this.isLoading = false;
      return;
    }

    const semesters: any[] = (ay as any).semesters ?? (ay as any).semester ?? [];

    const sem = semesters.find(
      (s) => s.semester_id === this.selectedSemester || s.semester_number === String(this.selectedSemester),
    );

    if (!sem) {
      this.isLoading = false;
      return;
    }

    const sourceCourses = sem.courses ?? sem.preferences ?? [];

    this.semesterLabel =
      sem.semester_label ??
      (sem.semester_number === 1 || sem.semester_id === 1 ? 'First Semester' :
        sem.semester_number === 2 || sem.semester_id === 2 ? 'Second Semester' :
        sem.semester_number === 3 || sem.semester_id === 3 ? 'Summer Semester' :
        '');

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
    }));

    this.isLoading = false;
  }

  /**
   * Pre-selects the first available academic year and semester
   * so the history view is not blank on first open.
   */
  private preselectHistoryDefault(): void {
    if (!this.academicYearList?.length) return;
    const firstAy = this.academicYearList[0];
    const semesters = (firstAy as any).semesters
      ?? (firstAy as any).semester ?? [];
    
    // Find the first semester that has preferences or just the first one
    const firstSem = semesters.find(
      (s: any) => (s.preferences ?? s.courses ?? []).length > 0
    ) ?? semesters[0];
    
    if (!firstSem) return;

    this.selectedHistory = firstAy;
    this.selectedYear = firstAy.academic_year_id;
    this.selectedSemester = firstSem.semester_id;
    this.updateTableFromSelection();
  }

  /**
   * Generates the PDF Blob internally and sets it as the SafeResourceUrl for the iframe preview.
   */
  generateAndDisplayPdf(): void {
    const pdfBlob = this.generateFacultyPDF(false, [this.courses], true);
    if (pdfBlob instanceof Blob) {
      const blobUrl = URL.createObjectURL(pdfBlob);
      this.pdfBlobUrl = this.sanitizer.bypassSecurityTrustResourceUrl(blobUrl);
    } else {
      console.error('generateFacultyPDF did not return a Blob.');
      this.showSnackbar('Failed to generate PDF preview.');
    }
  }

  /**
   * Generates and automatically downloads the PDF format for the faculty preferences.
   */
  downloadPdf(): void {
    this.generateFacultyPDF(false, [this.courses], false);
  }

  /**
   * Generates and automatically downloads the Excel format for the faculty preferences.
   * If a generation function is supplied via MAT_DIALOG_DATA, it defers execution to the parent.
   */
  public async downloadExcel(): Promise<void> {
    if (this.data.generateExcelFunction) {
      try {
        await this.data.generateExcelFunction();
      } catch (error) {
        console.error('Error executing parent Excel function:', error);
      }
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
      { width: 5 },  // #
      { width: 15 }, // Program Code
      { width: 20 }, // Year & Section
      { width: 15 }, // Course Code
      { width: 35 }, // Course Title
      { width: 8 },  // Lec
      { width: 8 },  // Lab
      { width: 8 },  // Units
      { width: 30 }  // Preferred Day & Time
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

    this.courses.forEach((course: Course, index: number) => {
      const scheduleString = this.formatPreferredDaysAndTime(course).replace(/\n/g, ', ');
      
      const row = worksheet.addRow([
        index + 1,
        course.program_code || '—',
        course.year_section || '—',
        course.course_code,
        course.course_title,
        course.lec_hours || 0,
        course.lab_hours || 0,
        course.units || 0,
        scheduleString === 'Click to select day and time' || !scheduleString ? 'Not Set' : scheduleString
      ]);

      row.eachCell((cell, colNum) => {
        cell.alignment = { vertical: 'middle', horizontal: colNum === 5 || colNum === 9 ? 'left' : 'center', wrapText: true };
        cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const safeName = this.sanitizeFileName(this.facultyName);
    saveAs(blob, `${safeName}_Preferences_${this.academicYear.replace('/', '_')}.xlsx`);
  }

  /**
   * Toggles the ignore status of a specific preference. 
   * This is only accessible by administrators.
   */
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
          this.showSnackbar(error.error?.message || error.message || 
            `Failed to ${course.is_ignored ? 'restore' : 'ignore'} preference. Please try again.`
          );
        }
      });
  }

  /**
   * Closes the active dialog modal.
   */
  closeDialog(): void {
    this.dialogRef.close();
  }

  /**
   * Main constructor utilizing jsPDF to format the faculty preferences table into a printable layout.
   */
  generateFacultyPDF(
    isAll: boolean,
    coursesArray: Course[][],
    showPreview: boolean = false,
  ): Blob | void {
    const doc = new jsPDF('p', 'mm', 'a4') as any;
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
          this.reportHeaderService.addStandardFooter(doc);

          coursesArray.forEach((courses) => {
            if (!courses || courses.length === 0) return;

            doc.setFontSize(12);
            doc.setFont('helvetica', 'normal');
            const facultyInfo = [
              `Faculty Name: ${this.facultyName}`,
              `Academic Year: ${this.academicYear}`,
              `Semester: ${this.semesterLabel}`,
            ];

            facultyInfo.forEach((info) => {
              doc.text(info, 10, currentY);
              currentY += 5;
            });
            currentY += 5;

            const courseData = courses.map((course: Course, index: number) => [
              (index + 1).toString(),
              course.program_code || 'N/A',
              course.year_section || 'N/A',
              course.course_code || 'N/A',
              course.course_title || 'N/A',
              course.lec_hours.toString(),
              course.lab_hours.toString(),
              course.units.toString(),
              this.formatPreferredDaysAndTime(course),
            ]);

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
                0: { cellWidth: 8 },
                1: { cellWidth: 18 },
                2: { cellWidth: 18 },
                3: { cellWidth: 30 },
                4: { cellWidth: 40 },
                5: { cellWidth: 13 },
                6: { cellWidth: 13 },
                7: { cellWidth: 13 },
                8: { cellWidth: 35 },
                
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
                  this.reportHeaderService.addStandardFooter(doc);
                });
            }
          });

          const pdfBlob = doc.output('blob');
          if (showPreview) {
            return pdfBlob;
          } else {
            let fileName = 'faculty_preferences_report.pdf';

            if (isAll && coursesArray.length > 0) {
              fileName = `${this.sanitizeFileName(
                this.facultyName,
              )}_preferences_report.pdf`;
            }

            doc.save(fileName);
          }
        });

      return doc.output('blob');
    } catch (error) {
      console.error('Failed to generate PDF:', error);
      throw error;
    }
  }

  /**
   * Displays an error or notification snackbar in the application.
   * @param message The string message to display.
   */
  private showSnackbar(message: string): void {
    this.snackBar.open(message, 'Close', {
      duration: 3000,
      panelClass: ['error-snackbar']
    });
  }

  /**
   * Detects if the course preferences contain modifiers for "Any Day" or "Any Time".
   * @param course The course object containing preferred days.
   * @returns An object indicating boolean presence of any_day and any_time modifiers.
   */
  private detectAnyModifiers(course: Course): { has_any_day: boolean; has_any_time: boolean } {
    const REQUIRED_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const ANY_DAY_START = '07:00:00';
    const ANY_DAY_END = '21:00:00';

    const presentDays = course.preferred_days.map(pref => pref.day);
    const has_any_day = REQUIRED_DAYS.every(day => presentDays.includes(day));

    const has_any_time = course.preferred_days.every(
      pref => pref.start_time === ANY_DAY_START && pref.end_time === ANY_DAY_END
    );

    return { has_any_day, has_any_time };
  }

  /**
   * Formats the preferred days and times for display, accounting for "Any Day" and "Any Time" logic.
   * @param course The course containing time preferences to parse.
   */
  formatPreferredDaysAndTime(course: Course): string {
    const { has_any_day, has_any_time } = this.detectAnyModifiers(course);

    if (has_any_day && has_any_time) {
      return 'Any Day, Any Time';
    }

    if (has_any_day) {
      const firstDay = course.preferred_days[0];
      const timeRange = `${this.convertTo12HourFormat(
        firstDay.start_time,
      )} - ${this.convertTo12HourFormat(firstDay.end_time)}`;
      return `Any Day, ${timeRange}`;
    }

    if (has_any_time) {
      const daysString = course.preferred_days.map(pref => pref.day).join(', ');
      return `${daysString}, Any Time`;
    }

    return course.preferred_days
      .map((pref) => {
        const time = `${this.convertTo12HourFormat(
          pref.start_time,
        )} - ${this.convertTo12HourFormat(pref.end_time)}`;
        return `${pref.day} (${time})`;
      })
      .join('\n');
  }

  /**
   * Generates the badge text for a temporary course.
   */
  public getTemporaryBadgeText(course: Course): string {
    if (!course.is_temporary) {
      return '';
    }

    const typeLabel = this.formatTemporaryType(course.temporary_type);
    return typeLabel ? `Temporary (${typeLabel})` : 'Temporary';
  }

  /**
   * Generates the tooltip string for a temporary course explaining its status.
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
   * Formats the raw snake_case temporary type string into a readable title case string.
   */
  private formatTemporaryType(type?: string | null): string {
    if (!type) return '';
    return type
      .toString()
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  /**
   * Converts a 24-hour time string into a 12-hour format string.
   * @param time 24-hour time string (e.g. 14:30:00)
   */
  convertTo12HourFormat(time: string): string {
    const [hour, minute] = time.split(':').map(Number);
    let ampm = 'AM';
    let hour12 = hour;

    if (hour >= 12) {
      ampm = 'PM';
      if (hour > 12) hour12 = hour - 12;
    }
    if (hour === 0) {
      hour12 = 12;
    }

    return `${hour12.toString().padStart(2, '0')}:${minute
      .toString()
      .padStart(2, '0')} ${ampm}`;
  }

  /**
   * Sanitizes strings to be safely used as local filenames.
   */
  sanitizeFileName(fileName: string): string {
    return fileName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
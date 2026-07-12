import { Component, OnInit, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil, filter } from 'rxjs/operators';

import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSymbolDirective } from '../../../../imports/mat-symbol.directive';

import { InputField } from '../../../../../shared/table-header/table-header.component';
import { ReportsHeaderComponent } from "../../../../../shared/reports-header/reports-header.component";
import { TableDialogComponent, DialogConfig, DialogFieldConfig } from '../../../../../shared/table-dialog/table-dialog.component';
import { DialogViewScheduleComponent } from '../../../../../shared/dialog-view-schedule/dialog-view-schedule.component';
import { LoadingComponent } from '../../../../../shared/loading/loading.component';

import { ReportsService } from '../../../../services/admin/reports/reports.service';
import { ReportHeaderService } from '../../../../services/report-header/report-header.service';

import { fadeAnimation } from '../../../../animations/animations';

import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { DialogExportComponent } from '../../../../../shared/dialog-export/dialog-export.component';

import jsPDF from 'jspdf';
import 'jspdf-autotable';

interface CourseDetails {
  course_assignment_id: number;
  course_title: string;
  course_code: string;
  lec: number;
  lab: number;
  units: number;
  tuition_hours: number;
}

interface Schedule {
  schedule_id: number;
  day: string;
  start_time: string;
  end_time: string;
  faculty_name: string;
  faculty_code: string;
  room_code: string;
  course_details: CourseDetails;
}

interface Section {
  section_name: string;
  schedules: Schedule[];
}

interface YearLevel {
  year_level: number;
  sections: Section[];
}

interface Program {
  program_id: number;
  program_code: string;
  program_title: string;
  year_levels: YearLevel[];
  year_levels_selected?: string;
  section_selected?: string;
  academicYear?: string;
  semester?: string;
}

interface TimeSlot {
  time: string;
  minutes: number;
}

@Component({
  selector: 'app-report-programs',
  imports: [
    CommonModule,
    MatTableModule,
    MatPaginatorModule,
    MatIconModule,
    MatButtonModule,
    MatSlideToggleModule,
    MatTooltipModule,
    FormsModule,
    MatSelectModule,
    MatFormFieldModule,
    LoadingComponent,
    MatSymbolDirective,
    ReportsHeaderComponent
],
  templateUrl: './report-programs.component.html',
  styleUrls: ['./report-programs.component.scss'],
  animations: [fadeAnimation],
})
export class ReportProgramsComponent implements OnInit, OnDestroy {
  inputFields: InputField[] = [
    {
      type: 'text',
      label: 'Search Programs',
      key: 'search',
    },
  ];

  displayedColumns: string[] = [
    'index',
    'programCode',
    'programName',
    'yearLevel',
    'section',
    'action',
  ];

  dataSource = new MatTableDataSource<Program>();
  filteredData: Program[] = [];
  academicYear: string = '';
  semester: string = '';
  isLoading = true;
  hasAnySchedules = false;
  isTermsLoading = true;
  availableTerms: any[] = [];
  selectedTermId: number | null = null;
  timeSlots: TimeSlot[] = [];

  private searchInput$ = new Subject<string>();

  @ViewChild(MatPaginator) paginator!: MatPaginator;

  private destroy$ = new Subject<void>();

  constructor(
    private reportsService: ReportsService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private reportHeaderService: ReportHeaderService,
  ) {}

  ngOnInit(): void {
    this.generateTimeSlots();

    this.reportsService.selectedTerm$
      .pipe(
        takeUntil(this.destroy$),
        filter((termId) => termId !== null),
      )
      .subscribe((termId) => {
        this.fetchProgramsData(termId);
      });

    this.loadTerms();

    this.searchInput$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((searchQuery) => {
        this.performSearch(searchQuery);
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private generateTimeSlots() {
    const startTime = 7 * 60; // 7:00 AM
    const endTime = 21 * 60;  // 9:00 PM
    const interval = 30;
    this.timeSlots = [];
    for (let time = startTime; time <= endTime; time += interval) {
      const hours = Math.floor(time / 60);
      const mins  = time % 60;
      const ampm  = hours >= 12 ? 'PM' : 'AM';
      const h     = hours % 12 || 12;
      const timeStr = `${h}:${mins.toString().padStart(2, '0')} ${ampm}`;
      this.timeSlots.push({ time: timeStr, minutes: time });
    }
  }

  loadTerms() {
    this.isTermsLoading = true;
    this.reportsService.getAllTermsForDropdown().subscribe({
      next: (data) => {
        this.availableTerms = data;
        const currentTermId = this.reportsService.getSelectedTerm();
        const hasCurrentTerm = currentTermId !== null && data.some(
          (term) => term.active_semester_id === currentTermId,
        );

        if (hasCurrentTerm) {
          this.selectedTermId = currentTermId;
        } else {
          const activeTerm = data.find((term) => term.is_active === 1);
          if (activeTerm) {
            this.selectedTermId = activeTerm.active_semester_id;
            this.onTermChange();
          }
        }

        this.isTermsLoading = false;
      },
      error: (error) => {
        this.isTermsLoading = false;
        this.isLoading = false;
        console.error('Error loading terms:', error);
      },
    });
  }

  onTermChange() {
    this.reportsService.setSelectedTerm(this.selectedTermId);
  }

  getSemesterLabel(semesterNumber: number): string {
    switch (semesterNumber) {
      case 1:
        return '1st Semester';
      case 2:
        return '2nd Semester';
      case 3:
        return 'Summer';
      default:
        return `Sem ${semesterNumber}`;
    }
  }
  
  ngAfterViewInit() {
    this.dataSource.paginator = this.paginator;
  }

  fetchProgramsData(termId: number | null = null): void {
    this.isLoading = true;
    this.reportsService.getProgramSchedulesReport(termId).subscribe({
      next: (response) => {
        const programData: Program[] =
          response.programs_schedule_reports.programs.map((program: any) => ({
            program_id: program.program_id,
            program_code: program.program_code,
            program_title: program.program_title,
            year_levels: program.year_levels.map((yl: any) => ({
              year_level: yl.year_level,
              sections: yl.sections.map((sec: any) => ({
                section_name: sec.section_name,
                schedules: sec.schedules,
              })),
            })),
            year_levels_selected: 'All',
            section_selected: 'All',
            academicYear: `${response.programs_schedule_reports.year_start}-${response.programs_schedule_reports.year_end}`,
            semester: this.getSemesterDisplay(
              response.programs_schedule_reports.semester,
            ),
          }));

        this.academicYear = `${response.programs_schedule_reports.year_start}-${response.programs_schedule_reports.year_end}`;
        this.semester = this.getSemesterDisplay(
          response.programs_schedule_reports.semester,
        );

        this.isLoading = false;
        this.dataSource.data = programData;
        this.filteredData = [...programData];
        this.dataSource.paginator = this.paginator;

        this.hasAnySchedules = this.filteredData.some((program) =>
          program.year_levels.some((yearLevel) =>
            yearLevel.sections.some((section) => section.schedules.length > 0),
          ),
        );
      },
      error: (error) => {
        this.isLoading = false;
        console.error('Error fetching programs data:', error);
        this.snackBar.open(
          'Failed to load programs data. Please try again later.',
          'Close',
          {
            duration: 5000,
          },
        );
      },
    });
  }

  getSemesterDisplay(semester: number): string {
    switch (semester) {
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

  getRowIndex(index: number): number {
    if (this.paginator) {
      return index + 1 + this.paginator.pageIndex * this.paginator.pageSize;
    }
    return index + 1;
  }

  onInputChange(changes: { [key: string]: any }) {
    const searchQuery = changes['search']
      ? changes['search'].trim().toLowerCase()
      : '';
    this.searchInput$.next(searchQuery);
  }

  performSearch(searchQuery: string) {
    if (searchQuery === '') {
      this.dataSource.data = this.filteredData;
    } else {
      this.dataSource.data = this.filteredData.filter(
        (program) =>
          program.program_code.toLowerCase().includes(searchQuery) ||
          program.program_title.toLowerCase().includes(searchQuery),
      );
    }
  }

  onExportAll() {
    const scheduleGroups: { title: string; scheduleData: any }[] = [];

    this.filteredData.forEach((program) => {
      program.year_levels.forEach((yearLevel) => {
        yearLevel.sections.forEach((section) => {
          if (section.schedules && section.schedules.length > 0) {
            const title = `${program.program_code} - Year ${yearLevel.year_level} - Section ${section.section_name}`;
            scheduleGroups.push({
              title: title,
              scheduleData: section.schedules,
            });
          }
        });
      });
    });

    if (scheduleGroups.length === 0) {
      this.snackBar.open('No schedule data available to export.', 'Close', {
        duration: 5000,
      });
      return;
    }

    // Add this block right before this.dialog.open
    const sanitizedGroups = scheduleGroups.map(group => ({
      title: group.title,
      scheduleData: group.scheduleData.map((s: any) => ({
        ...s,
        day: s.day || 'TBA',
        start_time: s.start_time || '07:00',
        end_time: s.end_time || '08:00'
      }))
    }));

    const generatePdfFunction = (preview: boolean): Blob | void => {
      const doc = this.createCombinedPdf();
      return doc.output('blob');
    };

    this.dialog.open(DialogViewScheduleComponent, {
      maxWidth: '90vw',
      width: '100%',
      autoFocus: true,
      data: {
        exportType: 'all',
        entity: 'program',
        // USE THE SANITIZED GROUPS HERE
        scheduleGroups: sanitizedGroups,
        entityData: sanitizedGroups.reduce((acc: any[], group) => acc.concat(group.scheduleData), []),
        customTitle: 'All Program Schedules',
        fileName: `All_Program_Schedules_${this.academicYear}_${this.semester.replace(/\s+/g, '_')}`,
        academicYear: this.academicYear,
        semester: this.semester,
        generatePdfFunction: generatePdfFunction,
        generateExcelFunction: async () => {
          const excelBlob = await this.generateExcelBlobAll();
          saveAs(excelBlob, `All_Program_Schedules_${this.academicYear}_${this.semester.replace(/\s+/g, '_')}.xlsx`);
        },
        previewMode: true,
        showViewToggle: false
      },
    });
  }

  // --- EXCEL MERGING HELPER ---
  private groupSchedulesByCourseCode(schedules: Schedule[]): any[] {
    const mergedMap = new Map<string, any>();
    
    for (const item of schedules) {
      const courseCode = (item.course_details?.course_code || 'UNKNOWN').trim().toUpperCase();
      
      // Clean up the faculty name so it groups perfectly
      let facultyName = item.faculty_name || '';
      facultyName = facultyName.trim().toUpperCase() === 'N/A' || facultyName.trim() === '' ? 'Faculty TBA' : facultyName.trim();
      
      const key = `${courseCode}|${facultyName}`;
      
      if (mergedMap.has(key)) {
        mergedMap.get(key)._rawSchedules.push(item);
      } else {
        mergedMap.set(key, { ...item, _rawSchedules: [item], _displayProf: facultyName });
      }
    }
    
    return Array.from(mergedMap.values()).map(merged => {
      const days = merged._rawSchedules.map((s: any) => {
        if (!s.day) return 'TBA';
        const d = s.day.toUpperCase();
        if (d.startsWith('MO')) return 'M';
        if (d.startsWith('TU')) return 'TUE'; 
        if (d.startsWith('WE')) return 'W';
        if (d.startsWith('TH')) return 'TH';
        if (d.startsWith('FR')) return 'F';
        if (d.startsWith('SA')) return 'S';
        if (d.startsWith('SU')) return 'SU';
        return d.substring(0, 3);
      });
      
      const times = merged._rawSchedules.map((s: any) => {
        if (!s.start_time || !s.end_time) return 'TBA';
        const start = this.formatTimeTo12Hour(s.start_time).replace(/\s+/g, '');
        const end = this.formatTimeTo12Hour(s.end_time).replace(/\s+/g, '');
        return `${start}-${end}`;
      });
      
      const rooms = Array.from(new Set(merged._rawSchedules.map((s: any) => s.room_code || 'TBA')));

      return {
         ...merged,
         displayDay: days.join('/'),
         displayTime: times.join('/'),
         displayProf: merged._displayProf, // Uses the exact grouped professor
         displayRoom: rooms.join('\n')
      };
    });
  }

  // EXCEL METHODS
  private async generateExcelBlob(program: Program): Promise<Blob> {
    const workbook = new ExcelJS.Workbook();
    const selectedYearLevel = program.year_levels_selected ?? 'All';
    const selectedSection = program.section_selected ?? 'All';

    const filteredYearLevels = program.year_levels.filter(
      (yl) => selectedYearLevel === 'All' || yl.year_level.toString() === selectedYearLevel
    );

    for (const yearLevel of filteredYearLevels) {
      const filteredSections = yearLevel.sections.filter(
        (sec) => selectedSection === 'All' || sec.section_name === selectedSection
      );

      for (const section of filteredSections) {
        const safeSheetName = `Y${yearLevel.year_level} - ${section.section_name}`.replace(/[^\w\s-]/gi, '').substring(0, 31);
        const worksheet = workbook.addWorksheet(safeSheetName);

        worksheet.columns = [
          { width: 12 }, { width: 35 }, { width: 8 }, { width: 8 }, { width: 10 },
          { width: 8 }, { width: 15 }, { width: 12 }, { width: 20 }, { width: 8 }, { width: 22 }
        ];

        worksheet.mergeCells('A1:B1'); worksheet.mergeCells('C1:K1');
        worksheet.mergeCells('A2:B2'); worksheet.mergeCells('C2:K2');

        worksheet.getCell('A1').value = `Course: ${program.program_title.toUpperCase()} (${program.program_code})`;
        worksheet.getCell('C1').value = `Year Level: ${yearLevel.year_level}`;
        worksheet.getCell('A2').value = `School Year: ${this.academicYear}`;
        worksheet.getCell('C2').value = `Semester: ${this.semester}`;

        ['A1', 'C1', 'A2', 'C2'].forEach(c => {
          const cell = worksheet.getCell(c);
          cell.font = { bold: true };
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
          cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
        });

        worksheet.addRow([]); // Spacer

        const secRow = worksheet.addRow([`Section : ${section.section_name}`]);
        worksheet.mergeCells(`A${secRow.number}:K${secRow.number}`);
        secRow.font = { bold: true };
        secRow.getCell(1).border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };

        const headerRow = worksheet.addRow([
          'Subject\nCode', 'Description', 'Lec\nHours', 'Lab\nHours', 'Tuition\nHours',
          'Cred.\nUnits', 'Section', 'Room No.', 'Professor', 'Slots', 'Schedule'
        ]);
        headerRow.height = 30;
        headerRow.eachCell(cell => {
          cell.font = { bold: true };
          cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
          cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
        });

        if (section.schedules && section.schedules.length > 0) {
          const groupedSchedules = this.groupSchedulesByCourseCode(section.schedules);

          groupedSchedules.forEach(schedule => {
            const isBridging = schedule.course_details?.offering_type === 'bridging';
            const courseCode = schedule.course_details?.course_code || '';
            const displayCourseCode = isBridging ? `${courseCode}\n[Bridging]` : courseCode;
            
            const row = worksheet.addRow([
              displayCourseCode,
              schedule.course_details?.course_title || '',
              schedule.course_details?.lec || 0,
              schedule.course_details?.lab || 0,
              schedule.course_details?.tuition_hours || 0,
              schedule.course_details?.units || 0,
              section.section_name,
              schedule.displayRoom,
              schedule.displayProf,
              '60', // Using 60 for slots based on your screenshot
              `${schedule.displayDay}\n${schedule.displayTime}`
            ]);

            row.eachCell((cell, colNumber) => {
              cell.alignment = { vertical: 'middle', horizontal: colNumber === 2 ? 'left' : 'center', wrapText: true };
              cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
            });
          });
        } else {
          const noDataRow = worksheet.addRow(['No schedules assigned for this section.']);
          worksheet.mergeCells(`A${noDataRow.number}:K${noDataRow.number}`);
          noDataRow.getCell(1).alignment = { horizontal: 'center' };
          noDataRow.getCell(1).font = { italic: true };
        }
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  private async generateExcelBlobAll(): Promise<Blob> {
    const workbook = new ExcelJS.Workbook();

    for (const program of this.filteredData) {
      for (const yearLevel of program.year_levels) {
        for (const section of yearLevel.sections) {
          if (section.schedules && section.schedules.length > 0) {
            const safeSheetName = `${program.program_code} Y${yearLevel.year_level} S${section.section_name}`.replace(/[^\w\s-]/gi, '').substring(0, 31);
            const worksheet = workbook.addWorksheet(safeSheetName);
            this.applyExcelLayoutAndData(worksheet, program, yearLevel, section);
          }
        }
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  private applyExcelLayoutAndData(worksheet: ExcelJS.Worksheet, program: Program, yearLevel: any, section: any) {
    worksheet.pageSetup = {
      orientation: 'landscape',
      paperSize: 9, // A4
      fitToPage: true,
      fitToWidth: 1, 
      fitToHeight: 0,
      margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 }
    };

    worksheet.columns = [
      { width: 12 }, { width: 35 }, { width: 8 }, { width: 8 }, { width: 10 },
      { width: 8 }, { width: 15 }, { width: 12 }, { width: 20 }, { width: 8 }, { width: 22 }
    ];

    worksheet.mergeCells('A1:G1'); worksheet.mergeCells('H1:K1');
    worksheet.mergeCells('A2:G2'); worksheet.mergeCells('H2:K2');

    worksheet.getCell('A1').value = `Course: ${program.program_title.toUpperCase()} (${program.program_code})`;
    worksheet.getCell('H1').value = `Year Level: ${yearLevel.year_level}`;
    worksheet.getCell('A2').value = `School Year: ${this.academicYear}`;
    worksheet.getCell('H2').value = `Semester: ${this.semester}`;

    ['A1', 'H1', 'A2', 'H2'].forEach(c => {
      const cell = worksheet.getCell(c);
      cell.font = { bold: true };
      cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
    });

    worksheet.addRow([]); 

    const secRow = worksheet.addRow([`Section : ${section.section_name}`]);
    worksheet.mergeCells(`A${secRow.number}:K${secRow.number}`);
    secRow.font = { bold: true };
    secRow.getCell(1).border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };

    const headerRow = worksheet.addRow([
      'Subject\nCode', 'Description', 'Lec\nHours', 'Lab\nHours', 'Tuition\nHours',
      'Cred.\nUnits', 'Section', 'Room No.', 'Professor', 'Slots', 'Schedule'
    ]);
    headerRow.height = 30;
    headerRow.eachCell(cell => {
      cell.font = { bold: true };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
    });

    if (section.schedules && section.schedules.length > 0) {
      const groupedSchedules = this.groupSchedulesByCourseCode(section.schedules);

      groupedSchedules.forEach((schedule: any) => {
        const isBridging = schedule.course_details?.offering_type === 'bridging';
        const courseCode = schedule.course_details?.course_code || '';
        const displayCourseCode = isBridging ? `${courseCode}\n[Bridging]` : courseCode;
        
        const row = worksheet.addRow([
          displayCourseCode,
          schedule.course_details?.course_title || '',
          schedule.course_details?.lec || 0,
          schedule.course_details?.lab || 0,
          schedule.course_details?.tuition_hours || 0,
          schedule.course_details?.units || 0,
          section.section_name,
          schedule.displayRoom,
          schedule.displayProf,
          '60', 
          `${schedule.displayDay}\n${schedule.displayTime}`
        ]);

        row.eachCell((cell, colNumber) => {
          cell.alignment = { vertical: 'middle', horizontal: colNumber === 2 ? 'left' : 'center', wrapText: true };
          cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
        });
      });
    } else {
      const noDataRow = worksheet.addRow(['No schedules assigned for this section.']);
      worksheet.mergeCells(`A${noDataRow.number}:K${noDataRow.number}`);
      noDataRow.getCell(1).alignment = { horizontal: 'center' };
      noDataRow.getCell(1).font = { italic: true };
    }
  }

  // DIALOGS & EXPORTS
  onOpenDialog(program: Program, field: 'yearLevel' | 'section') {
    let dialogFields: DialogFieldConfig[] = [];
    let title = '';
    let options: string[] = [];

    if (field === 'yearLevel') {
      const uniqueYearLevels = program.year_levels.map((yl) => yl.year_level);
      options = ['All', ...uniqueYearLevels.map(String)];
      dialogFields = [
        {
          label: 'Year Level',
          formControlName: 'yearLevel',
          type: 'select',
          options: options,
          required: true,
        },
      ];
      title = 'Select Year Level';
    } else if (field === 'section') {
      if (program.year_levels_selected === 'All') {
        const uniqueSections = Array.from(
          new Set(
            program.year_levels.flatMap((yl) =>
              yl.sections.map((sec) => sec.section_name),
            ),
          ),
        );
        options = ['All', ...uniqueSections];
      } else {
        const selectedYearLevel = program.year_levels.find(
          (yl) => yl.year_level.toString() === program.year_levels_selected,
        );
        if (selectedYearLevel) {
          const sections = selectedYearLevel.sections.map(
            (sec) => sec.section_name,
          );
          options = ['All', ...sections];
        } else {
          options = ['All'];
        }
      }

      dialogFields = [
        {
          label: 'Section',
          formControlName: 'section',
          type: 'select',
          options: options,
          required: true,
        },
      ];
      title = 'Select Section';
    }

    const dialogConfig: DialogConfig = {
      title,
      fields: dialogFields,
      isEdit: false,
      initialValue: {
        [field === 'yearLevel' ? 'yearLevel' : 'section']:
          field === 'yearLevel'
            ? program.year_levels_selected
            : program.section_selected,
      },
    };

    const dialogRef = this.dialog.open(TableDialogComponent, {
      data: dialogConfig,
      autoFocus: true,
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        if (field === 'yearLevel') {
          program.year_levels_selected = result.yearLevel;
          program.section_selected = 'All';
        } else if (field === 'section') {
          program.section_selected = result.section;
        }
      }
    });
  }

  onView(element: Program) {
    const selectedYearLevel = element.year_levels_selected;
    const selectedSection = element.section_selected;

    let scheduleGroups: { title: string; scheduleData: any }[] = [];

    if (selectedYearLevel === 'All') {
      element.year_levels.forEach((yl) => {
        const yearLevel = yl.year_level;
        let sections: any[] = [];

        if (selectedSection === 'All') {
          sections = yl.sections;
        } else {
          const section = yl.sections.find(
            (sec) => sec.section_name === selectedSection,
          );
          if (section) {
            sections = [section];
          }
        }

        sections.forEach((sec) => {
          const title = `Year Level ${yearLevel} - Section ${sec.section_name}`;
          scheduleGroups.push({
            title: title,
            scheduleData: sec.schedules,
          });
        });
      });
    } else {
      const yl = element.year_levels.find(
        (yl) => yl.year_level.toString() === selectedYearLevel,
      );
      if (yl) {
        let sections: any[] = [];

        if (selectedSection === 'All') {
          sections = yl.sections;
        } else {
          const section = yl.sections.find(
            (sec) => sec.section_name === selectedSection,
          );
          if (section) {
            sections = [section];
          }
        }

        sections.forEach((sec) => {
          const title = `Year Level ${yl.year_level} - Section ${sec.section_name}`;
          scheduleGroups.push({
            title: title,
            scheduleData: sec.schedules,
          });
        });
      }
    }

    // Add this block right before this.dialog.open
    const sanitizedGroups = scheduleGroups.map(group => ({
      title: group.title,
      scheduleData: group.scheduleData.map((s: any) => ({
        ...s,
        day: s.day || 'TBA',
        start_time: s.start_time || '07:00',
        end_time: s.end_time || '08:00'
      }))
    }));

    const generatePdfFunction = (preview: boolean): Blob | void => {
      return this.createPdfBlob(element);
    };

    this.dialog.open(DialogViewScheduleComponent, {
      maxWidth: '90vw',
      width: '100%',
      autoFocus: true,
      data: {
        entity: 'program',
        // USE THE SANITIZED GROUPS HERE
        scheduleGroups: sanitizedGroups,
        entityData: sanitizedGroups.reduce((acc: any[], group) => acc.concat(group.scheduleData), []),
        customTitle: `${element.program_title} (${element.program_code})`,
        academicYear: this.academicYear,
        semester: this.semester,
        generatePdfFunction: generatePdfFunction,
        generateExcelFunction: async () => {
          const excelBlob = await this.generateExcelBlob(element);
          saveAs(excelBlob, `${element.program_code}_Schedule.xlsx`);
        },
        previewMode: true,
      },
    });
  }

  onExportSingle(element: Program): void {
    const selectedYearLevel = element.year_levels_selected ?? 'All';
    const selectedSection = element.section_selected ?? 'All';
    const academicYear = element.academicYear || '';
    const semester = element.semester || '';

    const getBaseFileName = () => {
      let fileName: string;
      if (selectedYearLevel === 'All' && selectedSection === 'All') {
        fileName = `${element.program_code.replace(/\s+/g, '_')}_All_Schedules_${academicYear}_${semester.replace(/\s+/g, '_')}`;
      } else {
        const yearLevelPart = selectedYearLevel !== 'All' ? `_Year${selectedYearLevel}` : '';
        const sectionPart = selectedSection !== 'All' ? `_Section${selectedSection.replace(/\s+/g, '_')}` : '';
        fileName = `${element.program_code.replace(/\s+/g, '_')}${yearLevelPart}${sectionPart}_Schedules_${academicYear}_${semester.replace(/\s+/g, '_')}`;
      }
      return fileName;
    };

    this.dialog.open(DialogExportComponent, {
      width: '90vw',
      maxWidth: '1200px',
      data: {
        exportType: 'single',
        customTitle: `${element.program_title} (${element.program_code})`,
        subtitle: `For Academic Year ${academicYear}, ${semester}`,
        
        generatePdfFunction: (preview: boolean) => {
          return this.createPdfBlob(element);
        },
        
        generateExcelFunction: async () => {
          const excelBlob = await this.generateExcelBlob(element);
          saveAs(excelBlob, `${getBaseFileName()}.xlsx`);
        },
        
        generateFileNameFunction: () => `${getBaseFileName()}.pdf`
      }
    });
  }

  createCombinedPdf(): jsPDF {
    const doc = new jsPDF('landscape', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.width;
    const margin = 10;
    const topMargin = 15;
    const logoSize = 22;

    let hasPages = false;

    this.filteredData.forEach((program) => {
      program.year_levels.forEach((yearLevel) => {
        yearLevel.sections.forEach((section) => {
          
          if (section.schedules && section.schedules.length > 0) {
            
            if (hasPages) {
              this.reportHeaderService.addStandardFooter(doc);
              doc.addPage();
            }
            hasPages = true;

            const title = `${program.program_code} - Year ${yearLevel.year_level} - Section ${section.section_name}`;
            const subtitle = `For Academic Year ${this.academicYear}, ${this.semester}`;
            
            let currentY = this.drawHeader(doc, topMargin, pageWidth, margin, logoSize, title, subtitle);

            this.drawScheduleTable(
              doc,
              section.schedules,
              title,
              subtitle,
              currentY,
              margin,
              pageWidth,
            );
          }
        });
      });
    });

    if (hasPages) {
      this.reportHeaderService.addStandardFooter(doc);
    } else {
      doc.text("No schedules available.", 10, 20);
    }

    return doc;
  }

  createPdfBlob(program: Program): Blob {
    const doc = new jsPDF('landscape', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.width;
    const margin = 10;
    const topMargin = 15;
    const logoSize = 22;

    if (program.year_levels.length === 0) {
      console.error('No data available to export.');
      return new Blob();
    }

    const selectedYearLevel = program.year_levels_selected;
    const selectedSection = program.section_selected;

    const filteredYearLevels = program.year_levels.filter(
      (yl) =>
        selectedYearLevel === 'All' ||
        yl.year_level.toString() === selectedYearLevel,
    );

    let isFirstPage = true;

    filteredYearLevels.forEach((yearLevel) => {
      const filteredSections = yearLevel.sections.filter(
        (sec) =>
          selectedSection === 'All' || sec.section_name === selectedSection,
      );

      filteredSections.forEach((section) => {
        if (!isFirstPage) {
          this.reportHeaderService.addStandardFooter(doc);
          doc.addPage();
        } else {
          isFirstPage = false;
        }

        const title = `${program.program_code} - Year ${yearLevel.year_level} - Section ${section.section_name}`;
        const subtitle = `For Academic Year ${this.academicYear}, ${this.semester}`;

        let currentY = this.drawHeader(doc, topMargin, pageWidth, margin, logoSize, title, subtitle);

        this.drawScheduleTable(
          doc,
          section.schedules ?? [],
          title,
          subtitle,
          currentY,
          margin,
          pageWidth,
        );
      });
    });

    if (
      filteredYearLevels.length === 0 ||
      filteredYearLevels.every((yl) => yl.sections.length === 0)
    ) {
      console.error(
        'No matching year levels or sections found for the selected options.',
      );
    }
    this.reportHeaderService.addStandardFooter(doc);

    return doc.output('blob');
  }

  drawHeader(
    doc: jsPDF,
    startY: number,
    pageWidth: number,
    margin: number,
    logoSize: number,
    title: string,
    subtitle: string,
  ): number {
    let currentY = startY;

    this.reportHeaderService
      .addHeader(doc, title, currentY, subtitle)
      .subscribe((newY) => {
        currentY = newY;
      });

    return currentY;
  }

  drawScheduleTable(doc: jsPDF, scheduleData: any[], title: string, subtitle: string, startY: number, margin: number, pageWidth: number): void {
    const hasSchedules = scheduleData && scheduleData.length > 0;
    if (!hasSchedules) return;

    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const timeColWidth = 22;
    const dayColumnWidth = (pageWidth - margin * 2 - timeColWidth) / days.length;
    
    // FIX 1: Reduced to 8.5 so the table physically fits on the A4 page without hitting the footer
    const rowHeight = 8.5; 

    const chunks = [
      { name: 'Morning (7:30 AM - 2:00 PM)', start: 450, end: 840 },
      { name: 'Afternoon (2:00 PM - 9:00 PM)', start: 840, end: 1260 }
    ];

    const activeChunks = chunks.filter(chunk => {
      return scheduleData.some(s => {
        if (!s.start_time || !s.end_time || !s.day) return false;
        const sStart = this.timeToMinutes(s.start_time);
        const sEnd = this.timeToMinutes(s.end_time);
        return Math.max(sStart, chunk.start) < Math.min(sEnd, chunk.end);
      });
    });

    if (activeChunks.length === 0) return;

    let pageUsed = false;
    let currentY = startY;

    activeChunks.forEach(chunk => {
      if (pageUsed) {
        this.reportHeaderService.addStandardFooter(doc);
        doc.addPage();
        currentY = this.drawHeader(doc, 15, pageWidth, margin, 22, title, subtitle);
      }

      pageUsed = true;
      currentY -= 3;

      // --- 1. DRAW HEADERS ---
      const headerHeight = 7;
      const subHeaderHeight = 5;
      const totalHeaderHeight = headerHeight + subHeaderHeight;

      // Time Header
      doc.setFillColor(128, 0, 0);
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.5);
      doc.rect(margin, currentY, timeColWidth, totalHeaderHeight, 'FD');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Time', margin + timeColWidth / 2, currentY + (totalHeaderHeight / 2) + 1.5, { align: 'center' });

      // Day Headers
      days.forEach((day, index) => {
        const xPos = margin + timeColWidth + index * dayColumnWidth;
        const subjColWidth = dayColumnWidth * 0.7;
        const roomColWidth = dayColumnWidth * 0.3;

        // Top row: Day name
        doc.setFillColor(128, 0, 0);
        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(0.5);
        doc.rect(xPos, currentY, dayColumnWidth, headerHeight, 'FD');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(day, xPos + dayColumnWidth / 2, currentY + 4.5, { align: 'center' });

        // Bottom row: Subject sub-header
        doc.setFillColor(160, 20, 20);
        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(0.4);
        doc.rect(xPos, currentY + headerHeight, subjColWidth, subHeaderHeight, 'FD');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.text('Subject', xPos + subjColWidth / 2, currentY + headerHeight + 3.5, { align: 'center' });

        // Bottom row: Room sub-header
        doc.setFillColor(160, 20, 20);
        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(0.4);
        doc.rect(xPos + subjColWidth, currentY + headerHeight, roomColWidth, subHeaderHeight, 'FD');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.text('Room', xPos + subjColWidth + roomColWidth / 2, currentY + headerHeight + 3.5, { align: 'center' });
      });

      currentY += totalHeaderHeight;

      // --- 2. DRAW TIME GRID ---
      doc.setTextColor(0, 0, 0);
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.5);

      const chunkSlots = this.timeSlots.filter(s => s.minutes >= chunk.start && s.minutes < chunk.end);

      chunkSlots.forEach((slot, index) => {
        const yPos = currentY + index * rowHeight;
        const isTopRow = index === 0;
        const isThreeHourGap = slot.minutes >= 450 && (slot.minutes - 450) % 180 === 0;

        if (isTopRow || isThreeHourGap) {
          if (!isTopRow) {
            doc.setDrawColor(200, 200, 200);
            doc.setLineWidth(0.5);
            doc.line(margin, yPos, pageWidth - margin, yPos);
          }
          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(0, 0, 0);
          doc.text(slot.time, margin + timeColWidth / 2, yPos + 5, { align: 'center' });
        }
      });

      // Draw the last time label at finalY (WITH THE OUT-OF-BOUNDS FIX!)
      const finalY = currentY + chunkSlots.length * rowHeight;
      const lastSlot = chunkSlots[chunkSlots.length - 1];
      if (lastSlot) {
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.5);
        doc.line(margin, finalY, pageWidth - margin, finalY);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text(lastSlot.time, margin + timeColWidth / 2, finalY - rowHeight + 5, { align: 'center' });
      } else {
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.5);
        doc.line(margin, finalY, pageWidth - margin, finalY);
      }

      // Vertical grid lines
      doc.line(margin, currentY, margin, finalY);
      doc.line(margin + timeColWidth, currentY, margin + timeColWidth, finalY);
      days.forEach((_, index) => {
        const xPos = margin + timeColWidth + index * dayColumnWidth;
        const subjColWidth = dayColumnWidth * 0.7;
        doc.line(xPos + subjColWidth, currentY, xPos + subjColWidth, finalY);
        doc.line(xPos + dayColumnWidth, currentY, xPos + dayColumnWidth, finalY);
      });

      // --- 3. MERGE BLOCKS (PROGRAMS SPECIFIC LOGIC) ---
      const mergedMap = new Map<string, any>();
      for (const item of scheduleData) {
        if (!item.start_time || !item.end_time || !item.day) continue;
        const key = `${item.day}|${item.start_time}|${item.end_time}`;
        if (mergedMap.has(key)) {
          const existing = mergedMap.get(key);
          if (!existing._mergedFaculty) existing._mergedFaculty = [existing.faculty_name];
          if (!existing._mergedFaculty.includes(item.faculty_name)) {
            existing._mergedFaculty.push(item.faculty_name);
          }
        } else {
          mergedMap.set(key, { ...item });
        }
      }

      const sortedScheduleData = [...mergedMap.values()].sort(
        (a, b) => this.timeToMinutes(a.start_time) - this.timeToMinutes(b.start_time)
      );

      // --- PASS 1: Draw all block backgrounds ---
      sortedScheduleData.forEach(item => {
        const dayIndex = days.indexOf(item.day);
        if (dayIndex === -1) return;

        const cappedStart = Math.max(this.timeToMinutes(item.start_time), chunk.start);
        const cappedEnd = Math.min(this.timeToMinutes(item.end_time), chunk.end);
        if (cappedStart >= cappedEnd) return;

        const startSlot = chunkSlots.findIndex(slot => slot.minutes === cappedStart);
        if (startSlot === -1) return;

        const duration = Math.ceil((cappedEnd - cappedStart) / 30);
        const xPos = margin + timeColWidth + dayIndex * dayColumnWidth;
        const yPos = currentY + startSlot * rowHeight;
        const height = duration * rowHeight;
        const subjColWidth = dayColumnWidth * 0.7;
        const roomColWidth = dayColumnWidth * 0.3;

        doc.setFillColor(240, 240, 240);
        doc.setDrawColor(128, 0, 0);
        doc.setLineWidth(0.3);
        doc.rect(xPos, yPos, subjColWidth, height, 'FD');
        doc.rect(xPos + subjColWidth, yPos, roomColWidth, height, 'FD');
      });

      // --- PASS 2: Draw all text on top ---
      sortedScheduleData.forEach(item => {
        const dayIndex = days.indexOf(item.day);
        if (dayIndex === -1) return;

        const originalStart = this.timeToMinutes(item.start_time);
        const originalEnd = this.timeToMinutes(item.end_time);
        const cappedStart = Math.max(originalStart, chunk.start);
        const cappedEnd = Math.min(originalEnd, chunk.end);
        if (cappedStart >= cappedEnd) return;

        const startSlot = chunkSlots.findIndex(slot => slot.minutes === cappedStart);
        if (startSlot === -1) return;

        const duration = Math.ceil((cappedEnd - cappedStart) / 30);
        const xPos = margin + timeColWidth + dayIndex * dayColumnWidth;
        const yPos = currentY + startSlot * rowHeight;
        const height = duration * rowHeight;
        const subjColWidth = dayColumnWidth * 0.7;
        const roomColWidth = dayColumnWidth * 0.3;

        const lineSpacing = 3.8;
        const codeFontSize = 8.0;
        const textFontSize = 7.0;
        const timeFontSize = 6.5;
        const roomFontSize = 6.5;

        // Build content (PROGRAMS SPECIFIC)
        let facultyDisplay: string;
        if (item._mergedFaculty && item._mergedFaculty.length > 1) {
          facultyDisplay = item._mergedFaculty
            .map((f: string) => (!f || f.trim().toUpperCase() === 'N/A') ? 'Faculty TBA' : f)
            .join(' / ');
        } else {
          facultyDisplay = item.faculty_name && item.faculty_name.trim().toUpperCase() !== 'N/A' 
            ? item.faculty_name 
            : 'Faculty TBA';
        }

        // Format time range from original uncapped times
        const formatTime = (minutes: number): string => {
          const h = Math.floor(minutes / 60);
          const m = minutes % 60;
          const suffix = h >= 12 ? 'PM' : 'AM';
          const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
          return `${displayH}:${m.toString().padStart(2, '0')} ${suffix}`;
        };
        const timeRange = `${formatTime(originalStart)} - ${formatTime(originalEnd)}`;

        const content = [
          item.course_details?.course_code || '',
          item.course_details?.course_title || '',
          facultyDisplay,
          timeRange
        ].filter(line => line !== '');

        const fontSizes = [codeFontSize, textFontSize, textFontSize, timeFontSize];
        const fontStyles = ['bold', 'normal', 'normal', 'normal'];

        // Bridging badge
        const isBridging = item.course_details?.offering_type === 'bridging';
        if (isBridging) {
          const badgeLabel = 'Bridging';
          const badgeFontSize = duration <= 2 ? 5.5 : 6;
          const badgePaddingX = 2;
          const badgePaddingY = 1.5;
          doc.setFontSize(badgeFontSize);
          doc.setFont('helvetica', 'bold');
          const badgeTextWidth = doc.getTextWidth(badgeLabel);
          const badgeW = badgeTextWidth + badgePaddingX * 2;
          const badgeH = badgeFontSize * 0.45 + badgePaddingY * 2;
          const badgeX = xPos + (subjColWidth - badgeW) / 2;
          const badgeY = yPos + 1;
          doc.setFillColor(128, 0, 0);
          doc.setDrawColor(128, 0, 0);
          doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 1, 1, 'FD');
          doc.setTextColor(255, 255, 255);
          doc.text(badgeLabel, badgeX + badgePaddingX, badgeY + badgeH - badgePaddingY - 0.2);
          doc.setTextColor(0, 0, 0);
        }

        // Subject content — vertically centered with top/bottom clamp
        let totalSubjectLines = 0;
        content.forEach(line => {
          totalSubjectLines += doc.splitTextToSize(line, subjColWidth - 4).length;
        });

        const totalSubjectHeight = (totalSubjectLines - 1) * lineSpacing;
        let subjectStartY = yPos + (height / 2) - (totalSubjectHeight / 2);
        if (isBridging) subjectStartY += 2;

        const minTopPadding = 3.5;
        const maxBottomBoundary = yPos + height - 3;
        subjectStartY = Math.max(subjectStartY, yPos + minTopPadding);

        content.forEach((line, idx) => {
          doc.setFontSize(fontSizes[idx] ?? textFontSize);
          doc.setFont('helvetica', fontStyles[idx] ?? 'normal');
          doc.setTextColor(idx === content.length - 1 ? 128 : 0, 0, 0); // Optional subtle gray for the time string

          const wrappedLines = doc.splitTextToSize(line, subjColWidth - 4);
          wrappedLines.forEach((wLine: string) => {
            if (subjectStartY <= maxBottomBoundary) {
              doc.text(wLine, xPos + subjColWidth / 2, subjectStartY, { align: 'center', baseline: 'middle' });
            }
            subjectStartY += lineSpacing;
          });
        });

        doc.setTextColor(0, 0, 0);

        // Room text — vertically centered with top/bottom clamp
        const roomText = item.room_code && item.room_code.trim() !== '' ? item.room_code : 'TBA';
        doc.setFontSize(roomFontSize);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        
        const wrappedRoom = doc.splitTextToSize(roomText, roomColWidth - 2);
        const roomLineSpacing = 3.2;
        const totalRoomHeight = (wrappedRoom.length - 1) * roomLineSpacing;
        let roomStartY = yPos + (height / 2) - (totalRoomHeight / 2);

        roomStartY = Math.max(roomStartY, yPos + 3.2);
        const maxRoomBoundary = yPos + height - 3;

        wrappedRoom.forEach((rLine: string) => {
          if (roomStartY <= maxRoomBoundary) {
            doc.text(rLine, xPos + subjColWidth + roomColWidth / 2, roomStartY, { align: 'center', baseline: 'middle' });
          }
          roomStartY += roomLineSpacing;
        });
      });

    });

    // Always draw footer on the last page
    this.reportHeaderService.addStandardFooter(doc);
  }

  private formatTime(time: string): string {
    if (!time) return ''; // <-- THIS SAFETY CHECK PREVENTS THE CRASH
    const [hours, minutes] = time.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const formattedHours = hours % 12 || 12;
    return `${formattedHours}:${minutes.toString().padStart(2, '0')} ${period}`;
  }

  private timeToMinutes(time: string): number {
    if (!time) return 0; // <-- THIS SAFETY CHECK PREVENTS THE CRASH
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  getAcademicYearSubtitle(program: Program): string {
    return `For Academic Year ${program.academicYear}, ${program.semester}`;
  }

  hasSchedules(program: Program): boolean {
  return program.year_levels.some((yearLevel) =>
    yearLevel.sections.some(
      (section) =>
        section.schedules &&
        section.schedules.some(
          (s) => s.day && s.start_time && s.end_time
        ),
    ),
  );
  }

  private formatTimeTo12Hour(time: string): string {
    return this.formatTime(time);
  }
}
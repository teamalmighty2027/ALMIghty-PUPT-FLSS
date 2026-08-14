import { Component, OnInit, ViewChild, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';

import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSymbolDirective } from '../../../imports/mat-symbol.directive';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatRippleModule } from '@angular/material/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs'; 

import { FacultyScheduleTimetableComponent } from '../../../../shared/faculty-schedule-timetable/faculty-schedule-timetable.component';
import { DialogScheduleHistoryComponent } from '../../../../shared/dialog-schedule-history/dialog-schedule-history.component';
import { DialogAppealScheduleComponent } from '../../../../shared/dialog-appeal-schedule/dialog-appeal-schedule.component';
import { DialogMyAppealsComponent } from '../../../../shared/dialog-my-appeals/dialog-my-appeals.component';
import { DialogRequestAccessComponent } from '../../../../shared/dialog-request-access/dialog-request-access.component';
import { LoadingComponent } from '../../../../shared/loading/loading.component';
import { DialogVideoTutorialComponent } from '../../../../shared/dialog-video-tutorial/dialog-video-tutorial.component';

import { ReportsService } from '../../../services/admin/reports/reports.service';
import { AuthService } from '../../../services/auth/auth.service';
import { ReschedulingService } from '../../../services/faculty/rescheduling/rescheduling.service'; 
import { ReportHeaderService } from '../../../../core/services/report-header/report-header.service'; // Adjust path if needed

import { fadeAnimation } from '../../../animations/animations';

import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';

type ScheduleView = 'official' | 'internal';

export interface ScheduleBlock {
  schedule_id: number;
  course_code: string;
  course_title: string;
  program_code: string;
  year_level: number | string;
  section: string;
  day: string;
  start_time: string;
  end_time: string;
  room_code: string;
}

@Component({
  selector: 'app-load-and-schedule',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatTooltipModule,
    MatButtonToggleModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    MatRippleModule,
    FacultyScheduleTimetableComponent,
    LoadingComponent,
    MatSymbolDirective,
  ],
  templateUrl: './load-and-schedule.component.html',
  styleUrl: './load-and-schedule.component.scss',
  animations: [fadeAnimation],
})
export class LoadAndScheduleComponent implements OnInit, OnDestroy {
  @ViewChild(FacultyScheduleTimetableComponent) timetableComponent!: FacultyScheduleTimetableComponent;

  facultySchedule: any;
  isMobileView = typeof window !== 'undefined' && window.innerWidth <= 768;
  myAppeals: any[] = []; 
  isLoading = true;
  isPublished = false;
  isAppealEnabled = false;
  hasAppealRequest = false;

  activeView: ScheduleView = 'official';
  readonly timeOptions: string[] = this.generateTimeOptions();

  constructor(
    private reportsService: ReportsService,
    private authService: AuthService,
    private reschedulingService: ReschedulingService, 
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private reportHeaderService: ReportHeaderService
  ) {}

  ngOnInit() {
    this.isMobileView = typeof window !== 'undefined' && window.innerWidth <= 768;
    window.addEventListener('resize', this.handleViewportResize);
    this.loadFacultySchedule();
  }

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.handleViewportResize);
  }

  private handleViewportResize = (): void => {
    this.isMobileView = typeof window !== 'undefined' && window.innerWidth <= 768;
  };

  loadFacultySchedule() {
    const facultyId = this.authService.getUserFacultyId();
    if (facultyId) {
      forkJoin({
        scheduleReq: this.reportsService.getSingleFacultySchedule(+facultyId),
        appealsReq: this.reschedulingService.getMyAppeals()
      }).subscribe({
        next: (res: any) => {
          // 1. Assign the main schedule data
          this.facultySchedule = res.scheduleReq.faculty_schedule;
          this.myAppeals = res.appealsReq;
          
          // 2. Map the publication status
          this.isPublished = this.facultySchedule.is_published === 1;
          
          // 3. Map the Appeal Flags (Check if they are in the root or inside faculty_status)
          // Map from the new root-level properties we added to the backend response
          this.isAppealEnabled = !!res.scheduleReq.is_appeal_enabled;
          this.hasAppealRequest = !!res.scheduleReq.has_appeal_request;
          
          this.isLoading = false;
        },
        error: () => { this.isLoading = false; }
      });
    } else {
      this.isLoading = false;
    }
  }

  onViewToggle(view: ScheduleView): void {
    this.activeView = view;
  }

  get isOfficialView(): boolean  { return this.activeView === 'official'; }
  get isInternalView(): boolean  { return this.activeView === 'internal'; }

  openScheduleHistory(): void {
    this.dialog.open(DialogScheduleHistoryComponent, {
      maxWidth: '90vw',
      width: this.isMobileView ? '94vw' : '100%',
      autoFocus: true,
    });
  }

  openRescheduleTutorial(): void {
    this.dialog.open(DialogVideoTutorialComponent, {
      width: this.isMobileView ? '94vw' : '640px',
      maxWidth: '95vw',
      panelClass: 'dialog-base',
      autoFocus: false,
      data: {
        title: 'How to Reschedule',
        description: 'Learn how to submit a rescheduling appeal for your assigned classes.',
        youtubeUrl: 'https://youtu.be/kiixp_kmtWA?si=CcekZQbx92bgs2S-',
        steps: [
          {
            stepNumber: 1,
            title: 'View Your Official Schedule',
            description:
              'Go to the Load and Schedule tab. Your official schedule will be displayed once it has been published by the admin.',
            icon: 'event_note',
            highlight: 'Make sure the schedule has been published before you can request a reschedule.',
          },
          {
            stepNumber: 2,
            title: 'Switch to Internal Arrangement',
            description:
              'Click the "Internal Arrangement" toggle at the top of the schedule view. This is where you can manage your rescheduling appeals.',
            icon: 'event_available',
          },
          {
            stepNumber: 3,
            title: 'Click the Flag Icon',
            description:
              'Find the class you want to reschedule and click the Flag icon on that schedule block to open the rescheduling appeal form.',
            icon: 'flag',
          },
          {
            stepNumber: 4,
            title: 'Fill in the Appeal Details',
            description:
              'Choose your preferred new day, start time, end time, and room. Add a reason for the reschedule request, then submit.',
            icon: 'edit_calendar',
          },
          {
            stepNumber: 5,
            title: 'Wait for Admin Approval',
            description:
              'Your appeal will be reviewed by the admin. Once approved, the updated schedule will appear in your Internal Arrangement view.',
            icon: 'check_circle',
          },
        ],
      },
    });
  }

  downloadTemplate(): void {
    const doc = new jsPDF('portrait', 'mm', 'a4');
    const title = 'LETTER RESCHEDULE TEMPLATE';
    const subtitle = 'Class Schedule Revision Consent';

    // Custom Footer Function to omit the "system-generated" string
    const drawCustomFooter = (docToDraw: jsPDF) => {
      const pageHeight = docToDraw.internal.pageSize.height || (docToDraw.internal.pageSize as any).getHeight();
      const pageWidth = docToDraw.internal.pageSize.width || (docToDraw.internal.pageSize as any).getWidth();
      const margin = 10;
      const footerY = pageHeight - 15; 

      docToDraw.setDrawColor(200, 200, 200);
      docToDraw.setLineWidth(0.5);
      docToDraw.line(margin, footerY - 4, pageWidth - margin, footerY - 4);

      docToDraw.setFontSize(8);
      docToDraw.setTextColor(128, 0, 0);
      docToDraw.setFont('helvetica', 'normal');
      docToDraw.text('This document contains personal-identifiable information that is subject to Data Privacy.', margin, footerY);
      docToDraw.text('Please keep this document protected and in a safe place.', margin, footerY + 3.5);
      docToDraw.setTextColor(0, 0, 0); 
    };

    this.reportHeaderService.addHeader(doc, title, 15, subtitle).subscribe((startY) => {
      const margin = 20;
      const pageWidth = doc.internal.pageSize.width;
      const maxTextWidth = pageWidth - margin * 2;
      let currentY = startY + 10;

      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);

      // --- Highlighted Date ---
      const today = 'September 25, 2024';
      doc.setFillColor(255, 255, 0); 
      doc.rect(margin, currentY - 4.2, doc.getTextWidth(today), 5.5, 'F');
      doc.text(today, margin, currentY);
      currentY += 10;

      // --- Salutation ---
      doc.text('To Whom It May Concern,', margin, currentY);
      currentY += 10;

      // --- Custom Justified Paragraph Renderer with Highlights ---
      const renderParagraphJustified = (segments: { text: string, highlight: boolean }[]) => {
        const lineHeight = 6;
        let words: {text: string, highlight: boolean, width: number}[] = [];

        // Flatten segments into an array of words
        segments.forEach(seg => {
          const splitWords = seg.text.split(/( )/);
          splitWords.forEach(w => {
            if (w !== '') {
              words.push({ text: w, highlight: seg.highlight, width: doc.getTextWidth(w) });
            }
          });
        });

        // Group words into lines
        let lines: {words: typeof words, width: number}[] = [];
        let currentLine: typeof words = [];
        let currentLineWidth = 0;

        words.forEach(w => {
          if (w.text === ' ' && currentLine.length === 0) return; 

          if (currentLineWidth + w.width > maxTextWidth && w.text !== ' ') {
            if (currentLine.length > 0 && currentLine[currentLine.length - 1].text === ' ') {
              currentLineWidth -= currentLine.pop()!.width;
            }
            lines.push({ words: currentLine, width: currentLineWidth });
            currentLine = [w];
            currentLineWidth = w.width;
          } else {
            currentLine.push(w);
            currentLineWidth += w.width;
          }
        });
        if (currentLine.length > 0) {
          lines.push({ words: currentLine, width: currentLineWidth });
        }

        // Render each line with justified spacing
        lines.forEach((line, lineIndex) => {
          let isLastLine = lineIndex === lines.length - 1;
          let spaceCount = line.words.filter(w => w.text === ' ').length;
          let extraSpacePerGap = 0;

          // Calculate exact spacing distribution
          if (!isLastLine && spaceCount > 0) {
            let textWidthWithoutSpaces = line.words.reduce((sum, w) => w.text !== ' ' ? sum + w.width : sum, 0);
            let totalGapSpace = maxTextWidth - textWidthWithoutSpaces;
            extraSpacePerGap = totalGapSpace / spaceCount;
          }

          let currentX = margin;
          line.words.forEach(w => {
            if (w.text === ' ') {
              currentX += (!isLastLine && spaceCount > 0) ? extraSpacePerGap : w.width;
              return;
            }
            if (w.highlight) {
              doc.setFillColor(255, 255, 0); 
              doc.rect(currentX, currentY - 4.2, w.width, 5.5, 'F');
            }
            doc.text(w.text, currentX, currentY);
            currentX += w.width;
          });
          currentY += lineHeight;
        });
        currentY += 4; 
      };

      // --- Paragraph 1 (Using "We", "our") ---
      renderParagraphJustified([
        { text: 'We, the students of ', highlight: false },
        { text: 'BSIT 2-1', highlight: true },
        { text: ', respectfully acknowledge and agree to the revised schedule for our classes and meetings in the subject ', highlight: false },
        { text: 'Tech Documentation', highlight: true },
        { text: ' with the subject code ', highlight: false },
        { text: 'ELECT IT-FE1', highlight: true },
        { text: '. As discussed, we confirm that the schedule change from the old time frame of ', highlight: false },
        { text: '1:00 PM - 3:00 PM', highlight: true },
        { text: ' to the new time frame of ', highlight: false },
        { text: '3:00 PM - 5:00 PM', highlight: true },
        { text: ' is acceptable and will be adhered to.', highlight: false }
      ]);

      // --- Paragraph 2 (Using "We", "our", "us") ---
      renderParagraphJustified([
        { text: 'We appreciate your understanding of our concerns and kindly ask for your assistance in accommodating this request. Should you require any further information or clarification, please do not hesitate to contact us.', highlight: false }
      ]);

      // --- Closing ---
      doc.text('Yours sincerely,', margin, currentY);
      currentY += 20;

      // --- Signatures Grid (Officers + 24 Extra Students) ---
      const officers = [
        'President', 'Vice President', 'Secretary', 
        'Assistant Secretary', 'Treasurer', 'Auditor', 
        'P.R.O', 'Muse', 'Escort'
      ];
      
      const totalSignatures = officers.length + 24;

      let sigX = margin;
      for (let i = 0; i < totalSignatures; i++) {
        
        // Draw the signature line
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.3);
        doc.line(sigX, currentY, sigX + 50, currentY);
        
        if (i < officers.length) {
          // Officer Title
          doc.setFontSize(8);
          doc.setFont('helvetica', 'bold');
          doc.text(officers[i], sigX + 25, currentY + 4, { align: 'center', maxWidth: 48 });
          
          // "Signature over printed name" below the title
          doc.setFontSize(7);
          doc.setFont('helvetica', 'normal');
          doc.text('Signature over printed name', sigX + 25, currentY + 7.5, { align: 'center', maxWidth: 48 });
        } else {
          // Generic Student
          doc.setFontSize(8);
          doc.setFont('helvetica', 'normal');
          doc.text('Signature over printed name', sigX + 25, currentY + 4, { align: 'center', maxWidth: 48 });
        }
        
        // Adjust column and row spacing
        if ((i + 1) % 3 === 0) {
          sigX = margin;
          currentY += 18;
        } else {
          sigX += 58; 
        }

        // Pagination check
        if (currentY > doc.internal.pageSize.height - 35 && i !== totalSignatures - 1) {
          drawCustomFooter(doc);
          doc.addPage();
          currentY = 20; 
        }
      }

      drawCustomFooter(doc);
      doc.save('LETTER_RESCHEDULE_TEMPLATE.pdf');
      
      this.snackBar.open('Template generated and downloaded successfully.', 'Close', { duration: 3000 });
    });
  }

  openAppealDialog(block: any): void {
    if (!this.isPublished) {
      this.snackBar.open('No official schedule published yet.', 'Close', { duration: 3000 });
      return;
    }

    // Intercept if appeals are disabled
    if (!this.isAppealEnabled) {
      this.openRequestAppealAccessDialog();
      return;
    }

    const formattedStart = this.formatTo12Hour(block.start_time);
    const startIndex = this.timeOptions.indexOf(formattedStart);
    const endTimeOptions = this.timeOptions.slice(
      this.timeOptions.indexOf(this.formatTo12Hour(block.start_time)) + 1
    );

    const dialogRef = this.dialog.open(DialogAppealScheduleComponent, {
      width: '520px', maxWidth: '95vw', maxHeight: '90vh',
      autoFocus: true,
      data: {
        isEditMode: true,
        facultyName: this.facultySchedule?.faculty_name ?? '',
        appealFile: null,
        appealDay: block.day,
        appealStartTime: '',
        appealEndTime: '',
        appealRoom: '',
        reason: '',
        options: { timeOptions: this.timeOptions, endTimeOptions },
        original: {
          scheduleId:  block.schedule_id,
          courseCode:  block.course_details.course_code,
          courseTitle: block.course_details.course_title,
          program:     block.program_code,
          yearLevel:   String(block.year_level),
          section:     block.section_name,
          day:         block.day,
          roomCode:    block.room_code,
          timeRange:   `${this.formatTo12Hour(block.start_time)} - ${this.formatTo12Hour(block.end_time)}`,
        },
      },
    });

    dialogRef.afterClosed().subscribe(res => {
      if (res) this.loadFacultySchedule();
    });
  }

  openRequestAppealAccessDialog(): void {
  const dialogRef = this.dialog.open(DialogRequestAccessComponent, {
    data: {
      has_request: this.hasAppealRequest,
      facultyId: this.authService.getUserFacultyId(),
      requestType: 'appeal'
    },
  });

  dialogRef.afterClosed().subscribe((result) => {
    if (result === true) {
      // Faculty just SENT a request
      this.hasAppealRequest = true;
      // DO NOT reload - keep local state, avoid re-triggering popup
    } else if (result === false) {
      // Faculty just CANCELLED their request
      this.hasAppealRequest = false;
      // DO NOT reload here either
    }
    // Only reload if result is undefined (dialog closed via X / Close button with no action)
    // Even then, don't reload — just trust local state
  });
}

  openMyAppealsDialog(block: any): void {
    this.dialog.open(DialogMyAppealsComponent, {
      width: this.isMobileView ? '94vw' : '620px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      autoFocus: true,
      data: { scheduleId: block.schedule_id },
    });
  }

  get academicYear(): string {
    return this.facultySchedule ? `${this.facultySchedule.year_start}-${this.facultySchedule.year_end}` : '';
  }

  get semester(): string {
    if (!this.facultySchedule) return '';
    switch (this.facultySchedule.semester) {
      case 1: return '1st Semester';
      case 2: return '2nd Semester';
      case 3: return 'Summer Semester';
      default: return '';
    }
  }

  get internalArrangementSchedule(): any {
    if (!this.facultySchedule) return null;
    
    const clone = JSON.parse(JSON.stringify(this.facultySchedule));
    const approvedAppeals = this.myAppeals?.filter(a => a.is_approved === 1 || a.is_approved === true) || [];

    if (Array.isArray(clone.schedules)) {
      clone.schedules = clone.schedules.map((sched: any) => {
        const matchingAppeal = approvedAppeals.find(a => a.schedule_id === sched.schedule_id);
        if (matchingAppeal) {
          return {
            ...sched,
            day: matchingAppeal.appeal_day,
            start_time: matchingAppeal.appeal_start_time,
            end_time: matchingAppeal.appeal_end_time,
            room_code: matchingAppeal.appeal_room || sched.room_code,
          };
        }
        return sched;
      });
    }

    return clone;
  }

  get hasInternalArrangements(): boolean {
    return (this.internalArrangementSchedule?.schedules?.length ?? 0) > 0;
  }

  private generateTimeOptions(): string[] {
    const options: string[] = [];
    for (let hour = 7; hour <= 21; hour++) {
      for (const minute of [0, 30]) {
        const period      = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
        const displayMin  = minute === 0 ? '00' : '30';
        options.push(`${displayHour}:${displayMin} ${period}`);
      }
    }
    return options;
  }

  private formatTo12Hour(time: string | null | undefined): string {
    if (!time) return '—';
    if (time.includes('AM') || time.includes('PM')) return time;
    const [hourStr, minuteStr] = time.split(':');
    let hours = parseInt(hourStr, 10);
    const minutes = minuteStr ?? '00';
    const period  = hours >= 12 ? 'PM' : 'AM';
    if (hours === 0) hours = 12;
    else if (hours > 12) hours -= 12;
    return `${hours}:${minutes} ${period}`;
  }

  onExportPdf() {
    if (this.timetableComponent) {
      this.timetableComponent.onExportPdf(); 
    }
  }

  async onExportExcel() {
    if (!this.facultySchedule) {
      this.snackBar.open('No schedule data available to export.', 'Close', { duration: 3000 });
      return;
    }

    const scheduleToExport = this.isOfficialView ? this.facultySchedule : this.internalArrangementSchedule;
    const schedulesArray = scheduleToExport?.schedules || [];

    if (schedulesArray.length === 0) {
      this.snackBar.open('No classes found in the selected schedule view.', 'Close', { duration: 3000 });
      return;
    }

    const workbook = new ExcelJS.Workbook();
    
    const viewLabel = this.isOfficialView ? 'Official' : 'Arrangement';
    const tabName = `Schedule (${viewLabel})`;
    const worksheet = workbook.addWorksheet(tabName);

    worksheet.pageSetup = {
      orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 }
    };

    worksheet.columns = [
      { width: 15 }, { width: 35 }, { width: 8 }, { width: 8 }, 
      { width: 10 }, { width: 15 }, { width: 15 }, { width: 25 }
    ];

    worksheet.mergeCells('A1:D1'); worksheet.mergeCells('E1:H1');
    worksheet.mergeCells('A2:D2'); worksheet.mergeCells('E2:H2');

    worksheet.getCell('A1').value = `Faculty Name: ${scheduleToExport.faculty_name.toUpperCase()}`;
    worksheet.getCell('E1').value = `Faculty Type: ${scheduleToExport.faculty_type}`;
    worksheet.getCell('A2').value = `School Year: ${this.academicYear} | Semester: ${this.semester}`;
    worksheet.getCell('E2').value = `Total Load: ${scheduleToExport.assigned_units} Units`;

    ['A1', 'E1', 'A2', 'E2'].forEach(c => {
      const cell = worksheet.getCell(c);
      cell.font = { bold: true };
      cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
    });

    worksheet.addRow([]);

    const headerRow = worksheet.addRow([
      'Subject Code', 'Description', 'Lec', 'Lab', 'Units', 'Section', 'Room No.', 'Schedule'
    ]);
    headerRow.height = 25;
    headerRow.eachCell(cell => {
      cell.font = { bold: true };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
    });

    const daysOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const sortedSchedules = [...schedulesArray].sort((a, b) => {
      return daysOrder.indexOf(a.day) - daysOrder.indexOf(b.day);
    });

    sortedSchedules.forEach((schedule: any) => {
      const dayShort = schedule.day.substring(0, 3).toUpperCase();
      const timeRange = `${this.formatTo12Hour(schedule.start_time)} - ${this.formatTo12Hour(schedule.end_time)}`;
      
      const row = worksheet.addRow([
        schedule.course_details?.course_code || '',
        schedule.course_details?.course_title || '',
        schedule.course_details?.lec || 0,
        schedule.course_details?.lab || 0,
        schedule.course_details?.units || 0,
        `${schedule.program_code} ${schedule.year_level}-${schedule.section_name}`,
        schedule.room_code || 'TBA',
        `${dayShort}\n${timeRange}`
      ]);

      row.eachCell((cell, colNum) => {
        cell.alignment = { vertical: 'middle', horizontal: colNum === 2 ? 'left' : 'center', wrapText: true };
        cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    
    const safeName = scheduleToExport.faculty_name.split(',')[0].replace(/[^\w\s]/gi, '_');
    const fileName = `${safeName}_${viewLabel}_Schedule_${this.academicYear.replace('-', '_')}.xlsx`;
    
    saveAs(blob, fileName);
  }
}
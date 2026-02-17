import { Component, Input, OnInit, ViewChild, ElementRef, AfterViewInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';

import { DialogAppealScheduleComponent } from '../dialog-appeal-schedule/dialog-appeal-schedule.component';
import { DialogViewScheduleComponent } from '../dialog-view-schedule/dialog-view-schedule.component';
import { DialogMyAppealsComponent } from '../dialog-my-appeals/dialog-my-appeals.component';
import { ReportHeaderService } from '../../core/services/report-header/report-header.service';
import { ReschedulingService, AppealResponse } from '../../core/services/faculty/rescheduling/rescheduling.service';

import { fadeAnimation, fabAnimation } from '../../core/animations/animations';

import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

interface TimeSlot {
  time: string;
  minutes: number;
}

interface ScheduleBlock {
  scheduleId: number;
  day: string;
  startSlot: number;
  duration: number;
  courseCode: string;
  courseTitle: string;
  roomCode: string;
  program: string;
  yearLevel: number;
  section: string;
}

// Appeal status per schedule_id
interface ScheduleAppealStatus {
  scheduleId: number;
  status: 'Pending' | 'Approved' | 'Denied' | null;
}

type Day =
  | 'Monday'
  | 'Tuesday'
  | 'Wednesday'
  | 'Thursday'
  | 'Friday'
  | 'Saturday'
  | 'Sunday';

@Component({
  selector: 'app-faculty-schedule-timetable',
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatDialogModule,
    MatTooltipModule,
  ],
  templateUrl: './faculty-schedule-timetable.component.html',
  styleUrls: ['./faculty-schedule-timetable.component.scss'],
  animations: [fadeAnimation, fabAnimation],
})
export class FacultyScheduleTimetableComponent implements OnInit, AfterViewInit {
  @ViewChild('tableWrapper') tableWrapper!: ElementRef;

  isLabelVisible = true;
  private lastScrollTop = 0;
  private readonly SCROLL_THRESHOLD = 25;

  @Input() facultySchedule: any;
  @Input() showPreview: boolean = true;

  days: Day[] = [
    'Monday', 'Tuesday', 'Wednesday', 'Thursday',
    'Friday', 'Saturday', 'Sunday',
  ];
  timeSlots: TimeSlot[] = [];
  scheduleBlocks: ScheduleBlock[] = [];

  // Map of scheduleId → latest appeal status
  appealStatuses: Map<number, string> = new Map();

  private reportHeaderService = inject(ReportHeaderService);

  constructor(
    private dialog: MatDialog,
    private reschedulingService: ReschedulingService,
  ) {}

  ngOnInit() {
    this.generateTimeSlots();
    this.processScheduleData();
    this.loadMyAppeals();
  }

  ngAfterViewInit() {
    const tableWrapperElement = this.tableWrapper.nativeElement;
    tableWrapperElement.addEventListener('scroll', () => {
      const currentScrollTop = tableWrapperElement.scrollTop;
      if (Math.abs(currentScrollTop - this.lastScrollTop) > this.SCROLL_THRESHOLD) {
        this.isLabelVisible = currentScrollTop <= this.lastScrollTop;
        this.lastScrollTop = currentScrollTop;
      }
    });
  }

  // ── Load faculty's own appeal statuses ────────────────────────
  loadMyAppeals(): void {
    this.reschedulingService.getMyAppeals().subscribe({
      next: (appeals) => {
        this.appealStatuses.clear();
        // For each schedule, keep only the most recent appeal status
        appeals.forEach(a => {
          const existing = this.appealStatuses.get(a.schedule_id);
          // Priority: Pending > Approved/Denied (show pending first)
          if (!existing || existing !== 'Pending') {
            const status = this.mapStatus(a.is_approved);
            this.appealStatuses.set(a.schedule_id, status);
          }
        });
      },
      error: (err) => console.error('Failed to load my appeals:', err),
    });
  }

  private mapStatus(is_approved: any): string {
    if (is_approved === true  || is_approved === 1)  return 'Approved';
    if (is_approved === false || is_approved === 0)  return 'Denied';
    return 'Pending';
  }

  // ── Appeal status helpers for template ────────────────────────
  getAppealStatusClass(day: string, slotIndex: number): string {
    const block = this.getScheduleBlock(day, slotIndex);
    if (!block) return '';
    const status = this.appealStatuses.get(block.scheduleId);
    if (!status) return 'no-appeal';
    return `appeal-${status.toLowerCase()}`;
  }

  getAppealStatusTooltip(day: string, slotIndex: number): string {
    const block = this.getScheduleBlock(day, slotIndex);
    if (!block) return '';
    const status = this.appealStatuses.get(block.scheduleId);
    switch (status) {
      default:         return 'Appeal History';
    }
  }

  // ── Open My Appeals dialog ────────────────────────────────────
  onViewMyAppeals(day: string, slotIndex: number): void {
    const block = this.getScheduleBlock(day, slotIndex);
    if (!block) return;

    const dialogRef = this.dialog.open(DialogMyAppealsComponent, {
      width: '580px',
      maxWidth: '95vw',
      disableClose: false,
      autoFocus: false,
      data: { scheduleId: block.scheduleId },
    });

    // Refresh statuses after dialog closes (e.g. after cancellation)
    dialogRef.afterClosed().subscribe(() => this.loadMyAppeals());
  }

  // ── Existing methods (unchanged) ─────────────────────────────

  private generateTimeSlots() {
    const startTime = 7 * 60;
    const endTime = 21 * 60;
    const interval = 30;
    for (let time = startTime; time <= endTime; time += interval) {
      this.timeSlots.push({ time: this.formatMinutesTo12Hour(time), minutes: time });
    }
  }

  private processScheduleData() {
    if (this.facultySchedule && this.facultySchedule.schedules) {
      this.scheduleBlocks = this.facultySchedule.schedules.map((schedule: any) => {
        const startTime = this.convertTimeToMinutes(schedule.start_time);
        const endTime   = this.convertTimeToMinutes(schedule.end_time);
        const startSlot = this.findTimeSlotIndex(startTime);
        const duration  = Math.ceil((endTime - startTime) / 30);
        const adjustedDuration = (endTime - startTime) % 30 === 0 ? duration + 1 : duration;
        return {
          scheduleId: schedule.schedule_id,
          day:        schedule.day,
          startSlot,
          duration:   adjustedDuration,
          courseCode: schedule.course_details.course_code,
          courseTitle: schedule.course_details.course_title,
          roomCode:   schedule.room_code,
          program:    schedule.program_code,
          yearLevel:  schedule.year_level,
          section:    schedule.section_name,
        };
      });
    }
  }

  private convertTimeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private findTimeSlotIndex(minutes: number): number {
    return this.timeSlots.findIndex(slot => slot.minutes >= minutes);
  }

  isScheduleBlockStart(day: string, slotIndex: number): boolean {
    return this.scheduleBlocks.some(b => b.day === day && slotIndex === b.startSlot);
  }

  getScheduleBlockHeight(day: string, slotIndex: number): number {
    const block = this.getScheduleBlock(day, slotIndex);
    return block ? block.duration * 26 - 2 : 0;
  }

  getScheduleBlockStyle(day: string, slotIndex: number): any {
    const block = this.getScheduleBlock(day, slotIndex);
    if (block) {
      const { backgroundColor, borderColor } = this.getBlockColors(day as Day);
      const baseStyle = {
        'background-color': backgroundColor,
        'border-left':  `1px solid ${borderColor}`,
        'border-right': `1px solid ${borderColor}`,
      };
      if (slotIndex === block.startSlot) {
        return { ...baseStyle, 'border-top': `1px solid ${borderColor}` };
      } else if (slotIndex === block.startSlot + block.duration - 1) {
        return { ...baseStyle, 'border-bottom': `1px solid ${borderColor}` };
      }
      return baseStyle;
    }
    return {};
  }

  getDayClass(day: string): string { return `schedule-${day.toLowerCase()}`; }

  getBlockProperty(day: string, slotIndex: number, property: keyof ScheduleBlock): any {
    const block = this.getScheduleBlock(day, slotIndex);
    return block ? block[property] : null;
  }

  getFormattedTime(day: string, slotIndex: number): string {
    const block = this.getScheduleBlock(day, slotIndex);
    if (block) {
      const schedule = this.facultySchedule.schedules.find(
        (s: any) => s.day === day &&
          this.convertTimeToMinutes(s.start_time) === this.timeSlots[slotIndex].minutes,
      );
      if (schedule) {
        return `${this.formatTimeTo12Hour(schedule.start_time)} - ${this.formatTimeTo12Hour(schedule.end_time)}`;
      }
    }
    return '';
  }

  private getBlockColors(day: Day) {
    const dayColors: Record<Day, { backgroundColor: string; borderColor: string }> = {
      Monday:    { backgroundColor: 'var(--primary-fade)',   borderColor: 'var(--primary-text)' },
      Tuesday:   { backgroundColor: 'var(--secondary-fade)', borderColor: 'var(--secondary-text)' },
      Wednesday: { backgroundColor: 'var(--blue-fade)',      borderColor: 'var(--blue-primary)' },
      Thursday:  { backgroundColor: 'var(--aqua-fade)',      borderColor: 'var(--aqua-primary)' },
      Friday:    { backgroundColor: 'var(--purple-fade)',    borderColor: 'var(--purple-primary)' },
      Saturday:  { backgroundColor: 'var(--green-fade)',     borderColor: 'var(--green-primary)' },
      Sunday:    { backgroundColor: 'var(--primary-fade)',   borderColor: 'var(--primary-text)' },
    };
    return dayColors[day];
  }

  private formatMinutesTo12Hour(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins  = minutes % 60;
    const ampm  = hours >= 12 ? 'PM' : 'AM';
    const h     = hours % 12 || 12;
    return `${h}:${mins.toString().padStart(2, '0')} ${ampm}`;
  }

  private formatTimeTo12Hour(time: string): string {
    let [hours, minutes] = time.split(':').map(Number);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${hours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  }

  private getScheduleBlock(day: string, slotIndex: number): ScheduleBlock | undefined {
    return this.scheduleBlocks.find(
      b => b.day === day && slotIndex >= b.startSlot && slotIndex < b.startSlot + b.duration,
    );
  }

  onEditScheduleBlock(day: string, slotIndex: number) {
    const block = this.getScheduleBlock(day, slotIndex);
    if (block) {
      const timeRange   = this.getFormattedTime(day, slotIndex);
      const timeOptions = this.generateTimeOptions();
      this.dialog.open(DialogAppealScheduleComponent, {
        width: '600px',
        disableClose: true,
        data: {
          original: { ...block, timeRange },
          options:  { timeOptions, endTimeOptions: [...timeOptions] },
          facultyName: this.facultySchedule.faculty_name,
          isEditMode: true,
        },
      });
    }
  }

  private generateTimeOptions(): string[] {
    const times: string[] = [];
    for (let hour = 7; hour <= 21; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const period      = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
        times.push(`${displayHour}:${minute.toString().padStart(2, '0')} ${period}`);
      }
    }
    return times;
  }

  // PDF export unchanged
  onExportPdf() {
    if (!this.facultySchedule || !this.facultySchedule.schedules) return;
    const generatePdfFunction = (preview: boolean): Blob => {
      const doc        = new jsPDF('landscape', 'mm', 'a4');
      const pageWidth  = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;
      const margin     = 10;
      const topMargin  = 15;
      const logoSize   = 22;

      let currentY = this.drawHeader(doc, topMargin, pageWidth, margin, logoSize,
        this.facultySchedule.faculty_name,
        `For Academic Year ${this.facultySchedule.year_start}-${this.facultySchedule.year_end}, ${this.formatSemester(this.facultySchedule.semester)}`);

      const days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
      const dayColumnWidth  = (pageWidth - margin * 2) / days.length;
      const maxContentHeight = pageHeight - margin;
      let maxYPosition = currentY;

      const startNewPage = () => {
        doc.addPage();
        currentY = this.drawHeader(doc, topMargin, pageWidth, margin, logoSize,
          'Faculty Schedule (Continued)',
          `For Academic Year ${this.facultySchedule.year_start}-${this.facultySchedule.year_end}, ${this.formatSemester(this.facultySchedule.semester)}`);
        days.forEach((day, index) => {
          const xPosition = margin + index * dayColumnWidth;
          doc.setFillColor(128, 0, 0);
          doc.rect(xPosition, currentY, dayColumnWidth, 10, 'F');
          doc.setDrawColor(200,200,200); doc.setLineWidth(0.5);
          doc.rect(xPosition, currentY, dayColumnWidth, 10);
          doc.setTextColor(255,255,255); doc.setFontSize(10); doc.setFont('helvetica','bold');
          doc.text(day, xPosition + dayColumnWidth / 2, currentY + 7, { align: 'center' });
        });
        currentY += 10;
        return currentY;
      };

      days.forEach((day, index) => {
        const xPosition = margin + index * dayColumnWidth;
        doc.setFillColor(128,0,0); doc.rect(xPosition, currentY, dayColumnWidth, 10, 'F');
        doc.setDrawColor(200,200,200); doc.setLineWidth(0.5); doc.rect(xPosition, currentY, dayColumnWidth, 10);
        doc.setTextColor(255,255,255); doc.setFontSize(10); doc.setFont('helvetica','bold');
        doc.text(day, xPosition + dayColumnWidth / 2, currentY + 7, { align: 'center' });
      });
      currentY += 10;

      days.forEach((day, dayIndex) => {
        const xPosition = margin + dayIndex * dayColumnWidth;
        let yPosition   = currentY;
        const daySchedule = this.facultySchedule.schedules
          .filter((item: any) => item.day === day)
          .sort((a: any, b: any) => this.convertTimeToMinutes(a.start_time) - this.convertTimeToMinutes(b.start_time));

        daySchedule.forEach((item: any) => {
          const courseContent = [
            item.course_details.course_code, item.course_details.course_title,
            `${item.program_code} ${item.year_level} - ${item.section_name}`, item.room_code,
            `${this.formatTimeTo12Hour(item.start_time)} - ${this.formatTimeTo12Hour(item.end_time)}`,
          ];
          const boxHeight = this.calculateBoxHeight(doc, courseContent, dayColumnWidth);
          if (yPosition + boxHeight > maxContentHeight) {
            days.forEach((_, i) => {
              const lineX = margin + i * dayColumnWidth;
              doc.setDrawColor(200,200,200); doc.setLineWidth(0.5);
              doc.line(lineX, currentY, lineX, maxYPosition);
            });
            doc.line(pageWidth - margin, currentY, pageWidth - margin, maxYPosition);
            yPosition = startNewPage(); maxYPosition = yPosition;
          }
          doc.setFillColor(240,240,240); doc.rect(xPosition, yPosition, dayColumnWidth, boxHeight, 'F');
          let textYPosition = yPosition + 5;
          courseContent.forEach((line: string, index) => {
            doc.setTextColor(0); doc.setFontSize(9); doc.setFont('helvetica', index <= 1 ? 'bold' : 'normal');
            const wrappedLines = doc.splitTextToSize(line, dayColumnWidth - 10);
            wrappedLines.forEach((wrappedLine: string) => { doc.text(wrappedLine, xPosition + 5, textYPosition); textYPosition += 5; });
            if (index === courseContent.length - 1) {
              const timeTextWidth = doc.getTextWidth(line);
              doc.setDrawColor(0,0,0); doc.setLineWidth(0.2);
              doc.line(xPosition + 5, textYPosition - 4, xPosition + 5 + timeTextWidth, textYPosition - 4);
            }
          });
          yPosition += boxHeight + 5;
          if (yPosition > maxYPosition) maxYPosition = yPosition;
        });
      });

      days.forEach((_, i) => {
        const lineX = margin + i * dayColumnWidth;
        doc.setDrawColor(200,200,200); doc.setLineWidth(0.5);
        doc.line(lineX, currentY, lineX, maxYPosition);
      });
      doc.line(pageWidth - margin, currentY, pageWidth - margin, maxYPosition);
      doc.line(margin, maxYPosition, pageWidth - margin, maxYPosition);
      return doc.output('blob');
    };

    const pdfBlob = generatePdfFunction(this.showPreview);
    if (this.showPreview) {
      this.dialog.open(DialogViewScheduleComponent, {
        maxWidth: '90vw', width: '100%',
        data: { exportType: 'all', entity: 'faculty', entityData: this.facultySchedule.schedules,
          customTitle: this.facultySchedule.faculty_name, fileName: this.generateFileName(),
          academicYear: `${this.facultySchedule.year_start}-${this.facultySchedule.year_end}`,
          semester: this.formatSemester(this.facultySchedule.semester), generatePdfFunction, showViewToggle: false },
        disableClose: true,
      });
    } else {
      const blobUrl = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = blobUrl; a.download = `${this.generateFileName()}.pdf`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    }
  }

  private formatSemester(semester: number): string {
    switch (semester) { case 1: return '1st Semester'; case 2: return '2nd Semester'; case 3: return 'Summer Semester'; default: return `${semester}`; }
  }

  private generateFileName(): string {
    const formattedName  = this.facultySchedule.faculty_name.replace(',', '').replace(/\s+/g, '_');
    const academicYear   = `${this.facultySchedule.year_start}-${this.facultySchedule.year_end}`;
    const semester       = this.formatSemester(this.facultySchedule.semester).replace(/\s+/g, '_');
    return `${formattedName}_Schedules_${academicYear}_${semester}`;
  }

  private drawHeader(doc: jsPDF, startY: number, pageWidth: number, margin: number, logoSize: number, title: string, subtitle: string): number {
    let currentY = startY;
    this.reportHeaderService.addHeader(doc, title, currentY, subtitle).subscribe(newY => { currentY = newY; });
    return currentY;
  }

  private calculateBoxHeight(doc: jsPDF, content: string[], dayColumnWidth: number): number {
    const padding = 10; let totalHeight = 5;
    content.forEach((line: string, index: number) => {
      doc.setFontSize(9); doc.setFont('helvetica', index <= 1 ? 'bold' : 'normal');
      const wrappedLines = doc.splitTextToSize(line, dayColumnWidth - padding);
      totalHeight += wrappedLines.length * 5;
    });
    return totalHeight + 5;
  }
}
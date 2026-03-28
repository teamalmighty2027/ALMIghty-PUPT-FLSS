import { Component, Input, Output, EventEmitter, OnInit, ViewChild, ElementRef, AfterViewInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';

import { ReportHeaderService } from '../../core/services/report-header/report-header.service';
import { ReschedulingService } from '../../core/services/faculty/rescheduling/rescheduling.service';

import { fadeAnimation, fabAnimation } from '../../core/animations/animations';
import { DialogExportComponent } from '../dialog-export/dialog-export.component';

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

type Day = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';

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
  
  @Input() isReadOnly: boolean = false;
  @Input() showAppealButtons: boolean = false;
  @Input() exportMode: 'official' | 'internal' = 'official';
  @Output() appealClicked = new EventEmitter<any>();
  @Output() viewAppealsClicked = new EventEmitter<any>();

  days: Day[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  timeSlots: TimeSlot[] = [];
  scheduleBlocks: ScheduleBlock[] = [];

  appealStatuses: Map<number, string> = new Map();
  private reportHeaderService = inject(ReportHeaderService);

  constructor(
    private dialog: MatDialog,
    private reschedulingService: ReschedulingService,
  ) {}

  ngOnInit() {
    this.generateTimeSlots();
    this.processScheduleData();
    // 👇 Gate network call behind the showAppealButtons flag
    if (this.showAppealButtons) {
      this.loadMyAppeals();
    }
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

  loadMyAppeals(): void {
    this.reschedulingService.getMyAppeals().subscribe({
      next: (appeals) => {
        this.appealStatuses.clear();
        appeals.forEach(a => {
          const existing = this.appealStatuses.get(a.schedule_id);
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

  getAppealStatusClass(day: string, slotIndex: number): string {
    const block = this.getScheduleBlock(day, slotIndex);
    if (!block) return '';
    const status = this.appealStatuses.get(block.scheduleId);
    if (!status) return 'no-appeal';
    return `appeal-${status.toLowerCase()}`;
  }

  getAppealStatusTooltip(day: string, slotIndex: number): string {
    return 'Appeal History';
  }

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
    return block ? block.duration * 40 - 2 : 0;
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

  getRawSchedule(day: string, slotIndex: number): any {
    const block = this.getScheduleBlock(day, slotIndex);
    if (!block) return null;
    return this.facultySchedule.schedules.find((s: any) => s.schedule_id === block.scheduleId);
  }

  onEditScheduleBlock(day: string, slotIndex: number, event: Event) {
    event.stopPropagation();
    const raw = this.getRawSchedule(day, slotIndex);
    if (raw) {
      this.appealClicked.emit(raw);
    }
  }

  onViewMyAppeals(day: string, slotIndex: number, event: Event) {
    event.stopPropagation();
    const raw = this.getRawSchedule(day, slotIndex);
    if (raw) {
      this.viewAppealsClicked.emit(raw);
    }
  }

  onExportPdf() {
    if (!this.facultySchedule || !this.facultySchedule.schedules) return;

    const facultyName = this.facultySchedule.faculty_name || 'Faculty';
    // 👇 Derive title based on current export mode
    const viewType = this.exportMode === 'internal' ? 'Internal Arrangement' : 'Official Schedule';

    this.dialog.open(DialogExportComponent, {
      width: '90vw',
      maxWidth: '1200px',
      disableClose: true,
      data: {
        exportType: 'single', 
        customTitle: `${facultyName} Schedule`,
        subtitle: `${viewType} For Academic Year ${this.facultySchedule.year_start}-${this.facultySchedule.year_end}, ${this.formatSemester(this.facultySchedule.semester)}`, // 👈 Uses the new viewType
        generatePdfFunction: async (showPreview: boolean) => {
          return await this.generatePdfBlob(); 
        },
        generateFileNameFunction: () => this.generateFileName()
      }
    });
  }

  private async generatePdfBlob(): Promise<Blob> {
    const doc = new jsPDF('landscape', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const margin = 10;
    const topMargin = 15;

    let currentY = await this.drawHeaderAsync(
      doc,
      topMargin,
      this.facultySchedule.faculty_name,
      `For Academic Year ${this.facultySchedule.year_start}-${this.facultySchedule.year_end}, ${this.formatSemester(this.facultySchedule.semester)}`
    );

    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const dayColumnWidth = (pageWidth - margin * 2) / days.length;
    const maxContentHeight = pageHeight - 20; 
    let maxYPosition = currentY;

    const startNewPage = async () => {
      this.reportHeaderService.addStandardFooter(doc); // Add footer before page break
      doc.addPage();
      currentY = await this.drawHeaderAsync(
        doc,
        topMargin,
        'Faculty Schedule (Continued)',
        `For Academic Year ${this.facultySchedule.year_start}-${this.facultySchedule.year_end}, ${this.formatSemester(this.facultySchedule.semester)}`
      );
      
      days.forEach((day, index) => {
        const xPosition = margin + index * dayColumnWidth;
        doc.setFillColor(128, 0, 0);
        doc.rect(xPosition, currentY, dayColumnWidth, 10, 'F');
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.5);
        doc.rect(xPosition, currentY, dayColumnWidth, 10);
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(day, xPosition + dayColumnWidth / 2, currentY + 7, { align: 'center' });
      });
      currentY += 10;
      return currentY;
    };

    days.forEach((day, index) => {
      const xPosition = margin + index * dayColumnWidth;
      doc.setFillColor(128, 0, 0);
      doc.rect(xPosition, currentY, dayColumnWidth, 10, 'F');
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.5);
      doc.rect(xPosition, currentY, dayColumnWidth, 10);
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(day, xPosition + dayColumnWidth / 2, currentY + 7, { align: 'center' });
    });
    currentY += 10;

    for (let dayIndex = 0; dayIndex < days.length; dayIndex++) {
      const day = days[dayIndex];
      const xPosition = margin + dayIndex * dayColumnWidth;
      let yPosition = currentY;
      const daySchedule = this.facultySchedule.schedules
        .filter((item: any) => item.day === day)
        .sort((a: any, b: any) => this.convertTimeToMinutes(a.start_time) - this.convertTimeToMinutes(b.start_time));

      for (const item of daySchedule) {
        const courseContent = [
          item.course_details.course_code, item.course_details.course_title,
          `${item.program_code} ${item.year_level} - ${item.section_name}`, 
          item.room_code && item.room_code.trim() !== '' ? item.room_code : 'TBA',
          `${this.formatTimeTo12Hour(item.start_time)} - ${this.formatTimeTo12Hour(item.end_time)}`,
        ];
        
        const boxHeight = this.calculateBoxHeight(doc, courseContent, dayColumnWidth);
        
        if (yPosition + boxHeight > maxContentHeight) {
          days.forEach((_, i) => {
            const lineX = margin + i * dayColumnWidth;
            doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.5);
            doc.line(lineX, currentY, lineX, maxYPosition);
          });
          doc.line(pageWidth - margin, currentY, pageWidth - margin, maxYPosition);
          
          yPosition = await startNewPage(); 
          maxYPosition = yPosition;
        }
        
        doc.setFillColor(240, 240, 240); doc.rect(xPosition, yPosition, dayColumnWidth, boxHeight, 'F');
        let textYPosition = yPosition + 5;
        
        courseContent.forEach((line: string, index) => {
          doc.setTextColor(0); doc.setFontSize(9); doc.setFont('helvetica', index <= 1 ? 'bold' : 'normal');
          const wrappedLines = doc.splitTextToSize(line, dayColumnWidth - 10);
          wrappedLines.forEach((wrappedLine: string) => { doc.text(wrappedLine, xPosition + 5, textYPosition); textYPosition += 5; });
          if (index === courseContent.length - 1) {
            const timeTextWidth = doc.getTextWidth(line);
            doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.2);
            doc.line(xPosition + 5, textYPosition - 4, xPosition + 5 + timeTextWidth, textYPosition - 4);
          }
        });
        yPosition += boxHeight + 5;
        if (yPosition > maxYPosition) maxYPosition = yPosition;
      }
    }

    days.forEach((_, i) => {
      const lineX = margin + i * dayColumnWidth;
      doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.5);
      doc.line(lineX, currentY, lineX, maxYPosition);
    });
    doc.line(pageWidth - margin, currentY, pageWidth - margin, maxYPosition);
    doc.line(margin, maxYPosition, pageWidth - margin, maxYPosition);
    
    this.reportHeaderService.addStandardFooter(doc); // Add footer to the very last page
    return doc.output('blob'); 
  }

  private drawHeaderAsync(doc: jsPDF, startY: number, title: string, subtitle: string): Promise<number> {
    return new Promise((resolve) => {
      this.reportHeaderService.addHeader(doc, title, startY, subtitle).subscribe({
        next: (newY) => resolve(newY),
        error: () => resolve(startY + 30)
      });
    });
  }

  private formatSemester(semester: number): string {
    switch (semester) { case 1: return '1st Semester'; case 2: return '2nd Semester'; case 3: return 'Summer Semester'; default: return `${semester}`; }
  }

  private generateFileName(): string {
    const formattedName  = this.facultySchedule.faculty_name.replace(',', '').replace(/\s+/g, '_');
    const academicYear   = `${this.facultySchedule.year_start}-${this.facultySchedule.year_end}`;
    const semester       = this.formatSemester(this.facultySchedule.semester).replace(/\s+/g, '_');
    const type = this.exportMode === 'internal' ? 'Internal_Arrangement' : 'Official_Schedule';
    return `${formattedName}_${type}_${academicYear}_${semester}`;
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
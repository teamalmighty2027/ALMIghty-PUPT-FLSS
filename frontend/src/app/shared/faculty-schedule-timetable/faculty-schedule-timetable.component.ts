import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, ViewChild, ElementRef, AfterViewInit, inject } from '@angular/core';
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
  isBridging: boolean;
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
export class FacultyScheduleTimetableComponent implements OnInit, OnChanges, AfterViewInit {
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
    if (this.showAppealButtons) {
      this.loadMyAppeals();
    }
  }

  /**
   * Detects changes to @Input properties and re-processes data.
   */
  ngOnChanges(changes: SimpleChanges) {
    if (changes['facultySchedule'] && !changes['facultySchedule'].firstChange) {
      this.scheduleBlocks = [];
      this.processScheduleData();
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
      // Merge same-slot bridging entries first
      const mergedMap = new Map<string, any>();
      for (const schedule of this.facultySchedule.schedules) {
        const key = `${schedule.day}|${schedule.start_time}|${schedule.end_time}`;
        if (mergedMap.has(key)) {
          const existing = mergedMap.get(key);
          if (!existing._mergedPrograms) existing._mergedPrograms = [existing.program_code];
          if (!existing._mergedPrograms.includes(schedule.program_code)) {
            existing._mergedPrograms.push(schedule.program_code);
          }
        } else {
          mergedMap.set(key, { ...schedule });
        }
      }

      this.scheduleBlocks = [...mergedMap.values()].map((schedule: any) => {
        // Validate required fields exist
        if (!schedule.start_time || !schedule.end_time || 
            !schedule.course_details) {
          console.warn('Incomplete schedule data:', schedule);
          return null;
        }

        const startTime = this.convertTimeToMinutes(schedule.start_time);
        const endTime   = this.convertTimeToMinutes(schedule.end_time);
        const startSlot = this.findTimeSlotIndex(startTime);
        const duration  = Math.ceil((endTime - startTime) / 30);
        const adjustedDuration = (endTime - startTime) % 30 === 0 ? 
          duration + 1 : duration;

        // Build program display
        let programDisplay: string;
        if (schedule._mergedPrograms && 
            schedule._mergedPrograms.length > 1) {
          programDisplay = schedule._mergedPrograms
            .sort().reverse().join('/') +
            ` ${schedule.year_level}-${schedule.section_name}`;
        } else {
          programDisplay = `${schedule.program_code} ` +
            `${schedule.year_level}-${schedule.section_name}`;
        }

        return {
          scheduleId:     schedule.schedule_id,
          day:            schedule.day,
          startSlot,
          duration:       adjustedDuration,
          courseCode:     schedule.course_details.course_code,
          courseTitle:    schedule.course_details.course_title,
          roomCode:       schedule.room_code,
          program:        programDisplay,
          yearLevel:      schedule.year_level,
          section:        schedule.section_name,
          isBridging:     schedule.course_details?.offering_type === 
            'bridging',
        };
      }).filter((block): block is ScheduleBlock => block !== null);
    }
  }

  private convertTimeToMinutes(time: string | null): number {
    if (!time) return 0;
    const parts = time.split(':').map(Number);
    if (parts.length < 2) return 0;
    const [hours, minutes] = parts;
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

  private getScheduleBlock(
    day: string, slotIndex: number
  ): ScheduleBlock | undefined {
    return this.scheduleBlocks.find(
      b => b.day === day && slotIndex >= b.startSlot && 
        slotIndex < b.startSlot + b.duration,
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
    const viewType = this.exportMode === 'internal' ? 'Internal Arrangement' : 'Official Schedule';

    this.dialog.open(DialogExportComponent, {
      width: '90vw',
      maxWidth: '1200px',
      disableClose: true,
      autoFocus: true,
      data: {
        exportType: 'single', 
        customTitle: `${facultyName} Schedule`,
        subtitle: `${viewType} For Academic Year ${this.facultySchedule.year_start}-${this.facultySchedule.year_end}, ${this.formatSemester(this.facultySchedule.semester)}`,
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
    const margin = 10;
    const topMargin = 15;

    const scheduleData = this.facultySchedule?.schedules || [];
    const title = this.facultySchedule.faculty_name;
    const subtitle = `For Academic Year ${this.facultySchedule.year_start}-${this.facultySchedule.year_end}, ${this.formatSemester(this.facultySchedule.semester)}`;

    let currentY = await this.drawHeaderAsync(doc, topMargin, title, subtitle);

    this.drawScheduleGrid(doc, scheduleData, title, subtitle, currentY, margin, pageWidth);

    this.reportHeaderService.addStandardFooter(doc);
    return doc.output('blob');
  }

  private drawScheduleGrid(
    doc: jsPDF, scheduleData: any[], title: string, subtitle: string,
    startY: number, margin: number, pageWidth: number
  ): void {
    if (!scheduleData || scheduleData.length === 0) return;

    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const timeColWidth = 22;
    const dayColumnWidth = (pageWidth - margin * 2 - timeColWidth) / days.length;
    const rowHeight = 8.5;

    const timeSlots: { time: string; minutes: number }[] = [];
    for (let t = 7 * 60; t <= 21 * 60; t += 30) {
      const h = Math.floor(t / 60), m = t % 60;
      const ampm = h >= 12 ? 'PM' : 'AM';
      const hh = h % 12 || 12;
      timeSlots.push({ time: `${hh}:${m.toString().padStart(2, '0')} ${ampm}`, minutes: t });
    }

    const chunks = [
      { name: 'Morning',   start: 420,  end: 840  },
      { name: 'Afternoon', start: 840,  end: 1260 },
    ];

    const activeChunks = chunks.filter(chunk =>
      scheduleData.some(s => {
        const ss = this.convertTimeToMinutes(s.start_time);
        const se = this.convertTimeToMinutes(s.end_time);
        return Math.max(ss, chunk.start) < Math.min(se, chunk.end);
      })
    );

    if (activeChunks.length === 0) {
      doc.setFontSize(20); doc.setFont('helvetica', 'italic');
      doc.setTextColor(128, 128, 128);
      doc.text('No Assigned Schedule', pageWidth / 2, startY + 50, { align: 'center' });
      return;
    }

    // Merge same-slot bridging entries
    const mergedMap = new Map<string, any>();
    for (const item of scheduleData) {
      const key = `${item.day}|${item.start_time}|${item.end_time}`;
      if (mergedMap.has(key)) {
        const existing = mergedMap.get(key);
        if (!existing._mergedPrograms) existing._mergedPrograms = [existing.program_code];
        if (!existing._mergedPrograms.includes(item.program_code)) {
          existing._mergedPrograms.push(item.program_code);
        }
      } else {
        mergedMap.set(key, { ...item });
      }
    }
    const mergedData = [...mergedMap.values()];

    let pageUsed = false;
    let currentY = startY;

    for (const chunk of activeChunks) {
      if (pageUsed) {
        this.reportHeaderService.addStandardFooter(doc);
        doc.addPage();
        currentY = 15;
        // Re-draw header on new page (sync fallback)
        this.reportHeaderService.addHeader(doc, title, currentY, subtitle)
          .subscribe(newY => { currentY = newY; });
      }
      pageUsed = true;
      currentY -= 3;

      // --- Column Headers ---
      doc.setFillColor(128, 0, 0);
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');

      doc.rect(margin, currentY, timeColWidth, 10, 'F');
      doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.5);
      doc.rect(margin, currentY, timeColWidth, 10);
      doc.text('Time', margin + timeColWidth / 2, currentY + 6.5, { align: 'center' });

      days.forEach((day, i) => {
        const xPos = margin + timeColWidth + i * dayColumnWidth;
        doc.setFillColor(128, 0, 0);
        doc.rect(xPos, currentY, dayColumnWidth, 10, 'F');
        doc.rect(xPos, currentY, dayColumnWidth, 10);
        doc.text(day, xPos + dayColumnWidth / 2, currentY + 6.5, { align: 'center' });
      });
      currentY += 10;

      // --- Time Grid ---
      doc.setTextColor(0, 0, 0);
      const chunkSlots = timeSlots.filter(s => s.minutes >= chunk.start && s.minutes < chunk.end);

      chunkSlots.forEach((slot, index) => {
        const yPos = currentY + index * rowHeight;
        const isTopRow    = index === 0;
        const isBottomRow = index === chunkSlots.length - 1;
        const isThreeHourGap = slot.minutes >= 450 && (slot.minutes - 450) % 180 === 0;

        if (isTopRow || isBottomRow || isThreeHourGap) {
          if (!isTopRow) {
            doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.5);
            doc.line(margin, yPos, pageWidth - margin, yPos);
          }
          doc.setFontSize(9); doc.setFont('helvetica', 'bold');
          doc.text(slot.time, margin + timeColWidth / 2, yPos + 5, { align: 'center' });
        }
      });

      const finalY = currentY + chunkSlots.length * rowHeight;
      doc.setDrawColor(200, 200, 200);
      doc.line(margin, finalY, pageWidth - margin, finalY);
      doc.line(margin, currentY, margin, finalY);
      doc.line(margin + timeColWidth, currentY, margin + timeColWidth, finalY);
      days.forEach((_, i) => {
        const xPos = margin + timeColWidth + (i + 1) * dayColumnWidth;
        doc.line(xPos, currentY, xPos, finalY);
      });

      // --- Draw Blocks ---
      const sorted = [...mergedData].sort(
        (a, b) => this.convertTimeToMinutes(a.start_time) - this.convertTimeToMinutes(b.start_time)
      );

      sorted.forEach(item => {
        const dayIndex = days.indexOf(item.day);
        if (dayIndex === -1) return;

        const cappedStart = Math.max(this.convertTimeToMinutes(item.start_time), chunk.start);
        const cappedEnd   = Math.min(this.convertTimeToMinutes(item.end_time), chunk.end);
        if (cappedStart >= cappedEnd) return;

        const startSlot = chunkSlots.findIndex(s => s.minutes === cappedStart);
        if (startSlot === -1) return;

        const duration = Math.ceil((cappedEnd - cappedStart) / 30);
        const xPos  = margin + timeColWidth + dayIndex * dayColumnWidth;
        const yPos  = currentY + startSlot * rowHeight;
        const height = duration * rowHeight;

        doc.setFillColor(240, 240, 240);
        doc.setDrawColor(128, 0, 0);
        doc.setLineWidth(0.3);
        doc.rect(xPos, yPos, dayColumnWidth, height, 'FD');

        // Dynamic sizing
        let startPadding = 5, lineSpacing = 4.2, bottomBoundary = 6;
        let codeFontSize = 10, textFontSize = 9, timeFontSize = 9.5, timeBottomPadding = 2;

        if (duration <= 2) {
          startPadding = 3.5; lineSpacing = 2.8; bottomBoundary = 3.5;
          codeFontSize = 7.5; textFontSize = 6.5; timeFontSize = 7; timeBottomPadding = 1.2;
        } else if (duration === 3) {
          startPadding = 4; lineSpacing = 3.4; bottomBoundary = 4.5;
          codeFontSize = 8.5; textFontSize = 7.5; timeFontSize = 8; timeBottomPadding = 1.5;
        } else if (duration >= 4) {
          startPadding = 5; lineSpacing = 4; bottomBoundary = 5;
          codeFontSize = 9.5; textFontSize = 8.5; timeFontSize = 9; timeBottomPadding = 1.8;
        }

        // Time at bottom
        const timeString = `${this.formatTimeTo12Hour(item.start_time)} - ${this.formatTimeTo12Hour(item.end_time)}`;
        doc.setTextColor(0); doc.setFontSize(timeFontSize); doc.setFont('helvetica', 'normal');
        doc.text(timeString, xPos + dayColumnWidth / 2, yPos + height - timeBottomPadding, { align: 'center' });

        // Program display — merge if combined
        let programDisplay: string;
        if (item._mergedPrograms && item._mergedPrograms.length > 1) {
          programDisplay = item._mergedPrograms.sort().reverse().join('/') +
            ` ${item.year_level} - ${item.section_name}`;
        } else {
          programDisplay = `${item.program_code} ${item.year_level} - ${item.section_name}`;
        }

        const isBridging = item.course_details?.offering_type === 'bridging';

        const content = [
          item.course_details?.course_code || '',
          item.course_details?.course_title || '',
          programDisplay,
          item.room_code && item.room_code.trim() !== '' ? item.room_code : 'Room TBA',
        ].filter(l => l !== '');

        let textY = yPos + startPadding;

        // Draw "Bridging" badge at top-right of block if applicable
        if (isBridging) {
          const badgeLabel = 'Bridging';
          const badgeFontSize = duration <= 2 ? 5.5 : 6.5;
          const badgePaddingX = 2.5;
          const badgePaddingY = 1.5;
          doc.setFontSize(badgeFontSize);
          doc.setFont('helvetica', 'bold');
          const badgeTextWidth = doc.getTextWidth(badgeLabel);
          const badgeW = badgeTextWidth + badgePaddingX * 2;
          const badgeH = badgeFontSize * 0.45 + badgePaddingY * 2;
          // Center the badge horizontally in the block
          const badgeX = xPos + (dayColumnWidth - badgeW) / 2;
          // Place it just below the course code (textY is already advanced past course code)
          const badgeY = textY - lineSpacing + (duration <= 2 ? 0.5 : 1);
          doc.setFillColor(128, 0, 0);
          doc.setDrawColor(128, 0, 0);
          doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 1, 1, 'FD');
          doc.setTextColor(255, 255, 255);
          doc.text(badgeLabel, badgeX + badgePaddingX, badgeY + badgeH - badgePaddingY - 0.2);
          doc.setTextColor(0, 0, 0);
          // Advance textY so subsequent lines don't overlap the badge
          textY += badgeH + (duration <= 2 ? 0.5 : 1.5);
        }

        content.forEach((line, idx) => {
          doc.setFontSize(idx === 0 ? codeFontSize : textFontSize);
          doc.setFont('helvetica', idx === 0 ? 'bold' : 'normal');
          
          const wrappedLines = doc.splitTextToSize(line, dayColumnWidth - 2);
          wrappedLines.forEach((wLine: string) => {
            if (textY < yPos + height - bottomBoundary) { 
              doc.text(wLine, xPos + dayColumnWidth / 2, textY, { align: 'center' });
              textY += lineSpacing; 
            }
          });
        });
      });
    }
  }

  private drawHeaderAsync(
    doc: jsPDF, startY: number, title: string, subtitle: string
  ): Promise<number> {

    return new Promise((resolve) => {
      this.reportHeaderService.addHeader(doc, title, startY, subtitle).subscribe({
        next: (newY) => resolve(newY),
        error: () => resolve(startY + 30)
      });
    });
  }

  private formatSemester(semester: number): string {
    switch (semester) { 
      case 1: return '1st Semester'; 
      case 2: return '2nd Semester'; 
      case 3: return 'Summer Semester'; 
      default: return `${semester}`; 
    }
  }

  private generateFileName(): string {
    const formattedName  = this.facultySchedule.faculty_name.replace(',', '').replace(/\s+/g, '_');
    const academicYear   = `${this.facultySchedule.year_start}-${this.facultySchedule.year_end}`;
    const semester       = this.formatSemester(this.facultySchedule.semester).replace(/\s+/g, '_');
    const type = this.exportMode === 'internal' ? 'Internal_Arrangement' : 'Official_Schedule';
    return `${formattedName}_${type}_${academicYear}_${semester}`;
  }

}
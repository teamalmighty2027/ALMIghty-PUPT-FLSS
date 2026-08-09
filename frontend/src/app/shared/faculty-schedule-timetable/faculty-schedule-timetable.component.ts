import { 
  Component, 
  Input, 
  Output, 
  EventEmitter, 
  OnInit, 
  OnChanges, 
  SimpleChanges, 
  ViewChild, 
  ElementRef,
  OnDestroy,
  inject 
} from '@angular/core';
import { CommonModule } from '@angular/common';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';

import { ReportHeaderService } from '../../core/services/report-header/report-header.service';
import { ReschedulingService } from '../../core/services/faculty/rescheduling/rescheduling.service';

import { fadeAnimation, fabAnimation } from '../../core/animations/animations';
import { DialogExportComponent } from '../dialog-export/dialog-export.component';
import {
  FacultyScheduleMobileComponent
} from '../faculty-schedule-mobile/faculty-schedule-mobile.component';

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

type Day = 'Monday' | 
  'Tuesday' | 
  'Wednesday' | 
  'Thursday' | 
  'Friday' | 
  'Saturday' | 
  'Sunday';

@Component({
  selector: 'app-faculty-schedule-timetable',
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatDialogModule,
    MatTooltipModule,
    FacultyScheduleMobileComponent,
  ],
  templateUrl: './faculty-schedule-timetable.component.html',
  styleUrls: ['./faculty-schedule-timetable.component.scss'],
  animations: [fadeAnimation, fabAnimation],
})
export class FacultyScheduleTimetableComponent implements 
  OnInit, OnChanges, OnDestroy {
  private _tableWrapper?: ElementRef;

  @ViewChild('tableWrapper') set tableWrapper(
    content: ElementRef | undefined
  ) {
    if (content) {
      this._tableWrapper = content;
      this.attachScrollListener();
    }
  }

  isLabelVisible = true;
  isMobileView = typeof window !== 'undefined' && window.innerWidth <= 768;
  private lastScrollTop = 0;
  private readonly SCROLL_THRESHOLD = 25;

  @Input() facultySchedule: any;
  @Input() showPreview: boolean = true;
  
  @Input() isReadOnly: boolean = false;
  @Input() showAppealButtons: boolean = false;
  @Input() exportMode: 'official' | 'internal' = 'official';
  @Output() appealClicked = new EventEmitter<any>();
  @Output() viewAppealsClicked = new EventEmitter<any>();

  days: Day[] = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday'
  ];
  timeSlots: TimeSlot[] = [];
  scheduleBlocks: ScheduleBlock[] = [];

  appealStatuses: Map<number, string> = new Map();
  private reportHeaderService = inject(ReportHeaderService);

  constructor(
    private dialog: MatDialog,
    private reschedulingService: ReschedulingService,
  ) {}

  /**
   * Initialize component: generate time slots and process schedules.
   * Called once when the component is instantiated.
   */
  ngOnInit() {
    this.isMobileView = typeof window !== 'undefined' &&
      window.innerWidth <= 768;
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this.handleViewportResize);
    }

    this.generateTimeSlots();
    this.processScheduleData();
    if (this.showAppealButtons) {
      this.loadMyAppeals();
    }
  }

  // Cleanup resize listener on component destruction
  ngOnDestroy() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.handleViewportResize);
    }
  }

  // Listen to window resize events to update mobile view status
  private handleViewportResize = (): void => {
    this.isMobileView = typeof window !== 'undefined' &&
      window.innerWidth <= 768;
  };

  /**
   * Detects changes to @Input properties and re-processes data.
   */
  /**
   * Respond to changes in @Input properties and re-process schedule data.
   * @param changes - Angular SimpleChanges containing the changed inputs.
   */
  ngOnChanges(changes: SimpleChanges) {
    if (changes['facultySchedule'] && !changes['facultySchedule'].firstChange) {
      this.scheduleBlocks = [];
      this.processScheduleData();
    }
  }

  /**
   * After view init: attach scroll listener 
   * to the table wrapper to toggle label visibility.
   */
  // Attach scroll listener to table wrapper
  private attachScrollListener() {
    if (!this._tableWrapper) {
      return;
    }

    const tableWrapperElement = this._tableWrapper.nativeElement;
    tableWrapperElement.addEventListener('scroll', () => {
      const currentScrollTop = tableWrapperElement.scrollTop;
      const diff = Math.abs(currentScrollTop - this.lastScrollTop);
      if (diff > this.SCROLL_THRESHOLD) {
        this.isLabelVisible = currentScrollTop <= this.lastScrollTop;
        this.lastScrollTop = currentScrollTop;
      }
    });
  }

  /**
   * Load the current user's appeals and populate `appealStatuses` map.
   */
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

  /**
   * Map numeric/boolean approval values to human-readable appeal status.
   * @param is_approved - Approval value (true/false or 1/0)
   * @returns 'Approved' | 'Denied' | 'Pending'
   */
  private mapStatus(is_approved: any): string {
    if (is_approved === true  || is_approved === 1)  return 'Approved';
    if (is_approved === false || is_approved === 0)  return 'Denied';
    return 'Pending';
  }

  /**
   * Get CSS class for appeal status for a schedule block.
   * @param day - Day of week for the block.
   * @param slotIndex - Index of the time slot.
   * @returns CSS class string for the appeal status, or empty string.
   */
  getAppealStatusClass(day: string, slotIndex: number): string {
    const block = this.getScheduleBlock(day, slotIndex);
    if (!block) return '';
    const status = this.appealStatuses.get(block.scheduleId);
    if (!status) return 'no-appeal';
    return `appeal-${status.toLowerCase()}`;
  }

  /**
   * Get tooltip text for appeal status.
   * @param day - Day of week.
   * @param slotIndex - Index of the slot.
   * @returns Tooltip text.
   */
  getAppealStatusTooltip(day: string, slotIndex: number): string {
    return 'Appeal History';
  }

  /**
   * Build the `timeSlots` array with 30-minute intervals from 07:00 to 21:00.
   */
  private generateTimeSlots() {
    const startTime = 7 * 60;
    const endTime = 21 * 60;
    const interval = 30;
    for (let time = startTime; time <= endTime; time += interval) {
      this.timeSlots.push({
        time: this.formatMinutesTo12Hour(time), minutes: time
      });
    }
  }

  /**
   * Convert `facultySchedule.schedules` into `scheduleBlocks` for timeline rendering.
   * Validates records and merges bridging entries.
   */
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

  /**
   * Convert a time string (HH:MM[:ss]) to minutes since midnight.
   * Returns 0 on null/invalid input.
   * @param time - Time string like '10:30:00' or null.
   * @returns Minutes since midnight.
   */
  private convertTimeToMinutes(time: string | null): number {
    if (!time) return 0;
    const parts = time.split(':').map(Number);
    if (parts.length < 2) return 0;
    const [hours, minutes] = parts;
    return hours * 60 + minutes;
  }

  /**
   * Find the index of the first `timeSlots` entry whose minutes >= provided minutes.
   * @param minutes - Minutes since midnight to find.
   * @returns Index into `timeSlots`, or -1 if none found.
   */
  private findTimeSlotIndex(minutes: number): number {
    return this.timeSlots.findIndex(slot => slot.minutes >= minutes);
  }

  /**
   * Check whether a schedule block starts at the given day/slot.
   * @param day - Day of week.
   * @param slotIndex - Slot index.
   * @returns True if a block starts at this slot.
   */
  isScheduleBlockStart(day: string, slotIndex: number): boolean {
    return this.scheduleBlocks.some(b => b.day === day && slotIndex === b.startSlot);
  }

  /**
   * Compute rendered block height in pixels for a schedule block.
   * @param day - Day of week.
   * @param slotIndex - Slot index.
   * @returns Block height in pixels (0 when none).
   */
  getScheduleBlockHeight(day: string, slotIndex: number): number {
    const block = this.getScheduleBlock(day, slotIndex);
    return block ? block.duration * 40 - 2 : 0;
  }

  /**
   * Build inline style object for a schedule block.
   * @param day - Day of week.
   * @param slotIndex - Slot index.
   * @returns Style object for the block element.
   */
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

  /**
   * Return CSS class for a day column.
   * @param day - Day of week.
   * @returns Day class string.
   */
  getDayClass(day: string): string { return `schedule-${day.toLowerCase()}`; }

  /**
   * Return a property value from a schedule block at the given day/slot.
   * @param day - Day of week.
   * @param slotIndex - Slot index.
   * @param property - Block property name to retrieve.
   * @returns The property value or null.
   */
  getBlockProperty(day: string, slotIndex: number, property: keyof ScheduleBlock): any {
    const block = this.getScheduleBlock(day, slotIndex);
    return block ? block[property] : null;
  }

  /**
   * Get formatted time range for the block shown at a specific slot.
   * @param day - Day of week.
   * @param slotIndex - Slot index.
   * @returns Formatted time string like '10:30 AM - 12:30 PM' or empty string.
   */
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

  /**
   * Return color settings for a given day column.
   * @param day - Day of week.
   * @returns Object with `backgroundColor` and `borderColor`.
   */
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

  /**
   * Format minutes-since-midnight into 12-hour time label.
   * @param minutes - Minutes since midnight.
   * @returns Formatted time like '7:00 AM'.
   */
  private formatMinutesTo12Hour(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins  = minutes % 60;
    const ampm  = hours >= 12 ? 'PM' : 'AM';
    const h     = hours % 12 || 12;
    return `${h}:${mins.toString().padStart(2, '0')} ${ampm}`;
  }

  /**
   * Format a time string (HH:MM[:ss]) into 12-hour display.
   * @param time - Time string like '10:30:00'.
   * @returns Formatted time like '10:30 AM'.
   */
  private formatTimeTo12Hour(time: string): string {
    let [hours, minutes] = time.split(':').map(Number);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${hours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  }

  /**
   * Find a schedule block that contains the specified slot.
   * @param day - Day of week.
   * @param slotIndex - Slot index.
   * @returns The `ScheduleBlock` or undefined.
   */
  private getScheduleBlock(
    day: string, slotIndex: number
  ): ScheduleBlock | undefined {
    return this.scheduleBlocks.find(
      b => b.day === day && slotIndex >= b.startSlot && 
        slotIndex < b.startSlot + b.duration,
    );
  }

  /**
   * Retrieve the raw schedule object (original API entry) for a displayed block.
   * @param day - Day of week.
   * @param slotIndex - Slot index.
   * @returns Raw schedule object or null.
   */
  getRawSchedule(day: string, slotIndex: number): any {
    const block = this.getScheduleBlock(day, slotIndex);
    if (!block) return null;
    return this.facultySchedule.schedules.find((s: any) => s.schedule_id === block.scheduleId);
  }

  /**
   * Emit edit/appeal event for a schedule block.
   * @param day - Day of week.
   * @param slotIndex - Slot index.
   * @param event - DOM event (click).
   */
  onEditScheduleBlock(day: string, slotIndex: number, event: Event) {
    event.stopPropagation();
    const raw = this.getRawSchedule(day, slotIndex);
    if (raw) {
      this.appealClicked.emit(raw);
    }
  }

  /**
   * Emit view-appeals event for a schedule block.
   * @param day - Day of week.
   * @param slotIndex - Slot index.
   * @param event - DOM event.
   */
  onViewMyAppeals(day: string, slotIndex: number, event: Event) {
    event.stopPropagation();
    const raw = this.getRawSchedule(day, slotIndex);
    if (raw) {
      this.viewAppealsClicked.emit(raw);
    }
  }

  /**
   * Open export dialog to generate PDF of the current schedule view.
   */
  onExportPdf() {
    if (!this.facultySchedule || !this.facultySchedule.schedules) return;

    const facultyName = this.facultySchedule.faculty_name || 'Faculty';
    const viewType = this.exportMode === 'internal' ? 'Internal Arrangement' : 'Official Schedule';

    this.dialog.open(DialogExportComponent, {
      width: '90vw',
      maxWidth: '1200px',
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

  /**
   * Generate a PDF Blob containing the schedule for the current faculty view.
   * @returns Promise resolving to a PDF `Blob`.
   */
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

  /**
   * Draw the schedule grid into the provided jsPDF document.
   * @param doc - jsPDF document instance.
   * @param scheduleData - Array of schedule items from API.
   * @param title - Document title.
   * @param subtitle - Document subtitle.
   * @param startY - Starting Y position on the page.
   * @param margin - Page margin in mm.
   * @param pageWidth - Page width in mm.
   */
  private drawScheduleGrid(
    doc: jsPDF, scheduleData: any[], title: string, subtitle: string,
    startY: number, margin: number, pageWidth: number
  ): void {
    if (!scheduleData || scheduleData.length === 0) return;

    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const timeColWidth = 22;
    const dayColumnWidth = (pageWidth - margin * 2 - timeColWidth) / days.length;
    
    const rowHeight = 8.5; 

    const chunks = [
      { name: 'Morning (7:30 AM - 2:00 PM)', start: 450, end: 840 },
      { name: 'Afternoon (2:00 PM - 9:00 PM)', start: 840, end: 1260 }
    ];

    const activeChunks = chunks.filter(chunk => {
      return scheduleData.some(s => {
        if (!s.start_time || !s.end_time || !s.day) return false;
        const sStart = this.convertTimeToMinutes(s.start_time);
        const sEnd = this.convertTimeToMinutes(s.end_time);
        return Math.max(sStart, chunk.start) < Math.min(sEnd, chunk.end);
      });
    });

    if (activeChunks.length === 0) {
      doc.setFontSize(20);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(128, 128, 128);
      doc.text('No Assigned Schedule', pageWidth / 2, startY + 50, { align: 'center' });
      return;
    }

    let pageUsed = false;
    let currentY = startY;

    activeChunks.forEach(chunk => {
      if (pageUsed) {
        this.reportHeaderService.addStandardFooter(doc);
        doc.addPage();
        currentY = 15;
        this.reportHeaderService.addHeader(doc, title, currentY, subtitle)
          .subscribe((newY: number) => { currentY = newY; });
      }
      
      pageUsed = true;
      currentY -= 3;

      // --- 1. DRAW HEADERS (TWO ROWS) ---
      const headerHeight = 7;
      const subHeaderHeight = 5;
      const totalHeaderHeight = headerHeight + subHeaderHeight;

      doc.setFillColor(128, 0, 0);
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.5);
      doc.rect(margin, currentY, timeColWidth, totalHeaderHeight, 'FD');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Time', margin + timeColWidth / 2, currentY + (totalHeaderHeight / 2) + 1.5, { align: 'center' });

      days.forEach((day, index) => {
        const xPos = margin + timeColWidth + index * dayColumnWidth;
        const subjColWidth = dayColumnWidth * 0.7;
        const roomColWidth = dayColumnWidth * 0.3;

        // Top Row: Day Name
        doc.setFillColor(128, 0, 0);
        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(0.5);
        doc.rect(xPos, currentY, dayColumnWidth, headerHeight, 'FD');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(day, xPos + dayColumnWidth / 2, currentY + 4.5, { align: 'center' });

        // Bottom Row: Subject Sub-header
        doc.setFillColor(160, 20, 20);
        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(0.4);
        doc.rect(xPos, currentY + headerHeight, subjColWidth, subHeaderHeight, 'FD');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.text('Subject', xPos + subjColWidth / 2, currentY + headerHeight + 3.5, { align: 'center' });

        // Bottom Row: Room Sub-header
        doc.setFillColor(160, 20, 20);
        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(0.4);
        doc.rect(xPos + subjColWidth, currentY + headerHeight, roomColWidth, subHeaderHeight, 'FD');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(7.5);
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

      // --- 3. MERGE BLOCKS ---
      const mergedMap = new Map<string, any>();
      for (const item of scheduleData) {
        if (!item.start_time || !item.end_time || !item.day) continue;
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

      const sortedScheduleData = [...mergedMap.values()].sort(
        (a, b) => this.convertTimeToMinutes(a.start_time) - this.convertTimeToMinutes(b.start_time)
      );

      // --- PASS 1: Draw all block backgrounds ---
      sortedScheduleData.forEach(item => {
        const dayIndex = days.indexOf(item.day);
        if (dayIndex === -1) return;

        const cappedStart = Math.max(this.convertTimeToMinutes(item.start_time), chunk.start);
        const cappedEnd = Math.min(this.convertTimeToMinutes(item.end_time), chunk.end);
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

        const cappedStart = Math.max(this.convertTimeToMinutes(item.start_time), chunk.start);
        const cappedEnd = Math.min(this.convertTimeToMinutes(item.end_time), chunk.end);
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
        const roomFontSize = 7.0;

        // Build program display
        let programDisplay: string;
        if (item._mergedPrograms && item._mergedPrograms.length > 1) {
          programDisplay = item._mergedPrograms.sort().reverse().join('/') + ` ${item.year_level} - ${item.section_name}`;
        } else {
          programDisplay = `${item.program_code} ${item.year_level} - ${item.section_name}`;
        }

        // Format time range
        const formatTime = (minutes: number): string => {
          const h = Math.floor(minutes / 60);
          const m = minutes % 60;
          const suffix = h >= 12 ? 'PM' : 'AM';
          const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
          return `${displayH}:${m.toString().padStart(2, '0')} ${suffix}`;
        };
        const originalStart = this.convertTimeToMinutes(item.start_time);
        const originalEnd = this.convertTimeToMinutes(item.end_time);
        const timeRange = `${formatTime(originalStart)} - ${formatTime(originalEnd)}`;

        const content = [
          item.course_details?.course_code || '',
          item.course_details?.course_title || '',
          programDisplay,
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
          doc.setTextColor(idx === content.length - 1 ? 128 : 0, 0, 0);

          const wrappedLines = doc.splitTextToSize(line, subjColWidth - 4);
          wrappedLines.forEach((wLine: string) => {
            if (subjectStartY <= maxBottomBoundary) {
              doc.text(wLine, xPos + subjColWidth / 2, subjectStartY, { align: 'center', baseline: 'middle' });
            }
            subjectStartY += lineSpacing;
          });
        });

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

  /**
   * Draw header asynchronously via `ReportHeaderService` 
   * and return resolved Y coordinate.
   * @param doc - jsPDF document instance.
   * @param startY - Starting Y position.
   * @param title - Header title.
   * @param subtitle - Header subtitle.
   * @returns Promise resolving to the new Y position after drawing header.
   */
  private drawHeaderAsync(
    doc: jsPDF, startY: number, title: string, subtitle: string
  ): Promise<number> {

    return new Promise((resolve) => {
      this.reportHeaderService.addHeader(
        doc, title, startY, subtitle
      ).subscribe({
        next: (newY) => resolve(newY),
        error: () => resolve(startY + 30)
      });
    });
  }

  /**
   * Format numeric semester into human readable string.
   * @param semester - Semester number.
   * @returns Formatted semester string (e.g. '1st Semester').
   */
  private formatSemester(semester: number): string {
    switch (semester) { 
      case 1: return '1st Semester'; 
      case 2: return '2nd Semester'; 
      case 3: return 'Summer Semester'; 
      default: return `${semester}`; 
    }
  }

  /**
   * Generate default file name for exported schedule PDF.
   * @returns Filename string.
   */
  private generateFileName(): string {
    const formattedName  = this.facultySchedule.faculty_name.replace(',', '').replace(/\s+/g, '_');
    const academicYear   = `${this.facultySchedule.year_start}-${this.facultySchedule.year_end}`;
    const semester       = this.formatSemester(this.facultySchedule.semester).replace(/\s+/g, '_');
    const type = this.exportMode === 'internal' ? 'Internal_Arrangement' : 'Official_Schedule';
    return `${formattedName}_${type}_${academicYear}_${semester}`;
  }

}
import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  SimpleChanges,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatButtonToggleModule } from '@angular/forms';
import { MatButtonToggleModule as MatToggleModule } from '@angular/material/button-toggle';
import { FormsModule } from '@angular/forms';
import {
  ReschedulingService
} from '../../core/services/faculty/rescheduling/rescheduling.service';

interface MobileSchedule {
  scheduleId: number;
  day: string;
  startTime: string;
  endTime: string;
  startTimeRaw: string;
  courseCode: string;
  courseTitle: string;
  roomCode: string;
  program: string;
  isBridging: boolean;
  raw: any;
}

type Day = 'Monday' |
  'Tuesday' |
  'Wednesday' |
  'Thursday' |
  'Friday' |
  'Saturday' |
  'Sunday';

@Component({
  selector: 'app-faculty-schedule-mobile',
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatToggleModule
  ],
  templateUrl: './faculty-schedule-mobile.component.html',
  styleUrl: './faculty-schedule-mobile.component.scss'
})
export class FacultyScheduleMobileComponent implements OnInit, OnChanges {
  @Input() facultySchedule: any;
  @Input() showAppealButtons: boolean = false;

  @Output() appealClicked = new EventEmitter<any>();
  @Output() viewAppealsClicked = new EventEmitter<any>();

  viewType: 'accordion' | 'table' = 'accordion';
  days: Day[] = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday'
  ];

  scheduleBlocks: MobileSchedule[] = [];
  groupedSchedules: { [key: string]: MobileSchedule[] } = {};
  expandedDays: { [key: string]: boolean } = {};
  appealStatuses: Map<number, string> = new Map();

  private reschedulingService = inject(ReschedulingService);

  // Initialize the component
  ngOnInit() {
    this.processScheduleData();
    if (this.showAppealButtons) {
      this.loadMyAppeals();
    }
  }

  // Detect input changes and re-process schedules
  ngOnChanges(changes: SimpleChanges) {
    if (changes['facultySchedule'] && !changes['facultySchedule'].firstChange) {
      this.scheduleBlocks = [];
      this.processScheduleData();
    }
  }

  // Load active appeals status mapping
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

  // Toggle view state between accordion and table
  onViewChange(value: 'accordion' | 'table') {
    this.viewType = value;
  }

  // Toggle open/collapsed state of a day card accordion
  toggleDay(day: string) {
    this.expandedDays[day] = !this.expandedDays[day];
  }

  // Return appeal status class name
  getAppealStatusClass(block: MobileSchedule): string {
    const status = this.appealStatuses.get(block.scheduleId);
    if (!status) return 'no-appeal';
    return `appeal-${status.toLowerCase()}`;
  }

  // Return CSS class for a day column
  getDayClass(day: string): string {
    return `schedule-${day.toLowerCase()}`;
  }

  // Process input schedules into mapped MobileSchedule blocks
  private processScheduleData() {
    if (!this.facultySchedule || !this.facultySchedule.schedules) {
      return;
    }

    const mergedMap = new Map<string, any>();
    for (const schedule of this.facultySchedule.schedules) {
      const key = `${schedule.day}|${schedule.start_time}|${schedule.end_time}`;
      if (mergedMap.has(key)) {
        const existing = mergedMap.get(key);
        if (!existing._mergedPrograms) {
          existing._mergedPrograms = [existing.program_code];
        }
        if (!existing._mergedPrograms.includes(schedule.program_code)) {
          existing._mergedPrograms.push(schedule.program_code);
        }
      } else {
        mergedMap.set(key, { ...schedule });
      }
    }

    this.scheduleBlocks = [...mergedMap.values()].map((schedule: any) => {
      if (!schedule.start_time ||
          !schedule.end_time ||
          !schedule.course_details) {
        return null;
      }

      let programDisplay: string;
      if (schedule._mergedPrograms && schedule._mergedPrograms.length > 1) {
        programDisplay = schedule._mergedPrograms.sort().reverse().join('/') +
          ` ${schedule.year_level}-${schedule.section_name}`;
      } else {
        programDisplay = `${schedule.program_code} ` +
          `${schedule.year_level}-${schedule.section_name}`;
      }

      return {
        scheduleId: schedule.schedule_id,
        day: schedule.day,
        startTime: this.formatTimeTo12Hour(schedule.start_time),
        endTime: this.formatTimeTo12Hour(schedule.end_time),
        startTimeRaw: schedule.start_time,
        courseCode: schedule.course_details.course_code,
        courseTitle: schedule.course_details.course_title,
        roomCode: schedule.room_code,
        program: programDisplay,
        isBridging: schedule.course_details?.offering_type === 'bridging',
        raw: schedule
      };
    }).filter((block): block is MobileSchedule => block !== null);

    const dayOrder: { [key: string]: number } = {
      'Monday': 0,
      'Tuesday': 1,
      'Wednesday': 2,
      'Thursday': 3,
      'Friday': 4,
      'Saturday': 5,
      'Sunday': 6
    };

    // Sort blocks by day and start time
    this.scheduleBlocks.sort((a, b) => {
      const dayDiff = (dayOrder[a.day] ?? 0) - (dayOrder[b.day] ?? 0);
      if (dayDiff !== 0) {
        return dayDiff;
      }
      const aMin = this.convertTimeToMinutes(a.startTimeRaw);
      const bMin = this.convertTimeToMinutes(b.startTimeRaw);
      return aMin - bMin;
    });

    // Group items by day
    this.groupedSchedules = {};
    this.days.forEach(d => {
      this.groupedSchedules[d] = this.scheduleBlocks.filter(b => b.day === d);
      // Auto expand days that have classes
      if (this.groupedSchedules[d].length > 0) {
        this.expandedDays[d] = true;
      }
    });
  }

  // Convert time string (HH:MM:SS) to minutes
  private convertTimeToMinutes(time: string | null): number {
    if (!time) return 0;
    const parts = time.split(':').map(Number);
    if (parts.length < 2) return 0;
    const [hours, minutes] = parts;
    return hours * 60 + minutes;
  }

  // Format time string to 12-hour display format
  private formatTimeTo12Hour(time: string): string {
    let [hours, minutes] = time.split(':').map(Number);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${hours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  }

  // Map approval value to status text
  private mapStatus(is_approved: any): string {
    if (is_approved === true || is_approved === 1) return 'Approved';
    if (is_approved === false || is_approved === 0) return 'Denied';
    return 'Pending';
  }

  // Emit appeal dialog click event
  onEditScheduleBlock(block: MobileSchedule, event: Event) {
    event.stopPropagation();
    this.appealClicked.emit(block.raw);
  }

  // Emit view appeals log dialog click event
  onViewMyAppeals(block: MobileSchedule, event: Event) {
    event.stopPropagation();
    this.viewAppealsClicked.emit(block.raw);
  }
}

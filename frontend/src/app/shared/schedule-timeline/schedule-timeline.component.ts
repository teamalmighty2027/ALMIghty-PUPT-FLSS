import {
  Component,
  Input,
  OnInit,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ScheduleValidationService } from '../../core/services/admin/scheduling/schedule-validation.service';

interface TimeSlot {
  time: string;
  minutes: number;
}

// Step 1: Extended ScheduleBlock with program tracking.
interface ScheduleBlock {
  day: string;
  startSlot: number;
  duration: number;
  courseCode: string;
  courseTitle: string;
  roomCode: string;
  facultyName: string;
  program: string;
  programId?: number;
  yearLevel: number;
  section: string;
  offeringType?: string;
  startTimeStr?: string;
  endTimeStr?: string;
  facultyId?: number;
  roomId?: number;
  combinedLabel?: string;
  combinedWithProgramId?: number | null;
  isTimePlot?: boolean;
  timePlotType?: 'night_service' | 'official_time' | 'advising_time';
}

interface TimePlotBlock extends ScheduleBlock {
  isTimePlot: boolean;
  timePlotType: 'night_service' | 'official_time' | 'advising_time';
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
  selector: 'app-schedule-timeline',
  imports: [CommonModule],
  templateUrl: './schedule-timeline.component.html',
  styleUrls: ['./schedule-timeline.component.scss'],
})
export class ScheduleTimelineComponent implements OnInit, OnChanges {
  @Input() scheduleData: any;
  @Input() entity!: string;
  @Input() timePlots: any[] = [];

  days: Day[] = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ];
  timeSlots: TimeSlot[] = [];
  scheduleBlocks: ScheduleBlock[] = [];

  // Step 3: Injected ScheduleValidationService.
  constructor(private scheduleValidationService: ScheduleValidationService) {}

  ngOnInit() {
    this.generateTimeSlots();
    this.processScheduleData();
    this.processTimePlots();
    this.detectCombinedSchedules();
  }

  // Handle input changes and reinitialize.
  ngOnChanges(changes: SimpleChanges) {
    if (changes['scheduleData'] || changes['timePlots']) {
      if (this.timeSlots.length === 0) {
        this.generateTimeSlots();
      }
      this.scheduleBlocks = [];
      this.processScheduleData();
      this.processTimePlots();
      this.detectCombinedSchedules();
    }
  }


  private generateTimeSlots() {
    this.timeSlots = [];
    const startTime = 7 * 60;
    const endTime = 21 * 60;
    const interval = 30;

    for (let time = startTime; time <= endTime; time += interval) {
      const formattedTime = this.formatMinutesTo12Hour(time);
      this.timeSlots.push({ time: formattedTime, minutes: time });
    }
  }


  private processScheduleData() {
    if (Array.isArray(this.scheduleData) && this.scheduleData.length > 0) {
      this.scheduleData.forEach((schedule: any) => {
        if (schedule.start_time && schedule.end_time) {
          const startTime = this.convertTimeToMinutes(
            schedule.start_time
          );
          const endTime = this.convertTimeToMinutes(schedule.end_time);
          const startSlot = this.findTimeSlotIndex(startTime);
          const duration = Math.ceil((endTime - startTime) / 30);
          const adjustedDuration =
            (endTime - startTime) % 30 === 0 ? duration + 1 : duration;

          this.scheduleBlocks.push({
            day: schedule.day,
            startSlot: startSlot,
            duration: adjustedDuration,
            courseCode: schedule.course_details.course_code,
            courseTitle: schedule.course_details.course_title,
            roomCode: schedule.room_code,
            facultyName: schedule.faculty_name,
            program: schedule.program_code,
            programId: schedule.program_id,
            yearLevel: schedule.year_level,
            section: schedule.section_name,
            offeringType: schedule.course_details.offering_type,
            startTimeStr: schedule.start_time,
            endTimeStr: schedule.end_time,
            facultyId: schedule.faculty_id,
            roomId: schedule.room?.room_id || null,
            combinedWithProgramId: schedule.combined_with_program_id || null,
          });
        } else {
          return;
        }
      });
    } else {
      console.warn(
        'No schedules found or invalid data structure:',
        this.scheduleData
      );
    }
  }

  // Step 2: Detect exact matches and assign combined labels.
  private detectCombinedSchedules(): void {
    // Group blocks by (day, startSlot, endSlot, facultyId, roomId)
    const groupKey = new Map<
      string,
      { blocks: ScheduleBlock[]; programs: Set<string> }
    >();

    this.scheduleBlocks.forEach((block) => {
      const key = `${block.day}|${block.startSlot}|${
        block.startSlot + block.duration
      }|${block.facultyId || 'null'}|${block.roomId || 'null'}`;

      if (!groupKey.has(key)) {
        groupKey.set(key, { blocks: [], programs: new Set() });
      }

      const group = groupKey.get(key)!;
      group.blocks.push(block);
      group.programs.add(block.program);
    });

    // For groups with 2+ different programs, assign combined label.
    groupKey.forEach((group) => {
      if (group.programs.size >= 2) {
        const programArray = Array.from(group.programs);
        const [codeA, codeB] = programArray.slice(0, 2);
        const combinedLabel =
          this.scheduleValidationService.buildCombinedLabel(
            codeA,
            codeB
          );

        group.blocks.forEach((block) => {
          block.combinedLabel = combinedLabel;
          // Store reference to other program
          if (block.program !== codeA) {
            block.combinedWithProgramId = this.getProgamIdByCode(
              codeA
            );
          } else {
            block.combinedWithProgramId = this.getProgamIdByCode(
              codeB
            );
          }
        });
      }
    });
  }

  // Helper to get program ID by code.
  private getProgamIdByCode(programCode: string): number | null {
    const block = this.scheduleBlocks.find(
      (b) => b.program === programCode
    );
    return block?.programId || null;
  }

  private convertTimeToMinutes(time: string): number {
    if (!time) {
      return 0;
    }
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private findTimeSlotIndex(minutes: number): number {
    return this.timeSlots.findIndex((slot) => slot.minutes >= minutes);
  }

  isScheduleBlockStart(day: string, slotIndex: number): boolean {
    return this.scheduleBlocks.some(
      (b) => b.day === day && slotIndex === b.startSlot
    );
  }

  getScheduleBlockHeight(day: string, slotIndex: number): number {
    const block = this.getScheduleBlock(day, slotIndex);
    return block ? block.duration * 26 - 2 : 0;
  }

  getScheduleBlockStyle(day: string, slotIndex: number): any {
    const block = this.getScheduleBlock(day, slotIndex);
    if (block) {
      let backgroundColor = '';
      let borderColor = '';

      if (block.isTimePlot) {
        if (block.timePlotType === 'night_service') {
          backgroundColor = '#e3f2fd';
          borderColor = '#1565c0';
        } else if (block.timePlotType === 'official_time') {
          backgroundColor = '#fff3e0';
          borderColor = '#e65100';
        } else {
          backgroundColor = '#f3f5fd';
          borderColor = '#4a148c';
        }
      } else {
        const colors = this.getBlockColors(day as Day);
        backgroundColor = colors.backgroundColor;
        borderColor = colors.borderColor;
      }

      const baseStyle = {
        'background-color': backgroundColor,
        'border-left': `1px solid ${borderColor}`,
        'border-right': `1px solid ${borderColor}`,
        'color': block.isTimePlot ? borderColor : 'inherit'
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


  getDayClass(day: string): string {
    return `schedule-${day.toLowerCase()}`;
  }

  getBlockProperty(
    day: string,
    slotIndex: number,
    property: keyof ScheduleBlock
  ): any {
    const block = this.getScheduleBlock(day, slotIndex);
    return block ? block[property] : null;
  }

  getFormattedTime(day: string, slotIndex: number): string {
    const block = this.getScheduleBlock(day, slotIndex);
    if (block) {
      const schedule = this.scheduleData.find(
        (s: any) =>
          s.day === day &&
          this.convertTimeToMinutes(s.start_time) ===
            this.timeSlots[slotIndex].minutes
      );
      if (schedule) {
        return `${this.formatTimeTo12Hour(
          schedule.start_time
        )} - ${this.formatTimeTo12Hour(schedule.end_time)}`;
      }
    }
    return '';
  }

  private getBlockColors(day: Day) {
    const dayColors: Record<
      Day,
      { backgroundColor: string; borderColor: string }
    > = {
      Monday: {
        backgroundColor: 'var(--primary-fade)',
        borderColor: 'var(--primary-text)',
      },
      Tuesday: {
        backgroundColor: 'var(--secondary-fade)',
        borderColor: 'var(--secondary-text)',
      },
      Wednesday: {
        backgroundColor: 'var(--blue-fade)',
        borderColor: 'var(--blue-primary)',
      },
      Thursday: {
        backgroundColor: 'var(--aqua-fade)',
        borderColor: 'var(--aqua-primary)',
      },
      Friday: {
        backgroundColor: 'var(--purple-fade)',
        borderColor: 'var(--purple-primary)',
      },
      Saturday: {
        backgroundColor: 'var(--green-fade)',
        borderColor: 'var(--green-primary)',
      },
      Sunday: {
        backgroundColor: 'var(--primary-fade)',
        borderColor: 'var(--primary-text)',
      },
    };
    return dayColors[day];
  }

  private formatMinutesTo12Hour(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const formattedHours = hours % 12 || 12;
    return `${formattedHours}:${mins.toString().padStart(2, '0')} ${ampm}`;
  }

  private formatTimeTo12Hour(time: string): string {
    let [hours, minutes] = time.split(':').map(Number);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${hours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  }

  private getScheduleBlock(
    day: string,
    slotIndex: number
  ): ScheduleBlock | undefined {
    return this.scheduleBlocks.find(
      (b) =>
        b.day === day &&
        slotIndex >= b.startSlot &&
        slotIndex < b.startSlot + b.duration
    );
  }

  private processTimePlots(): void {
    if (this.timePlots && Array.isArray(this.timePlots)) {
      this.timePlots.forEach(plot => {
        if (plot.start_time && plot.end_time) {
          const startTime = this.convertTimeToMinutes(
            plot.start_time.substring(0, 5)
          );
          const endTime = this.convertTimeToMinutes(
            plot.end_time.substring(0, 5)
          );
          const startSlot = this.findTimeSlotIndex(startTime);
          const duration = Math.ceil((endTime - startTime) / 30);
          const adjustedDuration = (endTime - startTime) % 30 === 0
            ? duration + 1
            : duration;

          let displayTitle = '';
          if (plot.time_type === 'night_service') {
            displayTitle = 'Night Service';
          } else if (plot.time_type === 'official_time') {
            displayTitle = 'Official Time';
          } else {
            displayTitle = 'Advising Time';
          }

          this.scheduleBlocks.push({
            day: plot.day,
            startSlot: startSlot,
            duration: adjustedDuration,
            courseCode: displayTitle.toUpperCase(),
            courseTitle: `${this.formatTimeTo12Hour(plot.start_time)} - ` +
                         `${this.formatTimeTo12Hour(plot.end_time)}`,
            roomCode: '',
            facultyName: '',
            program: '',
            yearLevel: 0,
            section: '',
            offeringType: undefined,
            startTimeStr: plot.start_time,
            endTimeStr: plot.end_time,
            isTimePlot: true,
            timePlotType: plot.time_type
          } as any);
        }
      });
    }
  }
}


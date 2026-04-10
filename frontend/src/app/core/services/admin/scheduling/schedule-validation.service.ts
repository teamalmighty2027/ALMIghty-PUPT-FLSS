import { Injectable } from '@angular/core';

import {
  PopulateSchedulesResponse,
  CourseResponse,
  Room,
  ConflictingCourseDetail,
  ConflictingScheduleDetail,
  ScheduleArrangementOverride,
} from '../../../models/scheduling.model';

@Injectable({
  providedIn: 'root',
})
export class ScheduleValidationService {
  constructor() {}

  /**
   * Validates schedule conflicts based on provided parameters.
   * @returns An object indicating whether conflicts exist and the messages.
   */
  public validateScheduleConflicts(
    schedules: PopulateSchedulesResponse,
    rooms: { rooms: Room[] },
    params: {
      schedule_id: number;
      program_id: number;
      year_level: number;
      day: string;
      start_time: string;
      end_time: string;
      section_id: number;
      faculty_id: number | null;
      room_id: number | null;
    }
  ): { hasConflicts: boolean; messages: string[] } {
    const conflicts: string[] = [];

    // Check program overlap
    const programOverlap = this.checkProgramTimeOverlap(
      schedules,
      params.program_id,
      params.year_level,
      params.day,
      params.start_time,
      params.end_time,
      params.schedule_id,
      params.section_id
    );
    if (!programOverlap.isValid) conflicts.push(programOverlap.message);

    // Check faculty availability
    if (params.faculty_id) {
      const facultyAvailability = this.checkFacultyAvailability(
        params.faculty_id,
        params.day,
        params.start_time,
        params.end_time,
        schedules,
        params.schedule_id
      );
      if (!facultyAvailability.isValid)
        conflicts.push(facultyAvailability.message);
    }

    // Check room availability
    if (params.room_id) {
      const roomAvailability = this.checkRoomAvailability(
        params.room_id,
        params.day,
        params.start_time,
        params.end_time,
        schedules,
        rooms,
        params.schedule_id
      );
      if (!roomAvailability.isValid) conflicts.push(roomAvailability.message);
    }
  
    // Check course hours against selected time range
    if (params.start_time && params.end_time) {
      const courseHoursValidation = this.validateCourseHours(
        schedules,
        params.schedule_id,
        params.start_time,
        params.end_time
      );
      if (!courseHoursValidation.isValid) {
        conflicts.push(courseHoursValidation.message);
      }
    }

    return { hasConflicts: conflicts.length > 0, messages: conflicts };
  }

  /**
   * Validates schedule conflicts using a merged view of schedules + arrangements.
   */
  public validateScheduleConflictsWithArrangements(
    schedules: PopulateSchedulesResponse,
    rooms: { rooms: Room[] },
    arrangements: ScheduleArrangementOverride[],
    params: {
      schedule_id: number;
      program_id: number;
      year_level: number;
      day: string;
      start_time: string;
      end_time: string;
      section_id: number;
      faculty_id: number | null;
      room_id: number | null;
    }
  ): { hasConflicts: boolean; messages: string[] } {
    const mergedSchedules = this.mergeSchedulesWithArrangements(
      schedules,
      rooms,
      arrangements
    );

    return this.validateScheduleConflicts(mergedSchedules, rooms, params);
  }

  /**
   * Checks for time overlaps within a program.
   * @returns An object indicating whether a program time is valid and a message.
   */
  private checkProgramTimeOverlap(
    schedules: PopulateSchedulesResponse,
    program_id: number,
    year_level: number,
    day: string,
    start_time: string,
    end_time: string,
    currentScheduleId: number,
    section_id: number
  ): { isValid: boolean; message: string } {
    if (!program_id || !year_level || !day || !start_time || !end_time) {
      return { isValid: true, message: 'Program overlap check skipped' };
    }

    const conflictingDetail = this.findConflictingCourseWithinProgram(
      schedules,
      program_id,
      year_level,
      day,
      start_time,
      end_time,
      currentScheduleId,
      section_id
    );

    if (conflictingDetail) {
      const { course, sectionName } = conflictingDetail;
      const program = schedules.programs.find(
        (p) => p.program_id === program_id
      );
      const programCode = program?.program_code || 'Unknown Program';
      return {
        isValid: false,
        message: `${programCode} ${year_level}-${sectionName} is already scheduled for ${
          course.course_code
        } (${course.course_title}) on ${day} from ${this.formatTimeForDisplay(
          course.schedule?.start_time || ''
        )} to ${this.formatTimeForDisplay(course.schedule?.end_time || '')}.`,
      };
    }

    return { isValid: true, message: 'No program overlap detected' };
  }

  /**
   * Checks the availability of a faculty member.
   * @returns An object indicating whether a faculty is available and a message.
   */
  private checkFacultyAvailability(
    faculty_id: number,
    day: string,
    start_time: string,
    end_time: string,
    schedules: PopulateSchedulesResponse,
    currentScheduleId: number
  ): { isValid: boolean; message: string } {
    if (!faculty_id || !day || !start_time || !end_time) {
      return { isValid: true, message: 'Faculty availability check skipped' };
    }

    const conflictingDetail = this.findConflictingScheduleForPredicate(
      schedules,
      (course) =>
        course.faculty_id === faculty_id &&
        course.schedule?.day === day &&
        course.schedule.schedule_id !== currentScheduleId &&
        this.doTimesOverlap(
          start_time,
          end_time,
          course.schedule.start_time,
          course.schedule.end_time
        )
    );

    if (conflictingDetail) {
      const { course, programCode, yearLevel, sectionName } = conflictingDetail;
      return {
        isValid: false,
        message: `${course.professor} is already assigned to ${
          course.course_code
        } (${
          course.course_title
        }) for ${programCode} ${yearLevel}-${sectionName} on ${day} from ${this.formatTimeForDisplay(
          course.schedule?.start_time || ''
        )} to ${this.formatTimeForDisplay(course.schedule?.end_time || '')}.`,
      };
    }

    return { isValid: true, message: 'Faculty is available' };
  }

  /**
   * Checks the availability of a room.
   * @returns An object indicating whether a room is available and a message.
   */
  private checkRoomAvailability(
    room_id: number,
    day: string,
    start_time: string,
    end_time: string,
    schedules: PopulateSchedulesResponse,
    rooms: { rooms: Room[] },
    currentScheduleId: number
  ): { isValid: boolean; message: string } {
    if (!room_id || !day || !start_time || !end_time) {
      return { isValid: true, message: 'Room availability check skipped' };
    }

    const room = rooms.rooms.find((r) => r.room_id === room_id);
    if (!room) {
      return { isValid: false, message: 'Invalid room selected' };
    }

    const conflictingDetail = this.findConflictingScheduleForPredicate(
      schedules,
      (course) =>
        (course.schedule?.room_id === room_id ||
          course.room?.room_id === room_id) &&
        course.schedule?.day === day &&
        course.schedule.schedule_id !== currentScheduleId &&
        this.doTimesOverlap(
          start_time,
          end_time,
          course.schedule?.start_time,
          course.schedule?.end_time
        )
    );

    if (conflictingDetail) {
      const { course, programCode, yearLevel, sectionName } = conflictingDetail;
      return {
        isValid: false,
        message: `Room ${room.room_code} is already booked for ${
          course.course_code
        } (${
          course.course_title
        }) in ${programCode} ${yearLevel}-${sectionName} on ${day} from ${this.formatTimeForDisplay(
          course.schedule?.start_time || ''
        )} to ${this.formatTimeForDisplay(course.schedule?.end_time || '')}.`,
      };
    }

    return { isValid: true, message: 'Room is available' };
  }

  /**
   * Finds conflicting courses within a program based on specified criteria.
   * @returns A ConflictingCourseDetail object if a conflict is found,
   * otherwise undefined.
   */
  private findConflictingCourseWithinProgram(
    schedules: PopulateSchedulesResponse,
    program_id: number,
    year_level: number,
    day: string,
    start_time: string,
    end_time: string,
    currentScheduleId: number,
    section_id: number
  ): ConflictingCourseDetail | undefined {
    const program = schedules.programs.find((p) => p.program_id === program_id);
    if (!program) return undefined;

    const yearLevel = program.year_levels.find(
      (y) => y.year_level === year_level
    );
    if (!yearLevel) return undefined;

    for (const semester of yearLevel.semesters) {
      for (const section of semester.sections) {
        if (section.section_per_program_year_id !== section_id) continue;
        for (const course of section.courses) {
          if (
            course.schedule?.day !== day ||
            course.schedule?.schedule_id === currentScheduleId
          )
            continue;
          if (
            this.doTimesOverlap(
              start_time,
              end_time,
              course.schedule?.start_time,
              course.schedule?.end_time
            )
          ) {
            return { course, sectionName: section.section_name };
          }
        }
        return undefined;
      }
    }
    return undefined;
  }

  /**
   * Finds conflicting schedules based on a provided predicate function.
   * @returns A ConflictingScheduleDetail object if a conflict is found,
   * otherwise undefined.
   */
  private findConflictingScheduleForPredicate(
    schedules: PopulateSchedulesResponse,
    predicate: (course: CourseResponse) => boolean
  ): ConflictingScheduleDetail | undefined {
    for (const program of schedules.programs) {
      for (const yearLevel of program.year_levels) {
        for (const semester of yearLevel.semesters) {
          for (const section of semester.sections) {
            for (const course of section.courses) {
              if (predicate(course)) {
                return {
                  course,
                  programCode: program.program_code,
                  yearLevel: yearLevel.year_level,
                  sectionName: section.section_name,
                };
              }
            }
          }
        }
      }
    }
    return undefined;
  }

  /**
   * Formats a time string for display.
   * @returns A formatted time string.
   */
  public formatTimeForDisplay(time: string): string {
    if (!time) return '';
    const [hours, minutes] = time.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
  }

  /**
   * Converts a time string to minutes.
   * @returns The time in minutes.
   */
  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Checks if two time ranges overlap.
   * @returns True if the time ranges overlap, false otherwise.
   */
  private doTimesOverlap(
    start1: string,
    end1: string,
    start2: string | undefined,
    end2: string | undefined
  ): boolean {
    if (!start2 || !end2) return false;

    const start1Minutes = this.timeToMinutes(start1);
    const end1Minutes = this.timeToMinutes(end1);
    const start2Minutes = this.timeToMinutes(start2);
    const end2Minutes = this.timeToMinutes(end2);

    return start1Minutes < end2Minutes && end1Minutes > start2Minutes;
  }

  /**
   * Validates if the selected time range matches the required course hours
   */
  private validateCourseHours(
    schedules: PopulateSchedulesResponse,
    schedule_id: number,
    start_time: string,
    end_time: string
  ): { isValid: boolean; message: string } {
    let targetCourse: any;
    let allCourseSchedules: any[] = [];

    for (const program of schedules.programs) {
      for (const yearLevel of program.year_levels) {
        for (const semester of yearLevel.semesters) {
          for (const section of semester.sections) {
            const course = section.courses.find(
              (c) => c.schedule?.schedule_id === schedule_id
            );
            if (course) {
              targetCourse = course;

              allCourseSchedules = section.courses.filter(
                (c) =>
                  c.course_id === course.course_id &&
                  c.schedule?.schedule_id !== schedule_id &&
                  c.schedule?.start_time &&
                  c.schedule?.end_time
              );
              break;
            }
          }
        }
      }
    }

    if (!targetCourse) {
      return { isValid: true, message: 'Course not found' };
    }

    const totalRequiredHours = targetCourse.lec_hours + targetCourse.lab_hours;

    let hoursAlreadyScheduled = 0;
    allCourseSchedules.forEach((course) => {
      const startMins = this.timeToMinutes(course.schedule.start_time);
      const endMins = this.timeToMinutes(course.schedule.end_time);
      hoursAlreadyScheduled += (endMins - startMins) / 60;
    });

    const remainingHours = totalRequiredHours - hoursAlreadyScheduled;

    const startMinutes = this.timeToMinutes(start_time);
    const endMinutes = this.timeToMinutes(end_time);
    const selectedDurationHours = (endMinutes - startMinutes) / 60;

    if (selectedDurationHours > remainingHours) {
      const totalScheduledHours = hoursAlreadyScheduled + selectedDurationHours;
      return {
        isValid: false,
        message: `The selected time range (${selectedDurationHours} hours)
        exceeds the remaining allowed hours (${remainingHours} hours) for
        this course.`,
      };
    }

    return { isValid: true, message: '' };
  }

  /**
   * Merges the original schedules with arrangement overrides.
   */
  private mergeSchedulesWithArrangements(
    schedules: PopulateSchedulesResponse,
    rooms: { rooms: Room[] },
    arrangements: ScheduleArrangementOverride[]
  ): PopulateSchedulesResponse {
    if (!arrangements || arrangements.length === 0) {
      return schedules;
    }

    const arrangementsByScheduleId = new Map<number, ScheduleArrangementOverride>();
    arrangements.forEach((arrangement) => {
      if (arrangement?.schedule_id) {
        arrangementsByScheduleId.set(arrangement.schedule_id, arrangement);
      }
    });

    const roomByCode = new Map<string, Room>();
    rooms.rooms.forEach((room) => {
      if (room.room_code) {
        roomByCode.set(room.room_code.toLowerCase(), room);
      }
    });

    return {
      ...schedules,
      programs: schedules.programs.map(program =>
        this.applyArrangementsToProgram(
          program,
          arrangementsByScheduleId,
          roomByCode,
          rooms
        )
      ),
    };
  }

  /**
   * Applies arrangement overrides to all courses within a program.
   */
  private applyArrangementsToProgram(
    program: any,
    arrangements: Map<number, ScheduleArrangementOverride>,
    roomByCode: Map<string, Room>,
    rooms: { rooms: Room[] }
  ) {
    return {
      ...program,
      year_levels: program.year_levels.map((yl: any) => ({
        ...yl,
        semesters: yl.semesters.map((sem: any) => ({
          ...sem,
          sections: sem.sections.map((sec: any) => ({
            ...sec,
            courses: sec.courses.map((course: CourseResponse) =>
              this.applyArrangementToCourse(
                course,
                arrangements.get(course.schedule?.schedule_id || 0),
                roomByCode,
                rooms
              )
            ),
          })),
        })),
      })),
    };
  }

  /**
   * Applies a single arrangement override to a course.
  */
  private applyArrangementToCourse(
    course: CourseResponse,
    arrangement: ScheduleArrangementOverride | undefined,
    roomByCode: Map<string, Room>,
    rooms: { rooms: Room[] }
  ): CourseResponse {
    if (!arrangement || !course.schedule) return course;

    const room = this.resolveArrangementRoom(arrangement, roomByCode, rooms);

    return {
      ...course,
      schedule: {
        ...course.schedule,
        day: arrangement.day ?? course.schedule.day,
        start_time: arrangement.start_time ?? course.schedule.start_time,
        end_time: arrangement.end_time ?? course.schedule.end_time,
        room_id: room?.room_id ?? arrangement.room_id ?? course.schedule.room_id,
      },
      room: room ? { room_id: room.room_id, room_code: room.room_code } : course.room,
    };
  }

  /**
   * Resolves the room object for a given arrangement based on its ID or code.
   * @returns The resolved room object or undefined if not found
   */
  private resolveArrangementRoom(
    arrangement: ScheduleArrangementOverride,
    roomByCode: Map<string, Room>,
    rooms: { rooms: Room[] }
  ): Room | undefined {
    if (arrangement.room_id) {
      return rooms.rooms.find((room) => room.room_id === arrangement.room_id);
    }

    if (arrangement.room_code) {
      return roomByCode.get(arrangement.room_code.toLowerCase());
    }

    return undefined;
  }

  /**
   * Builds an index of all schedules by their ID for quick lookup.
   * @param schedules 
   * @returns 
   */
  private buildScheduleIndex(
    schedules: PopulateSchedulesResponse
  ): Map<number, CourseResponse> {
    const scheduleById = new Map<number, CourseResponse>();

    for (const program of schedules.programs) {
      for (const yearLevel of program.year_levels) {
        for (const semester of yearLevel.semesters) {
          for (const section of semester.sections) {
            for (const course of section.courses) {
              const scheduleId = course.schedule?.schedule_id;
              if (scheduleId) {
                scheduleById.set(scheduleId, course);
              }
            }
          }
        }
      }
    }

    return scheduleById;
  }
}

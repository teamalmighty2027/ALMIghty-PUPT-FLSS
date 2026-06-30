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
      course_id: number;
      schedule_id: number;
      program_id: number;
      year_level: number;
      day: string;
      start_time: string;
      end_time: string;
      section_id: number;
      faculty_id: number | null;
      room_id: number | null;
      hoursAlreadyAssigned?: number;
    }
  ): { hasConflicts: boolean; messages: string[]; warnings: string[] } {
    const conflicts: string[] = [];
    const warnings: string[] = [];

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
  
    // Resolve course_id from params or from schedules by schedule_id
    let courseId = params.course_id;

    if (!courseId && params.schedule_id) {
      const courseWithSchedule = this.flattenCourses(schedules).find(
        ({ course }) => course.schedule?.schedule_id === params.schedule_id
      );
      if (courseWithSchedule) {
        courseId = courseWithSchedule.course.course_id;
      }
    }

    // Check course hours against selected time range
    if (params.start_time && params.end_time && courseId) {
      const courseHoursValidation = this.validateCourseHours(
        schedules,
        params.schedule_id,
        courseId,
        params.start_time,
        params.end_time,
        params.section_id,
        params.day,
        params.hoursAlreadyAssigned
      );
      if (!courseHoursValidation.isValid) {
        conflicts.push(courseHoursValidation.message);
      }
    }

    // Check faculty breaks
    if (params.faculty_id) {
      const facultyBreakWarning = this.checkFacultyBreaks(
        schedules,
        params.faculty_id,
        params.day,
        params.start_time,
        params.end_time,
        params.schedule_id
      );
      if (facultyBreakWarning) {
        warnings.push(facultyBreakWarning);
      }
    }

    return {
      hasConflicts: conflicts.length > 0,
      messages: conflicts,
      warnings: warnings,
    };
  }

  /**
   * Checks if a bridging-course schedule has an exact match in another
   * program. Only courses with temporary_type === 'bridging' are
   * considered — non-bridging matches are intentionally ignored to
   * prevent false-positive combine prompts.
   *
   * A combine match requires ALL four conditions to be fulfilled:
   * same day, overlapping time, same faculty, and same room.
   * If faculty or room are not yet set (null), no match is returned
   * and the normal conflict path runs instead.
   *
   * NOTE: For temporary/bridging courses the backend places room_id
   * inside course.room.room_id, NOT inside course.schedule.room_id,
   * so we read from the correct location here.
   *
   * @returns ConflictingScheduleDetail if a bridging match is found,
   * otherwise undefined
   */
  public checkMatchingSchedule(
    schedules: PopulateSchedulesResponse,
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
  ): ConflictingScheduleDetail | undefined {
    // Require both faculty and room to be set — a partial match must
    // not trigger the combine prompt (falls through to conflict check).
    if (!params.faculty_id || !params.room_id) {
      return undefined;
    }

    // NOTE: Currently scoped to bridging courses only.
    // To extend to other temporary types, adjust the
    // temporary_type guard in the predicate below.
    return this.findConflictingScheduleForPredicate(
      schedules,
      (course) =>
        course.temporary_type === 'bridging' &&
        course.schedule?.day === params.day &&
        course.schedule?.schedule_id !== params.schedule_id &&
        this.doTimesOverlap(
          params.start_time,
          params.end_time,
          course.schedule?.start_time,
          course.schedule?.end_time
        ) &&
        course.faculty_id === params.faculty_id &&
        // Room is stored in course.room for temporary courses,
        // not in course.schedule (the backend never puts it there).
        course.room?.room_id === params.room_id
    );
  }

  /**
   * Produces a combined program label in reverse-alphabetical order,
   * e.g., "BSME" and "BSECE" -> "BSME/BSECE".
   * @param codeA First program code
   * @param codeB Second program code
   * @returns The combined label
   */
  public buildCombinedLabel(codeA: string, codeB: string): string {
    return [codeA, codeB].sort().reverse().join('/');
  }

  /**
   * Validates schedule conflicts using a merged view of schedules + arrangements.
   */
  public validateScheduleConflictsWithArrangements(
    schedules: PopulateSchedulesResponse,
    rooms: { rooms: Room[] },
    arrangements: ScheduleArrangementOverride[],
    params: {
      course_id?: number;
      schedule_id: number;
      program_id: number;
      year_level: number;
      day: string;
      start_time: string;
      end_time: string;
      section_id: number;
      faculty_id: number | null;
      room_id: number | null;
      hoursAlreadyAssigned?: number;
    }
  ): { hasConflicts: boolean; messages: string[]; warnings: string[] } {
    const mergedSchedules = this.mergeSchedulesWithArrangements(
      schedules,
      rooms,
      arrangements
    );

    return this.validateScheduleConflicts(mergedSchedules, rooms, {
      course_id: params.course_id || 0,
      ...params,
    });
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
    const program = schedules.programs.find(
      (p) => p.program_id === program_id
    );
    if (!program) return undefined;

    const yearLevel = program.year_levels.find(
      (y) => y.year_level === year_level
    );
    if (!yearLevel) return undefined;

    const section = yearLevel.semesters
      .flatMap((s) => s.sections)
      .find((sec) => sec.section_per_program_year_id === section_id);

    if (!section) return undefined;

    const conflictingCourse = section.courses.find(
      (course) =>
        course.schedule?.day === day &&
        course.schedule?.schedule_id !== currentScheduleId &&
        this.doTimesOverlap(
          start_time,
          end_time,
          course.schedule?.start_time,
          course.schedule?.end_time
        )
    );

    return conflictingCourse
      ? { course: conflictingCourse, sectionName: section.section_name }
      : undefined;
  }

  /**
   * Finds the first course entry that satisfies the given predicate.
   * Delegates to flattenCourses() for a single-pass search instead
   * of manually nesting five for-loops.
   * @returns A ConflictingScheduleDetail if found, otherwise undefined.
   */
  private findConflictingScheduleForPredicate(
    schedules: PopulateSchedulesResponse,
    predicate: (course: CourseResponse) => boolean
  ): ConflictingScheduleDetail | undefined {
    return this.flattenCourses(schedules).find(
      ({ course }) => predicate(course)
    );
  }

  /**
   * Flattens the nested program/year-level/semester/section/course
   * tree into a single array so that callers can use a single
   * Array.find() or Array.filter() pass instead of nested loops.
   */
  private flattenCourses(
    schedules: PopulateSchedulesResponse
  ): ConflictingScheduleDetail[] {
    const result: ConflictingScheduleDetail[] = [];

    for (const program of schedules.programs) {
      for (const yearLevel of program.year_levels) {
        for (const semester of yearLevel.semesters) {
          for (const section of semester.sections) {
            for (const course of section.courses) {
              result.push({
                course,
                programCode: program.program_code,
                programId: program.program_id,
                yearLevel: yearLevel.year_level,
                sectionName: section.section_name,
              });
            }
          }
        }
      }
    }

    return result;
  }

  /**
   * Formats a time string for display.
   * Handles 24h (HH:mm:ss) and already formatted 12h (HH:mm AM/PM) strings.
   * @returns A formatted time string.
   */
  public formatTimeForDisplay(time: string): string {
    if (!time) return '';
    
    // If it's already in AM/PM format, just return it
    if (time.toUpperCase().includes('AM') || time.toUpperCase().includes('PM')) {
      return time;
    }

    const parts = time.split(':');
    if (parts.length < 2) return time;

    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);

    if (isNaN(hours) || isNaN(minutes)) return time;

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
   * Validates if the selected time range matches the required course hours.
   */
  private validateCourseHours(
    schedules: PopulateSchedulesResponse,
    schedule_id: number,
    course_id: number,
    start_time: string,
    end_time: string,
    section_id: number,
    day: string,
    hoursAlreadyAssigned?: number,
  ): { isValid: boolean; message: string } {

    // Skip hours validation for Summer term (semester_id === 3)
    // as subjects may be scheduled multiple times a week
    if (schedules.semester_id === 3) {
      return { isValid: true, message: '' };
    }

    const section = schedules.programs
      .flatMap((p) => p.year_levels)
      .flatMap((y) => y.semesters)
      .flatMap((s) => s.sections)
      .find((sec) => sec.section_per_program_year_id === section_id);

    if (!section) {
      return { isValid: true, message: 'Section not found' };
    }

    const targetCourse = section.courses.find(
      (c) => c.course_id === course_id
    );

    if (!targetCourse) {
      return { isValid: true, message: 'Course not found' };
    }

    // Check for contiguous slots on the same day exceeding 6 hours
    const sameDaySlots = section.courses.filter(
      (c) =>
        c.course_id === course_id &&
        c.schedule?.schedule_id !== schedule_id &&
        c.schedule?.day === day &&
        c.schedule?.start_time &&
        c.schedule?.end_time
    );

    const intervals: [number, number][] = [
      [this.timeToMinutes(start_time), this.timeToMinutes(end_time)],
    ];

    sameDaySlots.forEach((c) => {
      if (c.schedule) {
        intervals.push([
          this.timeToMinutes(c.schedule.start_time),
          this.timeToMinutes(c.schedule.end_time),
        ]);
      }
    });

    intervals.sort((a, b) => a[0] - b[0]);

    const mergedIntervals: [number, number][] = [];
    
    for (const interval of intervals) {
      if (mergedIntervals.length === 0) {
        mergedIntervals.push(interval);
      } else {
        const last = mergedIntervals[mergedIntervals.length - 1];
        if (interval[0] <= last[1]) {
          last[1] = Math.max(last[1], interval[1]);
        } else {
          mergedIntervals.push(interval);
        }
      }
    }

    for (const [start, end] of mergedIntervals) {
      if ((end - start) > 360) {
        return {
          isValid: false,
          message:
            `The course cannot be continuously scheduled for more than ` +
            `6 hours on the same day.`,
        };
      }
    }

    let calculatedHoursAlreadyScheduled = 0;
    if (hoursAlreadyAssigned !== undefined) {
      calculatedHoursAlreadyScheduled = hoursAlreadyAssigned;
    } else {
      const allCourseSchedules = section.courses.filter(
        (c) =>
          c.course_id === course_id &&
          c.schedule?.schedule_id !== schedule_id &&
          c.schedule?.start_time &&
          c.schedule?.end_time
      );
      allCourseSchedules.forEach((course) => {
        if (course.schedule) {
          const startMins = this.timeToMinutes(course.schedule.start_time);
          const endMins = this.timeToMinutes(course.schedule.end_time);
          calculatedHoursAlreadyScheduled += (endMins - startMins) / 60;
        }
      });
    }

    const totalRequiredHours =
      targetCourse.lec_hours + targetCourse.lab_hours;
    const remainingHours = totalRequiredHours - calculatedHoursAlreadyScheduled;

    const startMinutes = this.timeToMinutes(start_time);
    const endMinutes = this.timeToMinutes(end_time);
    const selectedDurationHours = (endMinutes - startMinutes) / 60;

    if (selectedDurationHours > remainingHours) {
      return {
        isValid: false,
        message:
          `The selected time range (${selectedDurationHours} hours) ` +
          `exceeds the remaining allowed hours (${remainingHours} hours) ` +
          `for this course.`,
      };
    }

    return { isValid: true, message: '' };
  }

  /**
   * Checks if scheduling creates breaks of 3 hours or more for the faculty.
   */
  private checkFacultyBreaks(
    schedules: PopulateSchedulesResponse,
    faculty_id: number,
    day: string,
    start_time: string,
    end_time: string,
    currentScheduleId: number
  ): string | null {
    if (!faculty_id || !day || !start_time || !end_time) {
      return null;
    }

    const facultyCourses = this.flattenCourses(schedules).filter(
      ({ course }) =>
        course.faculty_id === faculty_id &&
        course.schedule?.day === day &&
        course.schedule?.schedule_id !== currentScheduleId &&
        course.schedule?.start_time &&
        course.schedule?.end_time
    );

    const intervals: [number, number][] = [
      [this.timeToMinutes(start_time), this.timeToMinutes(end_time)],
    ];

    facultyCourses.forEach(({ course }) => {
      if (course.schedule) {
        intervals.push([
          this.timeToMinutes(course.schedule.start_time),
          this.timeToMinutes(course.schedule.end_time),
        ]);
      }
    });

    intervals.sort((a, b) => a[0] - b[0]);

    for (let i = 0; i < intervals.length - 1; i++) {
      const currentEnd = intervals[i][1];
      const nextStart = intervals[i + 1][0];
      const gap = nextStart - currentEnd;

      if (gap >= 180) {
        return `This schedule creates a break of ` +
          `${(gap / 60).toFixed(1)} hours for the assigned faculty.`;
      }
    }

    return null;
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

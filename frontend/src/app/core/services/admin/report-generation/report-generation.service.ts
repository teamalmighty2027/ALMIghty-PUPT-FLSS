import { Injectable } from '@angular/core';

import { Observable, forkJoin, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

import { ReportsService } from '../reports/reports.service';
import { ReportHeaderService } from '../../report-header/report-header.service';

import jsPDF from 'jspdf';
import 'jspdf-autotable';

interface Faculty {
  facultyName: string;
  facultyCode: string;
  facultyType: string;
  facultyUnits: number;
  isEnabled: boolean;
  facultyId: number;
  schedules?: any[];
  academicYear?: string;
  semester?: string;
}

interface Program {
  program_id: number;
  program_code: string;
  program_title: string;
  year_levels: YearLevel[];
  year_levels_selected?: string;
  section_selected?: string;
  academicYear: string;
  semester: string;
}

interface YearLevel {
  year_level: number;
  sections: Section[];
}

interface Section {
  section_name: string;
  schedules: any[];
}

interface Room {
  academicYear: string;
  semester: string;
  roomId: number;
  roomCode: string;
  location: string;
  floorLevel: string;
  capacity: number;
  schedules: any[];
}

@Injectable({
  providedIn: 'root',
})
export class ReportGenerationService {
  private timeSlots: { time: string; minutes: number }[] = [];

  constructor(
    private reportsService: ReportsService,
    private reportHeaderService: ReportHeaderService,
  ) {
    this.generateTimeSlots();
  }

  /**
   * Generate all selected reports and return an array of { type: string; blob: Blob; }
   */
  generateSelectedReports(selections: {
    faculty: boolean;
    programs: boolean;
    rooms: boolean;
  }): Observable<{ type: string; blob: Blob }[]> {
    const reportObservables: { type: string; observable: Observable<Blob> }[] =
      [];

    if (selections.faculty) {
      reportObservables.push({
        type: 'faculty',
        observable: this.generateFacultyReport(),
      });
    }

    if (selections.programs) {
      reportObservables.push({
        type: 'programs',
        observable: this.generateProgramsReport(),
      });
    }

    if (selections.rooms) {
      reportObservables.push({
        type: 'rooms',
        observable: this.generateRoomsReport(),
      });
    }

    if (reportObservables.length === 0) {
      return of([]);
    }

    const observablesWithType = reportObservables.map((r) =>
      r.observable.pipe(map((blob) => ({ type: r.type, blob }))),
    );

    return forkJoin(observablesWithType).pipe(
      catchError((error) => {
        console.error('Error generating selected reports:', error);
        return of([]);
      }),
    );
  }

  /**
   * Generate Faculty Schedule Report as a Blob
   */
  generateFacultyReport(): Observable<Blob> {
    return this.reportsService.getFacultySchedulesReport().pipe(
      map((response) => {
        const faculties = response.faculty_schedule_reports.faculties;
        const facultyData: Faculty[] = faculties.map((faculty: any) => ({
          facultyName: faculty.faculty_name,
          facultyCode: faculty.faculty_code,
          facultyType: faculty.faculty_type,
          facultyUnits: faculty.assigned_units,
          isEnabled: faculty.is_published === 1,
          facultyId: faculty.faculty_id,
          schedules: faculty.schedules || [],
          academicYear: `${response.faculty_schedule_reports.year_start}-` +
            `${response.faculty_schedule_reports.year_end}`,
          semester: this.getSemesterDisplay(
            response.faculty_schedule_reports.semester
          ),
        }));

        const doc = new jsPDF('landscape', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.width;
        const margin = 10;
        const topMargin = 15;
        const logoSize = 22;
        let hasPages = false;

        facultyData.forEach((faculty) => {
          if (faculty.schedules && faculty.schedules.length > 0) {
            if (hasPages) {
              this.reportHeaderService.addStandardFooter(doc);
              doc.addPage();
            }
            hasPages = true;

            const title = `${faculty.facultyName} Schedule`;
            const subtitle = this.getAcademicYearSubtitle(faculty);

            const currentY = this.drawHeader(
              doc,
              topMargin,
              pageWidth,
              margin,
              logoSize,
              title,
              subtitle
            );

            this.drawFacultyScheduleTable(
              doc,
              faculty.schedules,
              title,
              subtitle,
              currentY,
              margin,
              pageWidth
            );
          }
        });

        if (hasPages) {
          this.reportHeaderService.addStandardFooter(doc);
        } else {
          doc.text('No schedules available.', 10, 20);
        }

        return doc.output('blob');
      }),
      catchError((error) => {
        console.error('Error generating faculty report:', error);
        return of(new Blob());
      }),
    );
  }

  /**
   * Generate Programs Schedule Report as a Blob
   */
  generateProgramsReport(): Observable<Blob> {
    return this.reportsService.getProgramSchedulesReport().pipe(
      map((response) => {
        const programs = response.programs_schedule_reports.programs;
        const programData: Program[] = programs.map((program: any) => ({
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
          academicYear: `${response.programs_schedule_reports.year_start}-` +
            `${response.programs_schedule_reports.year_end}`,
          semester: this.getSemesterDisplay(
            response.programs_schedule_reports.semester
          ),
        }));

        const doc = new jsPDF('landscape', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.width;
        const margin = 10;
        const topMargin = 15;
        const logoSize = 22;
        let hasPages = false;

        programData.forEach((program) => {
          program.year_levels.forEach((yearLevel) => {
            yearLevel.sections.forEach((section) => {
              if (section.schedules && section.schedules.length > 0) {
                if (hasPages) {
                  this.reportHeaderService.addStandardFooter(doc);
                  doc.addPage();
                }
                hasPages = true;

                const title = `${program.program_code} - ` +
                  `Year ${yearLevel.year_level} - ` +
                  `Section ${section.section_name}`;
                const subtitle = `For Academic Year ` +
                  `${program.academicYear}, ${program.semester}`;

                const currentY = this.drawHeader(
                  doc,
                  topMargin,
                  pageWidth,
                  margin,
                  logoSize,
                  title,
                  subtitle
                );

                this.drawProgramScheduleTable(
                  doc,
                  section.schedules,
                  title,
                  subtitle,
                  currentY,
                  margin,
                  pageWidth
                );
              }
            });
          });
        });

        if (hasPages) {
          this.reportHeaderService.addStandardFooter(doc);
        } else {
          doc.text('No schedules available.', 10, 20);
        }

        return doc.output('blob');
      }),
      catchError((error) => {
        console.error('Error generating programs report:', error);
        return of(new Blob());
      }),
    );
  }

  /**
   * Generate Rooms Schedule Report as a Blob
   */
  generateRoomsReport(): Observable<Blob> {
    return this.reportsService.getRoomSchedulesReport().pipe(
      map((response) => {
        const rooms = response.room_schedule_reports.rooms;
        const roomData: Room[] = rooms.map((room: any) => ({
          roomId: room.room_id,
          roomCode: room.room_code && room.room_code.trim() !== ''
            ? room.room_code
            : 'TBA',
          location: room.location,
          floorLevel: room.floor_level,
          capacity: room.capacity,
          schedules: room.schedules,
          academicYear: `${response.room_schedule_reports.year_start}-` +
            `${response.room_schedule_reports.year_end}`,
          semester: this.getSemesterDisplay(
            response.room_schedule_reports.semester
          ),
        }));

        const doc = new jsPDF('landscape', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.width;
        const margin = 10;
        const topMargin = 15;
        const logoSize = 22;
        let hasPages = false;

        roomData.forEach((room) => {
          if (room.schedules && room.schedules.length > 0) {
            if (hasPages) {
              this.reportHeaderService.addStandardFooter(doc);
              doc.addPage();
            }
            hasPages = true;

            const title = `Room ${room.roomCode} Schedule`;
            const subtitle = this.getAcademicYearSubtitle(room);

            const currentY = this.drawHeader(
              doc,
              topMargin,
              pageWidth,
              margin,
              logoSize,
              title,
              subtitle
            );

            this.drawRoomScheduleTable(
              doc,
              room.schedules,
              title,
              subtitle,
              currentY,
              margin,
              pageWidth
            );
          }
        });

        if (hasPages) {
          this.reportHeaderService.addStandardFooter(doc);
        } else {
          doc.text('No schedules available.', 10, 20);
        }

        return doc.output('blob');
      }),
      catchError((error) => {
        console.error('Error generating rooms report:', error);
        return of(new Blob());
      }),
    );
  }

  /**
   * Helper method to draw the header
   */
  private drawHeader(
    doc: jsPDF,
    startY: number,
    pageWidth: number,
    margin: number,
    logoSize: number,
    title: string,
    subtitle: string,
  ): number {
    let currentY = startY;

    // Use the report header service with subtitle
    this.reportHeaderService
      .addHeader(doc, title, currentY, subtitle)
      .subscribe((newY) => {
        currentY = newY;
      });

    return currentY;
  }

  /**
   * Helper method to draw Faculty Schedule Table
   */
  /**
   * Helper method to draw Faculty Schedule Table using the component's format
   */
  private drawFacultyScheduleTable(
    doc: jsPDF,
    scheduleData: any[],
    title: string,
    subtitle: string,
    startY: number,
    margin: number,
    pageWidth: number,
  ): void {
    const hasSchedules = scheduleData && scheduleData.length > 0;

    if (!hasSchedules) {
      return;
    }

    const days = [
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ];
    const timeColWidth = 22;
    const dayColumnWidth =
      (pageWidth - margin * 2 - timeColWidth) / days.length;
    const rowHeight = 8.5;

    const chunks = [
      { name: 'Morning (7:30 AM - 2:00 PM)', start: 450, end: 840 },
      { name: 'Afternoon (2:00 PM - 9:00 PM)', start: 840, end: 1260 },
    ];

    const activeChunks = chunks.filter((chunk) => {
      return scheduleData.some((s) => {
        if (!s.start_time || !s.end_time || !s.day) {
          return false;
        }
        const sStart = this.timeToMinutes(s.start_time);
        const sEnd = this.timeToMinutes(s.end_time);
        return Math.max(sStart, chunk.start) < Math.min(sEnd, chunk.end);
      });
    });

    if (activeChunks.length === 0) {
      return;
    }

    let pageUsed = false;
    let currentY = startY;

    activeChunks.forEach((chunk) => {
      if (pageUsed) {
        this.reportHeaderService.addStandardFooter(doc);
        doc.addPage();
        currentY = this.drawHeader(
          doc,
          15,
          pageWidth,
          margin,
          22,
          title,
          subtitle
        );
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
      doc.text(
        'Time',
        margin + timeColWidth / 2,
        currentY + totalHeaderHeight / 2 + 1.5,
        { align: 'center' }
      );

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
        doc.text(
          day,
          xPos + dayColumnWidth / 2,
          currentY + 4.5,
          { align: 'center' }
        );

        // Bottom row: Subject sub-header
        doc.setFillColor(160, 20, 20);
        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(0.4);
        doc.rect(
          xPos,
          currentY + headerHeight,
          subjColWidth,
          subHeaderHeight,
          'FD'
        );
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.text(
          'Subject',
          xPos + subjColWidth / 2,
          currentY + headerHeight + 3.5,
          { align: 'center' }
        );

        // Bottom row: Room sub-header
        doc.setFillColor(160, 20, 20);
        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(0.4);
        doc.rect(
          xPos + subjColWidth,
          currentY + headerHeight,
          roomColWidth,
          subHeaderHeight,
          'FD'
        );
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.text(
          'Room',
          xPos + subjColWidth + roomColWidth / 2,
          currentY + headerHeight + 3.5,
          { align: 'center' }
        );
      });

      currentY += totalHeaderHeight;

      // --- 2. DRAW TIME GRID ---
      doc.setTextColor(0, 0, 0);
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.5);

      const chunkSlots = this.timeSlots.filter(
        (s) => s.minutes >= chunk.start && s.minutes < chunk.end
      );

      chunkSlots.forEach((slot, index) => {
        const yPos = currentY + index * rowHeight;
        const isTopRow = index === 0;
        const isThreeHourGap =
          slot.minutes >= 450 && (slot.minutes - 450) % 180 === 0;

        if (isTopRow || isThreeHourGap) {
          if (!isTopRow) {
            doc.setDrawColor(200, 200, 200);
            doc.setLineWidth(0.5);
            doc.line(margin, yPos, pageWidth - margin, yPos);
          }
          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(0, 0, 0);
          doc.text(
            slot.time,
            margin + timeColWidth / 2,
            yPos + 5,
            { align: 'center' }
          );
        }
      });

      // Draw the last time label at finalY
      const finalY = currentY + chunkSlots.length * rowHeight;
      const lastSlot = chunkSlots[chunkSlots.length - 1];

      if (lastSlot) {
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.5);
        doc.line(margin, finalY, pageWidth - margin, finalY);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text(
          lastSlot.time,
          margin + timeColWidth / 2,
          finalY - rowHeight + 5,
          { align: 'center' }
        );
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
        doc.line(
          xPos + dayColumnWidth,
          currentY,
          xPos + dayColumnWidth,
          finalY
        );
      });

      // --- 3. MERGE BLOCKS ---
      const mergedMap = new Map<string, any>();

      for (const item of scheduleData) {
        if (!item.start_time || !item.end_time || !item.day) {
          continue;
        }
        const key = `${item.day}|${item.start_time}|${item.end_time}`;

        if (mergedMap.has(key)) {
          const existing = mergedMap.get(key);
          if (!existing._mergedPrograms) {
            existing._mergedPrograms = [existing.program_code];
          }
          if (!existing._mergedPrograms.includes(item.program_code)) {
            existing._mergedPrograms.push(item.program_code);
          }
        } else {
          mergedMap.set(key, { ...item });
        }
      }

      const sortedScheduleData = [...mergedMap.values()].sort(
        (a, b) =>
          this.timeToMinutes(a.start_time) - this.timeToMinutes(b.start_time)
      );

      // --- PASS 1: Draw all block backgrounds ---
      sortedScheduleData.forEach((item) => {
        const dayIndex = days.indexOf(item.day);
        if (dayIndex === -1) {
          return;
        }

        const cappedStart = Math.max(
          this.timeToMinutes(item.start_time),
          chunk.start
        );
        const cappedEnd = Math.min(
          this.timeToMinutes(item.end_time),
          chunk.end
        );

        if (cappedStart >= cappedEnd) {
          return;
        }

        const startSlot = chunkSlots.findIndex(
          (slot) => slot.minutes === cappedStart
        );

        if (startSlot === -1) {
          return;
        }

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
      sortedScheduleData.forEach((item) => {
        const dayIndex = days.indexOf(item.day);
        if (dayIndex === -1) {
          return;
        }

        const originalStart = this.timeToMinutes(item.start_time);
        const originalEnd = this.timeToMinutes(item.end_time);
        const cappedStart = Math.max(originalStart, chunk.start);
        const cappedEnd = Math.min(originalEnd, chunk.end);

        if (cappedStart >= cappedEnd) {
          return;
        }

        const startSlot = chunkSlots.findIndex(
          (slot) => slot.minutes === cappedStart
        );

        if (startSlot === -1) {
          return;
        }

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

        // Build content
        let programDisplay: string;
        if (item._mergedPrograms && item._mergedPrograms.length > 1) {
          programDisplay =
            item._mergedPrograms.sort().reverse().join('/') +
            ` ${item.year_level} - ${item.section_name}`;
        } else {
          programDisplay =
            `${item.program_code} ${item.year_level} - ` +
            `${item.section_name}`;
        }

        // Format time range from original uncapped times
        const formatTime = (minutes: number): string => {
          const h = Math.floor(minutes / 60);
          const m = minutes % 60;
          const suffix = h >= 12 ? 'PM' : 'AM';
          const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
          return `${displayH}:${m.toString().padStart(2, '0')} ${suffix}`;
        };
        const timeRange =
          `${formatTime(originalStart)} - ${formatTime(originalEnd)}`;

        const content = [
          item.course_details?.course_code || '',
          item.course_details?.course_title || '',
          programDisplay,
          timeRange,
        ].filter((line) => line !== '');

        const fontSizes = [
          codeFontSize,
          textFontSize,
          textFontSize,
          timeFontSize,
        ];
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
          doc.text(
            badgeLabel,
            badgeX + badgePaddingX,
            badgeY + badgeH - badgePaddingY - 0.2
          );
          doc.setTextColor(0, 0, 0);
        }

        // Subject content — vertically centered with top/bottom clamp
        let totalSubjectLines = 0;
        content.forEach((line) => {
          totalSubjectLines += doc.splitTextToSize(
            line,
            subjColWidth - 4
          ).length;
        });

        const totalSubjectHeight = (totalSubjectLines - 1) * lineSpacing;
        let subjectStartY = yPos + height / 2 - totalSubjectHeight / 2;
        if (isBridging) {
          subjectStartY += 2;
        }

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
              doc.text(wLine, xPos + subjColWidth / 2, subjectStartY, {
                align: 'center',
                baseline: 'middle',
              });
            }
            subjectStartY += lineSpacing;
          });
        });

        doc.setTextColor(0, 0, 0);

        // Room text — vertically centered with top/bottom clamp
        const roomText =
          item.room_code && item.room_code.trim() !== ''
            ? item.room_code
            : 'TBA';
        doc.setFontSize(roomFontSize);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        const wrappedRoom = doc.splitTextToSize(roomText, roomColWidth - 2);
        const roomLineSpacing = 3.2;
        const totalRoomHeight = (wrappedRoom.length - 1) * roomLineSpacing;
        let roomStartY = yPos + height / 2 - totalRoomHeight / 2;

        roomStartY = Math.max(roomStartY, yPos + 3.2);
        const maxRoomBoundary = yPos + height - 3;

        wrappedRoom.forEach((rLine: string) => {
          if (roomStartY <= maxRoomBoundary) {
            doc.text(
              rLine,
              xPos + subjColWidth + roomColWidth / 2,
              roomStartY,
              { align: 'center', baseline: 'middle' }
            );
          }
          roomStartY += roomLineSpacing;
        });
      });
    });
  }

  /**
   * Helper method to draw Program Schedule Table
   */
  /**
   * Helper method to draw Program Schedule Table using the component's format
   */
  private drawProgramScheduleTable(
    doc: jsPDF,
    scheduleData: any[],
    title: string,
    subtitle: string,
    startY: number,
    margin: number,
    pageWidth: number,
  ): void {
    const hasSchedules = scheduleData && scheduleData.length > 0;

    if (!hasSchedules) {
      return;
    }

    const days = [
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ];
    const timeColWidth = 22;
    const dayColumnWidth =
      (pageWidth - margin * 2 - timeColWidth) / days.length;
    const rowHeight = 8.5;

    const chunks = [
      { name: 'Morning (7:30 AM - 2:00 PM)', start: 450, end: 840 },
      { name: 'Afternoon (2:00 PM - 9:00 PM)', start: 840, end: 1260 },
    ];

    const activeChunks = chunks.filter((chunk) => {
      return scheduleData.some((s) => {
        if (!s.start_time || !s.end_time || !s.day) {
          return false;
        }
        const sStart = this.timeToMinutes(s.start_time);
        const sEnd = this.timeToMinutes(s.end_time);
        return Math.max(sStart, chunk.start) < Math.min(sEnd, chunk.end);
      });
    });

    if (activeChunks.length === 0) {
      return;
    }

    let pageUsed = false;
    let currentY = startY;

    activeChunks.forEach((chunk) => {
      if (pageUsed) {
        this.reportHeaderService.addStandardFooter(doc);
        doc.addPage();
        currentY = this.drawHeader(
          doc,
          15,
          pageWidth,
          margin,
          22,
          title,
          subtitle
        );
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
      doc.text(
        'Time',
        margin + timeColWidth / 2,
        currentY + totalHeaderHeight / 2 + 1.5,
        { align: 'center' }
      );

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
        doc.text(
          day,
          xPos + dayColumnWidth / 2,
          currentY + 4.5,
          { align: 'center' }
        );

        // Bottom row: Subject sub-header
        doc.setFillColor(160, 20, 20);
        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(0.4);
        doc.rect(
          xPos,
          currentY + headerHeight,
          subjColWidth,
          subHeaderHeight,
          'FD'
        );
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.text(
          'Subject',
          xPos + subjColWidth / 2,
          currentY + headerHeight + 3.5,
          { align: 'center' }
        );

        // Bottom row: Room sub-header
        doc.setFillColor(160, 20, 20);
        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(0.4);
        doc.rect(
          xPos + subjColWidth,
          currentY + headerHeight,
          roomColWidth,
          subHeaderHeight,
          'FD'
        );
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.text(
          'Room',
          xPos + subjColWidth + roomColWidth / 2,
          currentY + headerHeight + 3.5,
          { align: 'center' }
        );
      });

      currentY += totalHeaderHeight;

      // --- 2. DRAW TIME GRID ---
      doc.setTextColor(0, 0, 0);
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.5);

      const chunkSlots = this.timeSlots.filter(
        (s) => s.minutes >= chunk.start && s.minutes < chunk.end
      );

      chunkSlots.forEach((slot, index) => {
        const yPos = currentY + index * rowHeight;
        const isTopRow = index === 0;
        const isThreeHourGap =
          slot.minutes >= 450 && (slot.minutes - 450) % 180 === 0;

        if (isTopRow || isThreeHourGap) {
          if (!isTopRow) {
            doc.setDrawColor(200, 200, 200);
            doc.setLineWidth(0.5);
            doc.line(margin, yPos, pageWidth - margin, yPos);
          }
          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(0, 0, 0);
          doc.text(
            slot.time,
            margin + timeColWidth / 2,
            yPos + 5,
            { align: 'center' }
          );
        }
      });

      // Draw the last time label at finalY
      const finalY = currentY + chunkSlots.length * rowHeight;
      const lastSlot = chunkSlots[chunkSlots.length - 1];

      if (lastSlot) {
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.5);
        doc.line(margin, finalY, pageWidth - margin, finalY);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text(
          lastSlot.time,
          margin + timeColWidth / 2,
          finalY - rowHeight + 5,
          { align: 'center' }
        );
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
        doc.line(
          xPos + dayColumnWidth,
          currentY,
          xPos + dayColumnWidth,
          finalY
        );
      });

      // --- 3. MERGE BLOCKS (PROGRAMS SPECIFIC) ---
      const mergedMap = new Map<string, any>();

      for (const item of scheduleData) {
        if (!item.start_time || !item.end_time || !item.day) {
          continue;
        }
        const key = `${item.day}|${item.start_time}|${item.end_time}`;

        if (mergedMap.has(key)) {
          const existing = mergedMap.get(key);
          if (!existing._mergedFaculty) {
            existing._mergedFaculty = [existing.faculty_name];
          }
          if (!existing._mergedFaculty.includes(item.faculty_name)) {
            existing._mergedFaculty.push(item.faculty_name);
          }
        } else {
          mergedMap.set(key, { ...item });
        }
      }

      const sortedScheduleData = [...mergedMap.values()].sort(
        (a, b) =>
          this.timeToMinutes(a.start_time) - this.timeToMinutes(b.start_time)
      );

      // --- PASS 1: Draw all block backgrounds ---
      sortedScheduleData.forEach((item) => {
        const dayIndex = days.indexOf(item.day);
        if (dayIndex === -1) {
          return;
        }

        const cappedStart = Math.max(
          this.timeToMinutes(item.start_time),
          chunk.start
        );
        const cappedEnd = Math.min(
          this.timeToMinutes(item.end_time),
          chunk.end
        );

        if (cappedStart >= cappedEnd) {
          return;
        }

        const startSlot = chunkSlots.findIndex(
          (slot) => slot.minutes === cappedStart
        );

        if (startSlot === -1) {
          return;
        }

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
      sortedScheduleData.forEach((item) => {
        const dayIndex = days.indexOf(item.day);
        if (dayIndex === -1) {
          return;
        }

        const originalStart = this.timeToMinutes(item.start_time);
        const originalEnd = this.timeToMinutes(item.end_time);
        const cappedStart = Math.max(originalStart, chunk.start);
        const cappedEnd = Math.min(originalEnd, chunk.end);

        if (cappedStart >= cappedEnd) {
          return;
        }

        const startSlot = chunkSlots.findIndex(
          (slot) => slot.minutes === cappedStart
        );

        if (startSlot === -1) {
          return;
        }

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
            .map((f: string) =>
              !f || f.trim().toUpperCase() === 'N/A' ? 'Faculty TBA' : f
            )
            .join(' / ');
        } else {
          facultyDisplay =
            item.faculty_name &&
            item.faculty_name.trim().toUpperCase() !== 'N/A'
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
        const timeRange =
          `${formatTime(originalStart)} - ${formatTime(originalEnd)}`;

        const content = [
          item.course_details?.course_code || '',
          item.course_details?.course_title || '',
          facultyDisplay,
          timeRange,
        ].filter((line) => line !== '');

        const fontSizes = [
          codeFontSize,
          textFontSize,
          textFontSize,
          timeFontSize,
        ];
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
          doc.text(
            badgeLabel,
            badgeX + badgePaddingX,
            badgeY + badgeH - badgePaddingY - 0.2
          );
          doc.setTextColor(0, 0, 0);
        }

        // Subject content — vertically centered with top/bottom clamp
        let totalSubjectLines = 0;
        content.forEach((line) => {
          totalSubjectLines += doc.splitTextToSize(
            line,
            subjColWidth - 4
          ).length;
        });

        const totalSubjectHeight = (totalSubjectLines - 1) * lineSpacing;
        let subjectStartY = yPos + height / 2 - totalSubjectHeight / 2;
        if (isBridging) {
          subjectStartY += 2;
        }

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
              doc.text(wLine, xPos + subjColWidth / 2, subjectStartY, {
                align: 'center',
                baseline: 'middle',
              });
            }
            subjectStartY += lineSpacing;
          });
        });

        doc.setTextColor(0, 0, 0);

        // Room text — vertically centered with top/bottom clamp
        const roomText =
          item.room_code && item.room_code.trim() !== ''
            ? item.room_code
            : 'TBA';
        doc.setFontSize(roomFontSize);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);

        const wrappedRoom = doc.splitTextToSize(roomText, roomColWidth - 2);
        const roomLineSpacing = 3.2;
        const totalRoomHeight = (wrappedRoom.length - 1) * roomLineSpacing;
        let roomStartY = yPos + height / 2 - totalRoomHeight / 2;

        roomStartY = Math.max(roomStartY, yPos + 3.2);
        const maxRoomBoundary = yPos + height - 3;

        wrappedRoom.forEach((rLine: string) => {
          if (roomStartY <= maxRoomBoundary) {
            doc.text(
              rLine,
              xPos + subjColWidth + roomColWidth / 2,
              roomStartY,
              { align: 'center', baseline: 'middle' }
            );
          }
          roomStartY += roomLineSpacing;
        });
      });
    });
  }

  /**
   * Helper method to draw Room Schedule Table
   */
  /**
   * Helper method to draw Room Schedule Table using the component's format
   */
  private drawRoomScheduleTable(
    doc: jsPDF,
    scheduleData: any[],
    title: string,
    subtitle: string,
    startY: number,
    margin: number,
    pageWidth: number,
  ): void {
    const hasSchedules = scheduleData && scheduleData.length > 0;

    if (!hasSchedules) {
      return;
    }

    const days = [
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ];
    const timeColWidth = 22;
    const dayColumnWidth =
      (pageWidth - margin * 2 - timeColWidth) / days.length;
    const rowHeight = 8.5;

    // Split the day into Morning and Afternoon chunks
    const chunks = [
      { name: 'Morning (7:00 AM - 2:00 PM)', start: 420, end: 840 },
      { name: 'Afternoon (2:00 PM - 9:00 PM)', start: 840, end: 1260 },
    ];

    // Only process chunks that actually contain classes
    const activeChunks = chunks.filter((chunk) => {
      return scheduleData.some((s) => {
        const sStart = this.timeToMinutes(s.start_time);
        const sEnd = this.timeToMinutes(s.end_time);
        return Math.max(sStart, chunk.start) < Math.min(sEnd, chunk.end);
      });
    });

    if (activeChunks.length === 0) {
      return;
    }

    let pageUsed = false;
    let currentY = startY;

    activeChunks.forEach((chunk) => {
      if (pageUsed) {
        this.reportHeaderService.addStandardFooter(doc);
        doc.addPage();
        currentY = this.drawHeader(
          doc,
          15,
          pageWidth,
          margin,
          22,
          title,
          subtitle
        );
      }

      pageUsed = true;
      currentY -= 3;

      // --- Draw Headers ---
      doc.setFillColor(128, 0, 0);
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');

      // Time Header
      doc.rect(margin, currentY, timeColWidth, 10, 'F');
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.5);
      doc.rect(margin, currentY, timeColWidth, 10);
      doc.text(
        'Time',
        margin + timeColWidth / 2,
        currentY + 6.5,
        { align: 'center' }
      );

      // Day Headers
      days.forEach((day, index) => {
        const xPos = margin + timeColWidth + index * dayColumnWidth;
        doc.setFillColor(128, 0, 0);
        doc.rect(xPos, currentY, dayColumnWidth, 10, 'F');
        doc.rect(xPos, currentY, dayColumnWidth, 10);
        doc.text(
          day,
          xPos + dayColumnWidth / 2,
          currentY + 6.5,
          { align: 'center' }
        );
      });

      currentY += 10;

      // --- Draw Time Grid for this Chunk ---
      doc.setTextColor(0, 0, 0);
      const chunkSlots = this.timeSlots.filter(
        (s) => s.minutes >= chunk.start && s.minutes < chunk.end
      );

      chunkSlots.forEach((slot, index) => {
        const yPos = currentY + index * rowHeight;

        // Flag the top row, bottom row, and standard 3-hour gaps
        const isTopRow = index === 0;
        const isBottomRow = index === chunkSlots.length - 1;
        const isThreeHourGap =
          slot.minutes >= 450 && (slot.minutes - 450) % 180 === 0;

        if (isTopRow || isBottomRow || isThreeHourGap) {
          if (!isTopRow) {
            doc.setDrawColor(200, 200, 200);
            doc.setLineWidth(0.5);
            doc.line(margin, yPos, pageWidth - margin, yPos);
          }

          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          doc.text(
            slot.time,
            margin + timeColWidth / 2,
            yPos + 5,
            { align: 'center' }
          );
        }
      });

      const finalY = currentY + chunkSlots.length * rowHeight;
      doc.setDrawColor(200, 200, 200);

      // Bottom border
      doc.line(margin, finalY, pageWidth - margin, finalY);

      // Vertical Lines
      doc.line(margin, currentY, margin, finalY);
      doc.line(margin + timeColWidth, currentY, margin + timeColWidth, finalY);
      days.forEach((_, index) => {
        const xPos = margin + timeColWidth + (index + 1) * dayColumnWidth;
        doc.line(xPos, currentY, xPos, finalY);
      });

      // --- Draw the Blocks ---
      const mergedMap = new Map<string, any>();
      for (const item of scheduleData) {
        const key = `${item.day}|${item.start_time}|${item.end_time}`;
        if (mergedMap.has(key)) {
          const existing = mergedMap.get(key);
          if (!existing._mergedFaculty) {
            existing._mergedFaculty = [existing.faculty_name];
          }
          if (!existing._mergedFaculty.includes(item.faculty_name)) {
            existing._mergedFaculty.push(item.faculty_name);
          }
        } else {
          mergedMap.set(key, { ...item });
        }
      }
      const sortedScheduleData = [...mergedMap.values()].sort(
        (a, b) =>
          this.timeToMinutes(a.start_time) - this.timeToMinutes(b.start_time)
      );

      sortedScheduleData.forEach((item) => {
        const dayIndex = days.indexOf(item.day);
        if (dayIndex === -1) {
          return;
        }

        const originalStart = this.timeToMinutes(item.start_time);
        const originalEnd = this.timeToMinutes(item.end_time);

        const cappedStart = Math.max(originalStart, chunk.start);
        const cappedEnd = Math.min(originalEnd, chunk.end);

        if (cappedStart >= cappedEnd) {
          return;
        }

        const startSlot = chunkSlots.findIndex(
          (slot) => slot.minutes === cappedStart
        );
        const duration = Math.ceil((cappedEnd - cappedStart) / 30);

        if (startSlot === -1) {
          return;
        }

        const xPos = margin + timeColWidth + dayIndex * dayColumnWidth;
        const yPos = currentY + startSlot * rowHeight;
        const height = duration * rowHeight;

        doc.setFillColor(240, 240, 240);
        doc.setDrawColor(128, 0, 0);
        doc.setLineWidth(0.3);
        doc.rect(xPos, yPos, dayColumnWidth, height, 'FD');

        let startPadding = 5;
        let lineSpacing = 4.2;
        let bottomBoundary = 6;
        let codeFontSize = 10;
        let textFontSize = 9;
        let timeFontSize = 9.5;
        let timeBottomPadding = 2;

        if (duration <= 2) {
          startPadding = 3.5;
          lineSpacing = 2.8;
          bottomBoundary = 3.5;
          codeFontSize = 7.5;
          textFontSize = 6.5;
          timeFontSize = 7;
          timeBottomPadding = 1.2;
        } else if (duration === 3) {
          startPadding = 4;
          lineSpacing = 3.4;
          bottomBoundary = 4.5;
          codeFontSize = 8.5;
          textFontSize = 7.5;
          timeFontSize = 8;
          timeBottomPadding = 1.5;
        } else if (duration === 4) {
          startPadding = 5;
          lineSpacing = 4;
          bottomBoundary = 5;
          codeFontSize = 9.5;
          textFontSize = 8.5;
          timeFontSize = 9;
          timeBottomPadding = 1.8;
        }

        const timeString =
          `${this.formatTimeTo12Hour(item.start_time)} - ` +
          `${this.formatTimeTo12Hour(item.end_time)}`;
        doc.setTextColor(0);
        doc.setFontSize(timeFontSize);
        doc.setFont('helvetica', 'normal');
        doc.text(
          timeString,
          xPos + dayColumnWidth / 2,
          yPos + height - timeBottomPadding,
          { align: 'center' }
        );

        let facultyName = item.faculty_name || '';
        if (facultyName.trim().toUpperCase() === 'N/A') {
          facultyName = 'Faculty TBA';
        }

        const isBridging = item.course_details?.offering_type === 'bridging';

        const content = [
          item.course_details?.course_code || '',
          item.course_details?.course_title || '',
          facultyName,
          item.room_code && item.room_code.trim() !== ''
            ? item.room_code
            : 'Room TBA',
        ].filter((line) => line !== '');

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
          const badgeX = xPos + (dayColumnWidth - badgeW) / 2;
          const badgeY =
            textY - lineSpacing + (duration <= 2 ? 0.5 : 1);
          doc.setFillColor(128, 0, 0);
          doc.setDrawColor(128, 0, 0);
          doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 1, 1, 'FD');
          doc.setTextColor(255, 255, 255);
          doc.text(
            badgeLabel,
            badgeX + badgePaddingX,
            badgeY + badgeH - badgePaddingY - 0.2
          );
          doc.setTextColor(0, 0, 0);
          textY += badgeH + (duration <= 2 ? 0.5 : 1.5);
        }

        content.forEach((line, idx) => {
          doc.setFontSize(idx === 0 ? codeFontSize : textFontSize);
          doc.setFont('helvetica', idx === 0 ? 'bold' : 'normal');

          const wrappedLines = doc.splitTextToSize(line, dayColumnWidth - 2);
          wrappedLines.forEach((wLine: string) => {
            if (textY < yPos + height - bottomBoundary) {
              doc.text(
                wLine,
                xPos + dayColumnWidth / 2,
                textY,
                { align: 'center' }
              );
            }
            textY += lineSpacing;
          });
        });
      });
    });
  }

  /**
   * Helper method to format time from "HH:MM" to "H:MM AM/PM"
   */
  private formatTime(time: string): string {
    const [hours, minutes] = time.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const formattedHours = hours % 12 || 12;
    return `${formattedHours}:${minutes.toString().padStart(2, '0')} ${period}`;
  }

  /**
   * Helper method to convert time to minutes
   */
  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Helper method to get semester display string
   */
  private getSemesterDisplay(semester: number): string {
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

  /**
   * Helper method to get academic year subtitle
   */
  private getAcademicYearSubtitle(entity: Faculty | Program | Room): string {
    if ('academicYear' in entity && 'semester' in entity) {
      return `For Academic Year ${entity.academicYear}, ${entity.semester}`;
    }
    return '';
  }

  /**
   * Helper method to draw a generic schedule table
   * (Can be extended for other report types if needed)
   */
  private drawGenericScheduleTable(
    doc: jsPDF,
    scheduleData: any[],
    startY: number,
    margin: number,
    pageWidth: number,
    entityType: 'faculty' | 'program' | 'room',
  ): void {
    /* Implementation can be similar to the specific tables above
     This is a placeholder for potential future use
     */
  }

  // Generates time slots from 7:00 AM to 9:00 PM at 30-minute intervals
  private generateTimeSlots(): void {
    const startTime = 7 * 60; // 7:00 AM
    const endTime = 21 * 60; // 9:00 PM
    const interval = 30;
    this.timeSlots = [];

    for (let time = startTime; time <= endTime; time += interval) {
      const hours = Math.floor(time / 60);
      const mins = time % 60;
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const h = hours % 12 || 12;
      const timeStr = `${h}:${mins.toString().padStart(2, '0')} ${ampm}`;
      this.timeSlots.push({ time: timeStr, minutes: time });
    }
  }

  // Formats time range to 12 hour AM/PM display
  private formatTimeTo12Hour(time: string): string {
    return this.formatTime(time);
  }
}

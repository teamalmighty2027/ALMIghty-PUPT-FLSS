import { 
  Component, OnInit, OnDestroy, ChangeDetectorRef 
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Observable, Subject, forkJoin, of, from } from 'rxjs';
import { 
  takeUntil, catchError, switchMap, tap, concatMap, finalize, map 
} from 'rxjs/operators';
import { 
  fadeAnimation, pageFloatUpAnimation 
} from '../../../../animations/animations';

import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTableModule } from '@angular/material/table';
import { LoadingComponent } from '../../../../../shared/loading/loading.component';
import { 
  DialogSchedulingComponent 
} from '../../../../../shared/dialog-scheduling/dialog-scheduling.component';
import { 
  DialogGenericComponent 
} from '../../../../../shared/dialog-generic/dialog-generic.component';
import { 
  TableDialogComponent 
} from '../../../../../shared/table-dialog/table-dialog.component';

import { 
  DraftStateService 
} from '../../../../services/admin/scheduling/draft-state.service';
import { 
  SchedulingService, CacheType 
} from '../../../../services/admin/scheduling/scheduling.service';
import { 
  AcademicYearService 
} from '../../../../services/admin/academic-year/academic-year.service';
import { 
  PermissionService 
} from '../../../../services/permission/permission.service';
import { 
  Schedule, 
  AcademicYear, 
  Semester, 
  Program, 
  YearLevel, 
  PopulateSchedulesResponse, 
  CourseResponse, 
  ProgramOption, 
  SectionOption,
  DraftEntry
} from '../../../../models/scheduling.model';

interface CourseOffering {
  schedule_id?: number;
  section_course_id: number;
  course_id: number;
  course_code: string;
  course_title: string;
  lec_hours: number;
  lab_hours: number;
  units: number;
  tuition_hours: number;
  day: string;
  time: string;
  start_time: string | null;
  end_time: string | null;
  professor: string;
  room: string;
  program_id: number;
  program_code: string;
  program_title: string;
  year: number;
  section_id: number;
  section: string;
  is_copy: number;
  is_temporary: boolean;
  temporary_type: string | null;
  temporary_status: string | null;
  petition_required: boolean;
  temporary_course_offering_id: number | null;
  elective_id: number | null;
  combined_with_program_id?: number | null;
  isLastInGroup?: boolean;
  elective_slot_name?: string | null;
}

interface CourseGroup {
  course_code: string;
  course_title: string;
  lec_hours: number;
  lab_hours: number;
  units: number;
  isGenEd: boolean;
  offerings: CourseOffering[];
  programsSet: Set<number>;
}

@Component({
  selector: 'app-course-centric-scheduling',
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
    LoadingComponent
  ],
  templateUrl: './course-centric-scheduling.component.html',
  styleUrls: ['./course-centric-scheduling.component.scss'],
  animations: [fadeAnimation, pageFloatUpAnimation]
})
export class CourseCentricSchedulingComponent implements OnInit, OnDestroy {
  displayedColumns: string[] = [
    'section', 'day', 'time', 'professor', 'room', 'action'
  ];

  isLoading = true;
  loadingScheduleId: number | null = null;
  activeYear = '';
  activeSemester = 0;
  activeSemesterId = 0;
  activeSemesterRecordId: number | null = null;
  activeAcademicYearId: number | null = null;
  startDate = '';
  endDate = '';

  allCourses: { code: string; title: string; isGenEd: boolean }[] = [];
  programOptions: { id: number; code: string; display: string }[] = [];
  rawProgramOptions: ProgramOption[] = [];

  selectedCourseCode = 'All';
  selectedProgramId: number | string = 'All';

  isDraftMode = false;
  isHistoricalLoading = false;
  isAiFilling = false;
  aiFillProgress = { current: 0, total: 0 };
  schedules: Schedule[] = [];
  draftSchedules: Schedule[] = [];

  get tableData(): Schedule[] {
    return this.isDraftMode ? this.draftSchedules : this.schedules;
  }

  courseGroups: CourseGroup[] = [];
  filteredGroups: CourseGroup[] = [];

  timeOptions: string[] = [];
  dayOptions: string[] = [
    'Monday', 'Tuesday', 'Wednesday', 'Thursday', 
    'Friday', 'Saturday', 'Sunday'
  ];

  private destroy$ = new Subject<void>();

  constructor(
    private schedulingService: SchedulingService,
    private academicYearService: AcademicYearService,
    private permissionService: PermissionService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private draftStateService: DraftStateService
  ) {}

  // Initializes time options and triggers data loading on component mount
  ngOnInit(): void {
    this.generateTimeOptions();

    // Pre-fetch scheduling metadata to optimize dialog opening speed
    this.schedulingService.getAllRooms().pipe(
      takeUntil(this.destroy$)
    ).subscribe();

    this.schedulingService.getFacultyDetails().pipe(
      takeUntil(this.destroy$)
    ).subscribe();

    this.schedulingService.getSubmittedPreferencesForActiveSemester().pipe(
      takeUntil(this.destroy$)
    ).subscribe();

    this.loadData();
  }

  // Cleans up active subscriptions on component destruction
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // Navigates back to the main section-centric scheduling component
  goBack(): void {
    this.router.navigate(['/admin/scheduling']);
  }

  // Generates time slots in 30-minute intervals from 7:00 AM to 9:00 PM
  private generateTimeOptions(): void {
    const startHour = 7;
    const endHour = 21;

    for (let hour = startHour; hour < endHour; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const time = this.formatTime(hour, minute);
        this.timeOptions.push(time);
      }
    }

    this.timeOptions.push(this.formatTime(endHour, 0));
  }

  // Formats hour and minute integer values into standard 12-hour AM/PM string
  private formatTime(hour: number, minute: number): string {
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    const displayMinute = minute === 0 
      ? '00' 
      : minute.toString().padStart(2, '0');

    return `${displayHour}:${displayMinute} ${period}`;
  }

  // Formats standard database time string (HH:MM:SS) into 12-hour AM/PM format
  private formatTimeFromString(timeStr: string | null | undefined): string {
    if (!timeStr) {
      return 'Not set';
    }

    const [hourStr, minuteStr] = timeStr.split(':');
    const hour = parseInt(hourStr, 10);
    const minute = parseInt(minuteStr, 10);

    return this.formatTime(hour, minute);
  }

  // formats backend preference times which are already HH:MM:SS strings
  private formatTimeFromBackend(timeStr: string): string {
    if (!timeStr) return 'Not set';
    const [hour, minute] = timeStr.split(':').map(Number);

    return this.formatTime(hour, minute);
  }

  // Formats start and end times together into a readable range string
  private getFormattedTime(startTime?: string, endTime?: string): string {
    if (!startTime && !endTime) {
      return 'Not set';
    }

    const formattedStartTime = startTime 
      ? this.formatTimeFromString(startTime) 
      : 'Not set';
    const formattedEndTime = endTime 
      ? this.formatTimeFromString(endTime) 
      : 'Not set';

    if (formattedStartTime === 'Not set' && formattedEndTime === 'Not set') {
      return 'Not set';
    } else if (formattedStartTime === 'Not set') {
      return formattedEndTime;
    } else if (formattedEndTime === 'Not set') {
      return formattedStartTime;
    }

    return `${formattedStartTime} - ${formattedEndTime}`;
  }

  // Maps active semester numeric ID to descriptive UI string label
  private mapSemesterNumberToLabel(semesterNumber: number): string {
    switch (semesterNumber) {
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

  // Returns active semester label for template display
  get activeSemesterLabel(): string {
    return this.mapSemesterNumberToLabel(this.activeSemester);
  }

  // Fetches schedule tree, program curricula list, and active semester metadata
  loadData(forceRefresh = false): void {
    // Delay loading spinner to prevent UI flash/flicker if cached
    const loadingTimeout = setTimeout(() => {
      this.isLoading = true;
      this.cdr.detectChanges();
    }, 150);

    forkJoin({
      activeTerm: this.academicYearService.getActiveYearAndSemester(),
      programs: this.schedulingService.getActiveYearLevelsCurricula(),
      schedules: this.schedulingService.populateSchedules(forceRefresh)
    }).pipe(
      takeUntil(this.destroy$),
      catchError((error) => {
        clearTimeout(loadingTimeout);
        console.error('Failed to load course-centric scheduling data', error);
        this.snackBar.open('Failed to load scheduling data.', 'Close', {
          duration: 5000
        });
        this.isLoading = false;
        this.cdr.detectChanges();
        return of(null);
      })
    ).subscribe((data) => {
      clearTimeout(loadingTimeout);
      if (!data) return;

      this.activeYear = data.activeTerm.activeYear;
      this.activeSemester = data.activeTerm.activeSemester;
      this.startDate = data.activeTerm.startDate;
      this.endDate = data.activeTerm.endDate;

      this.isSubmissionEnabled = data.schedules.is_submission_enabled;
      this.activeAcademicYearId = data.schedules.academic_year_id;
      this.activeSemesterId = data.schedules.semester_id;
      this.activeSemesterRecordId = data.schedules.active_semester_id;

      // Filter and map program options
      const allowedPrograms = this.permissionService.getAllowedPrograms();
      const hasFullAccess = this.permissionService.hasFullProgramAccess();
      const filteredProgramsData = hasFullAccess
        ? data.programs
        : data.programs.filter((p) => allowedPrograms.includes(p.program_id));

      this.rawProgramOptions = filteredProgramsData;
      this.programOptions = filteredProgramsData.map((p) => ({
        id: p.program_id,
        code: p.program_code,
        display: `${p.program_code} - ${p.program_title}`
      }));

      this.processSchedules(data.schedules);

      // If draft state is active (dirty entries exist), auto-activate Draft Mode
      if (this.draftStateService.hasDirtyEntries()) {
        this.isDraftMode = true;
        this.draftSchedules = JSON.parse(JSON.stringify(this.schedules));
        this.rebuildDraftSchedules();
      }

      this.isLoading = false;
      this.cdr.detectChanges();
    });
  }

  isSubmissionEnabled = 0;

  // Process raw schedules response tree into flat schedules
  private processSchedules(response: PopulateSchedulesResponse): void {
    const schedulesList: Schedule[] = [];
    const allowedPrograms = this.permissionService.getAllowedPrograms();
    const hasFullAccess = this.permissionService.hasFullProgramAccess();

    response.programs.forEach((program) => {
      // Enforce program level permission constraints
      if (!hasFullAccess && !allowedPrograms.includes(program.program_id)) {
        return;
      }

      program.year_levels.forEach((yl) => {
        yl.semesters.forEach((sem) => {
          if (sem.semester === response.semester_id) {
            sem.sections.forEach((section) => {
              section.courses.forEach((course) => {
                schedulesList.push({
                  schedule_id: course.schedule?.schedule_id,
                  section_course_id: course.section_course_id,
                  course_id: course.course_id,
                  course_code: course.course_code,
                  course_title: course.course_title,
                  lec_hours: course.lec_hours,
                  lab_hours: course.lab_hours,
                  units: course.units,
                  tuition_hours: course.tuition_hours,
                  day: course.schedule?.day || 'Not set',
                  time: this.getFormattedTime(
                    course.schedule?.start_time,
                    course.schedule?.end_time
                  ),
                  start_time: course.schedule?.start_time || null,
                  end_time: course.schedule?.end_time || null,
                  professor: course.professor || 'Not set',
                  room: course.room?.room_code || 'Not set',
                  program_id: program.program_id,
                  program_code: program.program_code,
                  program: program.program_title,
                  year: yl.year_level,
                  section_id: section.section_per_program_year_id,
                  section: section.section_name,
                  is_copy: course.is_copy || 0,
                  is_temporary: !!course.is_temporary,
                  temporary_type: course.temporary_type ?? null,
                  temporary_status: course.temporary_status ?? null,
                  petition_required: !!course.petition_required,
                  temporary_course_offering_id: 
                    course.temporary_course_offering_id ?? null,
                  elective_id: course.schedule?.elective_id ?? null,
                  combined_with_program_id: 
                    (course.schedule as any)?.combined_with_program_id ?? null,
                  elective_slot_name: course.schedule?.elective_slot_name ?? null,
                  isLastInGroup: false
                } as any);
              });
            });
          }
        });
      });
    });

    this.schedules = schedulesList;
    this.rebuildCourseGroups();
  }

  // Rebuilds grouped course offerings from flat schedules list
  private rebuildCourseGroups(): void {
    const courseMap = new Map<string, CourseGroup>();

    this.tableData.forEach((s) => {
      const code = s.course_code;
      const title = s.course_title;

      if (!courseMap.has(code)) {
        const isGenEd = this.checkIsGenEd(code);

        courseMap.set(code, {
          course_code: code,
          course_title: title,
          lec_hours: s.lec_hours,
          lab_hours: s.lab_hours,
          units: s.units,
          isGenEd: isGenEd,
          offerings: [],
          programsSet: new Set<number>()
        });
      }

      const group = courseMap.get(code)!;
      group.programsSet.add((s as any).program_id!);

      group.offerings.push({
        schedule_id: s.schedule_id,
        section_course_id: s.section_course_id,
        course_id: s.course_id,
        course_code: s.course_code,
        course_title: s.course_title,
        lec_hours: s.lec_hours,
        lab_hours: s.lab_hours,
        units: s.units,
        tuition_hours: s.tuition_hours,
        day: s.day,
        time: s.time,
        start_time: s.start_time ?? null,
        end_time: s.end_time ?? null,
        professor: s.professor,
        room: s.room,
        program_id: (s as any).program_id!,
        program_code: s.program_code,
        program_title: s.program,
        year: s.year,
        section_id: (s as any).section_id!,
        section: s.section,
        is_copy: s.is_copy || 0,
        is_temporary: !!s.is_temporary,
        temporary_type: s.temporary_type ?? null,
        temporary_status: s.temporary_status ?? null,
        petition_required: !!s.petition_required,
        temporary_course_offering_id: s.temporary_course_offering_id ?? null,
        elective_id: s.elective_id ?? null,
        combined_with_program_id: s.combined_with_program_id,
        elective_slot_name: s.elective_slot_name
      });
    });

    this.courseGroups = Array.from(courseMap.values()).map((group) => {
      // Re-evaluate if course is Gen Ed by checking if offered in > 1 program
      if (group.programsSet.size > 1) {
        group.isGenEd = true;
      }
      return group;
    }).filter((group) => {
      // Only include GEED, NSTP, and PATHFit courses
      return /^(GEED|NSTP|PATHFit)/i.test(group.course_code);
    }).sort((a, b) => a.course_code.localeCompare(b.course_code));

    // Populate dropdown selection options
    this.allCourses = this.courseGroups.map((g) => ({
      code: g.course_code,
      title: g.course_title,
      isGenEd: g.isGenEd
    }));

    this.applyFilters();
  }

  // Checks course code prefix for Gen Ed classification
  private checkIsGenEd(code: string): boolean {
    return /^(GEED|NSTP|PATHFit)/i.test(code);
  }

  // Returns all dropdown course options
  get filteredDropdownCourses(): {
    code: string;
    title: string;
    isGenEd: boolean;
  }[] {
    return this.allCourses;
  }

  // Triggers filtering cascade when selection changes
  onFilterChange(): void {
    if (this.isDraftMode) {
      this.exitDraftInternal();
      this.snackBar.open(
        'Exited draft mode and discarded unsaved changes.',
        'Close',
        { duration: 3000 }
      );
    }
    this.applyFilters();
  }

  // Filters the course offerings grid by course code and program selection
  private applyFilters(): void {
    let groups = this.courseGroups;

    // Filter by selected course from dropdown
    if (this.selectedCourseCode !== 'All') {
      groups = groups.filter((g) => g.course_code === this.selectedCourseCode);
    }

    // Filter the offerings list in each group by the selected Program filter
    this.filteredGroups = groups.map((g) => {
      let offerings = g.offerings;

      if (this.selectedProgramId !== 'All') {
        const progId = Number(this.selectedProgramId);
        offerings = offerings.filter(
          (o) => o.program_id === progId
        );
      }

      return {
        ...g,
        offerings: offerings
      };
    }).filter((g) => g.offerings.length > 0);
  }

  // Opens schedule configuration dialog for the selected section offering
  editSchedule(offering: CourseOffering): void {
    if (!offering.schedule_id) {
      this.snackBar.open('Schedule ID is missing.', 'Close', {
        duration: 3000
      });
      return;
    }

    this.loadingScheduleId = offering.schedule_id;

    forkJoin({
      rooms: this.schedulingService.getAllRooms(),
      faculty: this.schedulingService.getFacultyDetails(),
      preferences:
        this.schedulingService.getSubmittedPreferencesForActiveSemester()
    }).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: ({ rooms, faculty, preferences }) => {
        this.loadingScheduleId = null;
        const availableRooms = rooms.rooms.filter(
          (room) => room.status === 'Available'
        );

        const roomOptions = [
          ...availableRooms.map((room) => room.room_code), 'TBA'
        ].filter((val, idx, arr) => arr.indexOf(val) === idx);

        const professorOptions = faculty.faculty.map(
          (professor) => professor.name
        );

        // Map offering back to a standard Schedule model
        const schedule: Schedule = {
          schedule_id: offering.schedule_id,
          section_course_id: offering.section_course_id,
          course_id: offering.course_id,
          course_code: offering.course_code,
          course_title: offering.course_title,
          lec_hours: offering.lec_hours,
          lab_hours: offering.lab_hours,
          units: offering.units,
          tuition_hours: offering.tuition_hours,
          day: offering.day,
          time: offering.time,
          start_time: offering.start_time,
          end_time: offering.end_time,
          professor: offering.professor,
          room: offering.room,
          program: offering.program_title,
          program_code: offering.program_code,
          year: offering.year,
          curriculum: '',
          section: offering.section,
          is_copy: offering.is_copy,
          is_temporary: offering.is_temporary,
          temporary_type: offering.temporary_type,
          temporary_status: offering.temporary_status,
          petition_required: offering.petition_required,
          temporary_course_offering_id: offering.temporary_course_offering_id,
          elective_id: offering.elective_id,
          combined_with_program_id: offering.combined_with_program_id,
          elective_slot_name: offering.elective_slot_name,
          isLastInGroup: false
        };

        const selectedProgramInfo = `${schedule.program_code} ${offering.year}-${offering.section}`;
        const selectedCourseInfo = `${schedule.course_code} - ${schedule.course_title}`;
        const sectionId = offering.section_id;

        // Parse suggested faculty preferences
        interface SuggestedFacultyPreference {
          day: string;
          time: string;
          program_code: string;
        }

        interface SuggestedFaculty {
          faculty_id: number;
          name: string;
          type: string;
          preferences: SuggestedFacultyPreference[];
          prefIndex: number;
        }

        const suggestedFaculty: SuggestedFaculty[] = [];

        preferences.preferences.forEach((pref) => {
          const facultyDetails = faculty.faculty.find(
            (f) => f.faculty_id === pref.faculty_id
          );
          if (!facultyDetails) return;

          pref.active_semesters.forEach((semester) => {
            semester.courses.forEach((course: any) => {
              if (course.is_ignored) return;

              const prefSectionId = course.section_details?.section_id;

              if (
                course.course_details.course_id === schedule.course_id &&
                prefSectionId === sectionId
              ) {
                const existingFaculty = suggestedFaculty.find(
                  (f) => f.faculty_id === facultyDetails.faculty_id
                );

                const facultyPref: SuggestedFaculty = {
                  faculty_id: facultyDetails.faculty_id,
                  name: facultyDetails.name,
                  type: facultyDetails.faculty_type,
                  preferences: course.preferred_days.map((prefDay: any) => ({
                    day: prefDay.day,
                    time: `${this.formatTimeFromBackend(
                      prefDay.start_time
                    )} - ${this.formatTimeFromBackend(prefDay.end_time)}`,
                    program_code: course.course_details.program_code
                  })),
                  prefIndex: 0
                };

                if (existingFaculty) {
                  existingFaculty.preferences.push(...facultyPref.preferences);
                } else {
                  suggestedFaculty.push(facultyPref);
                }
              }
            });
          });
        });

        let combinedProgramCode: string | null = null;
        if (schedule.combined_with_program_id && this.programOptions.length > 0) {
          const combinedProgram = this.programOptions.find(
            (p) => p.id === schedule.combined_with_program_id
          );
          combinedProgramCode = combinedProgram?.code || null;
        }

        const timeToMinutes = (timeStr: string): number => {
          const [hours, minutes] = timeStr.split(':').map(Number);
          return hours * 60 + minutes;
        };

        // Gather all other section schedules for this course to calc hours
        const courseSchedules: Schedule[] = [];
        this.courseGroups.forEach((g) => {
          if (g.course_code === schedule.course_code) {
            g.offerings.forEach((o) => {
              if (
                o.section_course_id === offering.section_course_id &&
                o.schedule_id !== schedule.schedule_id &&
                o.day &&
                o.day !== 'Not set'
              ) {
                courseSchedules.push({
                  course_id: o.course_id,
                  course_code: o.course_code,
                  course_title: o.course_title,
                  lec_hours: o.lec_hours,
                  lab_hours: o.lab_hours,
                  units: o.units,
                  tuition_hours: o.tuition_hours,
                  day: o.day,
                  time: o.time,
                  start_time: o.start_time,
                  end_time: o.end_time,
                  professor: o.professor,
                  room: o.room,
                  program: o.program_title,
                  program_code: o.program_code,
                  year: o.year,
                  curriculum: '',
                  section: o.section,
                  is_copy: o.is_copy,
                  section_course_id: o.section_course_id,
                  isLastInGroup: false
                });
              }
            });
          }
        });

        let hoursAlreadyAssigned = 0;
        courseSchedules.forEach((s) => {
          if (s.start_time && s.end_time) {
            hoursAlreadyAssigned +=
              (timeToMinutes(s.end_time) - timeToMinutes(s.start_time)) / 60;
          }
        });

        // Open Dialog
        const dialogRef = this.dialog.open(DialogSchedulingComponent, {
          maxWidth: '80rem',
          width: '95vw',
          height: 'auto',
          maxHeight: '90vh',
          autoFocus: true,
          data: {
            program: {
              id: offering.program_id,
              info: selectedProgramInfo
            },
            academic: {
              year_level: offering.year,
              section_id: sectionId
            },
            options: {
              dayOptions: this.dayOptions,
              timeOptions: [...this.timeOptions],
              endTimeOptions: [...this.timeOptions],
              professorOptions: professorOptions,
              roomOptions: roomOptions
            },
            facultyOptions: faculty.faculty,
            roomOptionsList: availableRooms,
            selectedProgramInfo: selectedProgramInfo,
            selectedCourseInfo: selectedCourseInfo,
            suggestedFaculty: suggestedFaculty,
            existingSchedule: {
              day: schedule.day,
              time: schedule.time,
              professor: schedule.professor,
              room: schedule.room
            },
            schedule_id: schedule.schedule_id,
            course_id: schedule.course_id,
            isDraftMode: this.isDraftMode,
            isTemporaryCourse: schedule.is_temporary,
            isBridgingCourse: schedule.is_temporary &&
              schedule.temporary_type === 'bridging',
            bridging_course_id: schedule.bridging_course_id,
            combined_with_program_id: schedule.combined_with_program_id,
            combined_with_program_code: combinedProgramCode,
            hoursAlreadyAssigned,
            lec_hours: schedule.lec_hours,
            lab_hours: schedule.lab_hours
          }
        });

        dialogRef.afterClosed().subscribe((result) => {
          if (!result) return;

          if (this.isDraftMode && result.isDraft) {
            const entry: DraftEntry = {
              ...result,
              schedule_id: schedule.schedule_id,
              hasConflict: false
            };
            this.draftStateService.set(schedule.schedule_id!, entry);
            this.runConflictCheck(entry).subscribe(() => {
              this.rebuildDraftSchedules();
              this.snackBar.open(
                `Draft updated for ${schedule.course_code}. ` +
                `Save to apply permanently.`,
                'Close',
                { duration: 3000 }
              );
            });
            return;
          }

          this.snackBar.open(
            `Schedule for ${schedule.course_code} - ${schedule.course_title} ` +
            `has been successfully updated.`,
            'Close',
            { duration: 3000 }
          );

          this.schedulingService.resetCaches([CacheType.Schedules]);
          this.loadData(true);
        });
      },
      error: (error) => {
        this.loadingScheduleId = null;
        console.error('Failed to fetch dialog options', error);
        this.snackBar.open(
          'Failed to open edit dialog. Please try again.', 
          'Close', 
          { duration: 3000 }
        );
      }
    });
  }

  // Toggles between Draft Mode and Live Mode
  protected toggleDraftMode(): void {
    if (!this.isDraftMode) {
      this.draftSchedules = JSON.parse(JSON.stringify(this.schedules));
      this.draftStateService.initFromSchedules(this.schedules);
      this.isDraftMode = true;
      this.rebuildCourseGroups();
    } else {
      if (this.draftStateService.hasDirtyEntries()) {
        const dialogRef = this.dialog.open(DialogGenericComponent, {
          data: {
            title: 'Exit Draft Mode?',
            content: 'You have unsaved changes. Exiting will discard your draft.',
            actionText: 'Discard & Exit',
            cancelText: 'Stay in Draft',
            action: 'confirm'
          }
        });

        dialogRef.afterClosed().subscribe((result) => {
          if (result === 'confirm') {
            this.exitDraftInternal();
          }
        });
      } else {
        this.exitDraftInternal();
      }
    }
  }

  // Discards draft and exits draft mode
  private exitDraftInternal(): void {
    this.isDraftMode = false;
    this.draftSchedules = [];
    this.draftStateService.clear();
    this.rebuildCourseGroups();
    this.cdr.detectChanges();
    this.snackBar.open(
      'Draft Mode closed. All unsaved changes discarded.',
      'Close',
      { duration: 3000 }
    );
  }

  // Discards draft changes
  protected discardDraft(): void {
    const dialogRef = this.dialog.open(DialogGenericComponent, {
      data: {
        title: 'Discard Draft?',
        content: 'All unsaved changes will be lost permanently.',
        actionText: 'Discard',
        cancelText: 'Cancel',
        action: 'confirm'
      }
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result === 'confirm') {
        this.exitDraftInternal();
        this.toggleDraftMode();
      }
    });
  }

  // Saves draft changes to database
  protected saveDraft(): void {
    const dirtyEntries = this.draftStateService.getDirty();
    if (dirtyEntries.length === 0) {
      this.snackBar.open('No changes to save.', 'Close', { duration: 3000 });
      return;
    }

    const conflicted = dirtyEntries.filter((e: any) => e.hasConflict);
    const toSave = dirtyEntries.filter((e: any) => !e.hasConflict);

    if (toSave.length === 0 && conflicted.length > 0) {
      this.snackBar.open(
        'Cannot save: All changes have conflicts. Resolve them first.',
        'Close',
        { duration: 5000 }
      );
      return;
    }

    const saveStream$ = new Subject<any>();
    
    import('../../../../../shared/dialog-draft-save/dialog-draft-save.component')
      .then(({ DialogDraftSaveComponent }) => {
        const dialogRef = this.dialog.open(DialogDraftSaveComponent, {
          data: {
            dirtyEntries: toSave,
            skippedEntries: conflicted,
            saveStream$: saveStream$.asObservable()
          },
          width: '500px'
        });

        from(toSave).pipe(
          concatMap((entry: any) => {
            saveStream$.next({
              schedule_id: entry.schedule_id,
              status: 'saving'
            });

            const originalSchedule = this.schedules.find(
              (s) => s.schedule_id === entry.schedule_id
            );
            const programId = (originalSchedule as any)?.program_id || 0;
            const year = originalSchedule?.year || 1;
            const sectionId = (originalSchedule as any)?.section_id || 0;
            
            return this.schedulingService.assignSchedule(
              entry.schedule_id,
              entry.faculty_id,
              entry.room_id,
              entry.day,
              entry.start_time,
              entry.end_time,
              programId,
              year,
              sectionId
            ).pipe(
              tap(() => {
                saveStream$.next({
                  schedule_id: entry.schedule_id,
                  status: 'success'
                });
              }),
              catchError((err) => {
                saveStream$.next({
                  schedule_id: entry.schedule_id,
                  status: 'error',
                  errorMessage: err.error?.message || 'Update failed'
                });
                return of(null);
              })
            );
          }),
          finalize(() => {
            saveStream$.complete();
          })
        ).subscribe();

        dialogRef.afterClosed().subscribe((refresh) => {
          if (refresh) {
            this.isDraftMode = false;
            this.exitDraftInternal();
            this.schedulingService.resetCaches([CacheType.Schedules]);
            this.loadData(true);
          }
        });
      });
  }

  // Rebuilds draft schedules array based on draftStateService updates
  private rebuildDraftSchedules(): void {
    this.draftSchedules = this.draftSchedules.map((schedule) => {
      const draft = this.draftStateService.get(schedule.schedule_id!);
      if (draft) {
        return {
          ...schedule,
          faculty_id: draft.faculty_id || undefined,
          professor: draft.faculty_name,
          room_id: draft.room_id || undefined,
          room: draft.room_code,
          day: draft.day || 'Not set',
          start_time: draft.start_time,
          end_time: draft.end_time,
          time: this.getFormattedTime(
            draft.start_time || undefined,
            draft.end_time || undefined
          )
        };
      }
      return schedule;
    });
    this.rebuildCourseGroups();
    this.cdr.detectChanges();
  }

  // Helper checks if an offering is dirty in draft mode
  protected isDraftDirty(offering: CourseOffering): boolean {
    if (!offering.schedule_id) return false;
    return this.draftStateService.isIdDirty(offering.schedule_id);
  }

  // Helper checks if an offering has an AI conflict in draft mode
  protected isDraftConflict(offering: CourseOffering): boolean {
    if (!offering.schedule_id) return false;
    return !!this.draftStateService.get(offering.schedule_id)?.hasConflict;
  }

  // Triggers historical schedule fill dialog
  protected openHistoricalDialog(): void {
    this.academicYearService.getAcademicYears()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (years) => {
          const yearOptions = years.map(y => ({
            label: y.academic_year,
            value: y.academic_year_id
          }));

          const semesterOptions = [
            { label: 'First Semester', value: 1 },
            { label: 'Second Semester', value: 2 },
            { label: 'Summer', value: 3 }
          ];

          const dialogRef = this.dialog.open(TableDialogComponent, {
            data: {
              title: 'Select Historical Term',
              fields: [
                {
                  label: 'Academic Year',
                  formControlName: 'academic_year_id',
                  type: 'select',
                  options: yearOptions,
                  required: true
                },
                {
                  label: 'Semester',
                  formControlName: 'semester_id',
                  type: 'select',
                  options: semesterOptions,
                  required: true
                }
              ],
              isEdit: false
            }
          });

          dialogRef.afterClosed()
            .pipe(takeUntil(this.destroy$))
            .subscribe(result => {
              if (result) {
                this.applyHistoricalSchedules(
                  result.academic_year_id,
                  result.semester_id
                );
              }
            });
        },
        error: () => {
          this.snackBar.open('Failed to load academic years.', 'Close', {
            duration: 3000
          });
        }
      });
  }

  // Fetches and applies historical schedules matching Gen Ed slots
  private applyHistoricalSchedules(
    academic_year_id: number,
    semester_id: number
  ): void {
    this.isHistoricalLoading = true;
    this.cdr.detectChanges();

    this.schedulingService.getHistoricalSchedules(
      academic_year_id,
      semester_id
    ).subscribe({
      next: (response) => {
        const historicalSchedules: any[] = [];
        response.programs.forEach((program: any) => {
          program.year_levels.forEach((yl: any) => {
            yl.semesters.forEach((sem: any) => {
              if (sem.semester === Number(response.semester_id)) {
                sem.sections.forEach((section: any) => {
                  section.courses.forEach((course: any) => {
                    historicalSchedules.push({
                      course_code: course.course_code,
                      section: section.section_name,
                      program_code: program.program_code,
                      is_copy: course.is_copy || 0,
                      schedule: course.schedule,
                      faculty_id: course.faculty_id,
                      professor: course.professor,
                      room: course.room
                    });
                  });
                });
              }
            });
          });
        });

        const emptyOfferings: any[] = [];
        this.filteredGroups.forEach((group) => {
          group.offerings.forEach((offering) => {
            if (offering.day === 'Not set' || offering.day === null) {
              emptyOfferings.push(offering);
            }
          });
        });

        if (emptyOfferings.length === 0) {
          this.snackBar.open(
            'No empty slots in the current filtered view to fill.',
            'Close',
            { duration: 3000 }
          );
          this.isHistoricalLoading = false;
          this.cdr.detectChanges();
          return;
        }

        const emptySlots = this.draftSchedules.filter((s) =>
          emptyOfferings.some((eo) => eo.schedule_id === s.schedule_id)
        );
        let matchCount = 0;
        const filledEntries: DraftEntry[] = [];

        emptySlots.forEach(slot => {
          const matched = historicalSchedules.find(hs => 
            hs.course_code.trim().toLowerCase() ===
              slot.course_code.trim().toLowerCase() &&
            hs.section.trim().toLowerCase() ===
              slot.section?.trim().toLowerCase() &&
            hs.program_code.trim().toLowerCase() ===
              slot.program_code?.trim().toLowerCase() &&
            Number(hs.is_copy) === Number(slot.is_copy)
          );

          if (
            matched &&
            matched.schedule &&
            matched.schedule.day &&
            matched.schedule.day !== 'Not set' &&
            matched.schedule.start_time &&
            matched.schedule.start_time !== 'Not set' &&
            matched.schedule.end_time &&
            matched.schedule.end_time !== 'Not set'
          ) {
            const entry: DraftEntry = {
              schedule_id: slot.schedule_id!,
              faculty_id: matched.faculty_id || null,
              faculty_name: matched.professor || 'Not set',
              room_id: matched.schedule.room_id || null,
              room_code: matched.room?.room_code || 'Not set',
              day: matched.schedule.day,
              start_time: matched.schedule.start_time,
              end_time: matched.schedule.end_time,
              hasConflict: false
            };
            this.draftStateService.set(slot.schedule_id!, entry);
            filledEntries.push(entry);
            matchCount++;
          }
        });

        if (matchCount === 0) {
          this.snackBar.open(
            'No matching historical courses found to fill empty slots.',
            'Close',
            { duration: 3000 }
          );
          this.isHistoricalLoading = false;
          this.cdr.detectChanges();
          return;
        }

        from(filledEntries).pipe(
          concatMap(entry => this.runConflictCheck(entry)),
          finalize(() => {
            this.rebuildDraftSchedules();
            const conflictCount = this.draftStateService.getConflicted().length;
            let msg = `${matchCount} of ${emptySlots.length} ` +
              `courses filled from history.`;
            if (conflictCount > 0) {
              msg += ` · ${conflictCount} conflict(s) detected — ` +
                `review highlighted rows.`;
            }
            this.snackBar.open(msg, 'Close', { duration: 5000 });
            this.isHistoricalLoading = false;
            this.cdr.detectChanges();
          })
        ).subscribe();
      },
      error: () => {
        this.snackBar.open(
          'Failed to load historical schedules.',
          'Close',
          { duration: 3000 }
        );
        this.isHistoricalLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  protected fillWithAI(): void {
    const emptyOfferings: any[] = [];
    this.filteredGroups.forEach((group) => {
      group.offerings.forEach((offering) => {
        if (offering.day === 'Not set' || offering.day === null) {
          emptyOfferings.push(offering);
        }
      });
    });

    if (emptyOfferings.length === 0) {
      this.snackBar.open(
        'No empty slots in the current filtered view to fill.',
        'Close',
        { duration: 3000 }
      );
      return;
    }

    const emptySlots = this.draftSchedules.filter((s) =>
      emptyOfferings.some((eo) => eo.schedule_id === s.schedule_id)
    );

    this.snackBar.open(
      'AI is analyzing faculty preferences...',
      'Close',
      { duration: 2000 }
    );
    this.isAiFilling = true;

    this.aiFillProgress = { current: 0, total: emptySlots.length };
    this.cdr.detectChanges();

    let unassignedCount = 0;

    this.schedulingService.getFacultyDetails().pipe(
      takeUntil(this.destroy$),
      switchMap(({ faculty }) => {
        return from(emptySlots).pipe(
          concatMap(slot => {
            const programId = (slot as any).program_id || 0;
            const yearLevel = slot.year || 1;
            const sectionId = (slot as any).section_id || 0;

            return this.schedulingService.getSmartSuggestion(
              slot.course_id,
              this.activeAcademicYearId || 0,
              this.activeSemesterId || 0,
              this.activeSemesterRecordId || 0,
              programId,
              yearLevel,
              sectionId
            ).pipe(
              switchMap(suggestion => {
                if (suggestion && suggestion.faculty_id) {
                  const fac = faculty.find(
                    (f) => f.faculty_id === suggestion.faculty_id
                  );
                  const facultyName = fac ? fac.name : suggestion.faculty_name;
                  const entry: DraftEntry = {
                    schedule_id: slot.schedule_id!,
                    faculty_id: suggestion.faculty_id,
                    faculty_name: facultyName,
                    room_id: null,
                    room_code: 'Not set',
                    day: suggestion.day,
                    start_time: this.convertTimeToBackendFormat(
                      suggestion.start_time
                    ),
                    end_time: this.convertTimeToBackendFormat(
                      suggestion.end_time
                    ),
                    hasConflict: false
                  };
                  this.draftStateService.set(slot.schedule_id!, entry);
                  return this.runConflictCheck(entry);
                } else {
                  unassignedCount++;
                  return of(void 0);
                }
              }),
              tap(() => {
                this.aiFillProgress.current++;
                this.rebuildDraftSchedules();
                this.cdr.detectChanges();
              }),
              catchError(() => {
                unassignedCount++;
                return of(void 0);
              })
            );
          }),
          finalize(() => {
            this.isAiFilling = false;
            this.rebuildDraftSchedules();
            this.cdr.detectChanges();
            
            const assignedCount = emptySlots.length - unassignedCount;
            const msg = assignedCount === emptySlots.length 
              ? `Fill completed. All ${emptySlots.length} slots processed.`
              : `Fill finished. ${assignedCount} slots filled, ` +
                `${unassignedCount} remained unassigned.`;
            
            this.snackBar.open(msg, 'Close', { duration: 6000 });
          })
        );
      })
    ).subscribe();
  }

  // Runs conflict checks for a single draft entry
  private runConflictCheck(entry: DraftEntry): Observable<void> {
    const draftSchedule = this.schedules.find(
      (s) => s.schedule_id === entry.schedule_id
    );
    if (!draftSchedule) return of(void 0);

    const programId = (draftSchedule as any).program_id || 0;
    const yearLevel = draftSchedule.year || 1;
    const sectionId = (draftSchedule as any).section_id || 0;
    const courseId = draftSchedule.course_id;

    const timeToMinutes = (timeStr: string): number => {
      const [hours, minutes] = timeStr.split(':').map(Number);
      return hours * 60 + minutes;
    };

    const sectionCourseId = (draftSchedule as any)?.section_course_id;
    const courseSchedules = (
      this.isDraftMode ? this.draftSchedules : this.schedules
    ).filter(
      (s) =>
        (s as any).section_course_id === sectionCourseId &&
        s.schedule_id !== entry.schedule_id &&
        s.day &&
        s.day !== 'Not set'
    );

    let hoursAlreadyAssigned = 0;
    courseSchedules.forEach((s) => {
      if (s.start_time && s.end_time) {
        hoursAlreadyAssigned +=
          (timeToMinutes(s.end_time) - timeToMinutes(s.start_time)) / 60;
      }
    });

    return this.schedulingService
      .checkForScheduleConflicts(
        courseId,
        entry.schedule_id,
        programId,
        yearLevel,
        entry.day || '',
        entry.start_time || '',
        entry.end_time || '',
        sectionId,
        entry.faculty_id,
        entry.room_id,
        hoursAlreadyAssigned
      )
      .pipe(
        tap((result) => {
          const currentEntry = this.draftStateService.get(entry.schedule_id);
          if (currentEntry) {
            this.draftStateService.set(entry.schedule_id, {
              ...currentEntry,
              hasConflict: result.hasConflicts,
            });
          }
        }),
        map(() => void 0),
        catchError(() => of(void 0))
      );
  }

  // Formats time strings to backend standard HH:MM:SS format
  private convertTimeToBackendFormat(time: string | null): string | null {
    if (!time) return null;
    const [timePart, period] = time.split(' ');
    let [hours, minutes] = timePart.split(':').map(Number);
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:00`;
  }
}

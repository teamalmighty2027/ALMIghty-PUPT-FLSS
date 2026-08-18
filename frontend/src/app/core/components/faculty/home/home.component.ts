import { Component, OnInit, ViewChild, ChangeDetectorRef, AfterViewInit, OnDestroy } from '@angular/core';
import { DatePipe, CommonModule } from '@angular/common';
import { MatDialog } from '@angular/material/dialog';

import { forkJoin } from 'rxjs';

import { MatSymbolDirective } from '../../../imports/mat-symbol.directive';

import { LoadingComponent } from '../../../../shared/loading/loading.component';
import { DialogScheduleDetailsComponent } from '../../../../shared/dialog-schedule-details/dialog-schedule-details.component';

import { ReportsService } from '../../../services/admin/reports/reports.service';
import { FacultyNotificationService } from '../../../services/faculty/faculty-notification/faculty-notification.service';
import { AuthService } from '../../../services/auth/auth.service';

import { FullCalendarComponent, FullCalendarModule } from '@fullcalendar/angular';
import { CalendarOptions, EventInput } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import timeGridPlugin from '@fullcalendar/timegrid';

import { fadeAnimation, cardEntranceSide } from '../../../animations/animations';

interface ScheduleColor {
  primary: string;
  secondary: string;
  text: string;
}

interface CourseSchedule {
  course_details: {
    course_code: string;
    course_title: string;
    units: number;
    lec: number;
    lab: number;
  };
  day: string;
  start_time: string;
  end_time: string;
  room_code: string;
  program_code: string;
  program_title: string;
  year_level: string;
  section_name: string;
}

@Component({
  selector: 'app-home',
  imports: [MatSymbolDirective, LoadingComponent, FullCalendarModule, DatePipe, CommonModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
  animations: [fadeAnimation, cardEntranceSide],
})
export class HomeComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('calendar') calendarComponent!: FullCalendarComponent;

  isLoading = true;
  currentView: 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay' = 'dayGridMonth';
  calendarTitle = '';
  private readonly desktopToolbar = {
    left: 'prev,next today',
    center: 'title',
    right: 'dayGridMonth,timeGridWeek,timeGridDay',
  };
  readonly mobileViewOptions = [
    { key: 'dayGridMonth', label: 'Month' },
    { key: 'timeGridWeek', label: 'Week' },
    { key: 'timeGridDay', label: 'Day' },
  ];
  calendarOptions: CalendarOptions = {};
  events: EventInput[] = [];

  facultyId: string | null = '';
  facultyCode: string | null = '';
  facultyName: string | null = '';
  facultyType: string | null = '';
  facultyEmail: string | null = '';

  academicYear = '';
  semester = '';
  facultyStatus = {
    preferences_enabled: false,
    schedule_published: false,
    preferences_deadline: null as string | null,
    preferences_start: null as string | null,
    appeal_enabled: false,
    appeal_end_date: null as string | null,
  };

  private readonly scheduleColors: ScheduleColor[] = [
    {
      primary: 'var(--primary-text)',
      secondary: 'var(--primary-fade)',
      text: 'var(--primary-text-two)',
    },
    {
      primary: 'var(--blue-primary)',
      secondary: 'var(--blue-fade)',
      text: 'var(--blue-text)',
    },
    {
      primary: 'var(--purple-primary)',
      secondary: 'var(--purple-fade)',
      text: 'var(--purple-text)',
    },
    {
      primary: 'var(--aqua-primary)',
      secondary: 'var(--aqua-fade)',
      text: 'var(--aqua-text)',
    },
    {
      primary: 'var(--green-primary)',
      secondary: 'var(--green-fade)',
      text: 'var(--green-text)',
    },
    {
      primary: 'var(--pink-primary)',
      secondary: 'var(--pink-fade)',
      text: 'var(--pink-text)',
    },
  ];

  private courseColorMap = new Map<string, ScheduleColor>();
  private facultySchedule: {
    schedules: CourseSchedule[];
    start_date: string;
    end_date: string;
    is_published: number;
  } | null = null;

  private readonly SCHEDULE_PUBLISHED = 1;

  private isScheduleValid(): boolean {
    return (
      !!this.facultySchedule &&
      this.facultySchedule.is_published === this.SCHEDULE_PUBLISHED
    );
  }

  private isCalendarApiAvailable(): boolean {
    return !!(this.calendarComponent && this.calendarComponent.getApi());
  }

  private hasFacultyId(): boolean {
    return !!this.facultyId;
  }

  private getCourseColor(courseCode: string): ScheduleColor | null {
    return this.courseColorMap.get(courseCode) || null;
  }

  constructor(
    private reportsService: ReportsService,
    private facultyNotifService: FacultyNotificationService,
    private authService: AuthService,
    private changeDetectorRef: ChangeDetectorRef,
    private dialog: MatDialog,
  ) {}

  ngOnInit(): void {
    this.loadFacultyInfo();
    this.initializeCalendar();
    this.loadAllData();
  }

  ngAfterViewInit(): void {
    this.resizeCalendar();
    this.configureCalendarForViewport();
    window.addEventListener('resize', this.handleViewportResize);
    this.changeDetectorRef.detectChanges();
  }

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.handleViewportResize);
  }

  /**
   * Load faculty information from auth service.
   */
  private loadFacultyInfo(): void {
    const userData = this.authService.getUserData();
    this.facultyCode = this.authService.getUserCode();
    this.facultyName = this.authService.getUserName();
    this.facultyId = this.authService.getUserFacultyId();
    this.facultyType = userData.faculty?.faculty_type || '';
    this.facultyEmail = this.authService.getUserEmail();
  }

  /**
   * Initialize the calendar with default options.
   */
  private initializeCalendar(): void {
    this.calendarOptions = {
      plugins: [dayGridPlugin, timeGridPlugin, interactionPlugin],
      initialView: 'dayGridMonth',
      headerToolbar: this.isMobileView() ? false : this.desktopToolbar,
      editable: false,
      selectable: true,
      selectMirror: true,
      dayMaxEvents: 2,
      dayMaxEventRows: 2,
      events: [],
      eventTimeFormat: {
        hour: 'numeric',
        minute: '2-digit',
        meridiem: 'short',
      },
      moreLinkText: (n) => `+${n} more`,
      datesSet: (info) => {
        this.currentView = info.view.type as 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay';
        this.calendarTitle = info.view.title;
      },
      eventClick: (info) => {
        const schedule = this.findScheduleForEvent(info.event);
        if (schedule) {
          this.showScheduleDetails(schedule);
        }
      },
    };
  }
  /**
   * Loads all necessary data for the faculty home page.
   *
   * This method fetches the faculty's schedule and notifications.
   * It updates the calendar events, academic year, semester, and faculty status.
   * If no faculty ID is available, it sets loading to false and returns early.
   */
  private loadAllData(): void {
    if (!this.hasFacultyId()) {
      this.isLoading = false;
      return;
    }

    const scheduleRequest = this.reportsService.getSingleFacultySchedule(
      Number(this.facultyId),
    );
    const notificationsRequest =
      this.facultyNotifService.getFacultyNotifications(Number(this.facultyId));

    forkJoin({
      schedule: scheduleRequest,
      notifications: notificationsRequest,
    }).subscribe({
      next: (response) => {
        // Process schedule data
        this.processScheduleResponse(response.schedule);
        this.updateCalendarEvents();

        // Process notifications data
        this.academicYear = response.notifications.academic_year;
        this.semester = response.notifications.semester;
        this.facultyStatus = response.notifications.faculty_status;

        // Update loading state and trigger change detection
        this.isLoading = false;
        this.changeDetectorRef.detectChanges();
        setTimeout(() => this.resizeCalendar(), 0);
      },
      error: (error) => {
        this.isLoading = false;
        this.changeDetectorRef.detectChanges();
      },
    });
  }

  /**
   * Process the schedule response and set up calendar events.
   * @param response - The schedule data from the back-end.
   */
  private processScheduleResponse(response: any): void {
    this.facultySchedule = response.faculty_schedule;

    if (!this.isScheduleValid()) {
      this.events = [];
      return;
    }

    this.events = this.createEventsFromSchedule(this.facultySchedule);
  }

  /**
   * Update calendar events based on the fetched schedule.
   */
  private updateCalendarEvents(): void {
    if (this.isCalendarApiAvailable()) {
      const calendarApi = this.calendarComponent.getApi();
      calendarApi.removeAllEvents();
      calendarApi.addEventSource(this.events);
    } else {
      this.calendarOptions = {
        ...this.calendarOptions,
        events: this.events,
      };
    }
  }

  /**
   * Resize the calendar to fit the container.
   */
  private resizeCalendar(): void {
    if (this.isCalendarApiAvailable()) {
      const calendarApi = this.calendarComponent.getApi();
      calendarApi.updateSize();
    }
  }

  isMobileView(): boolean {
    return typeof window !== 'undefined' && window.innerWidth <= 768;
  }

  private handleViewportResize = (): void => {
    this.configureCalendarForViewport();
  };

  private configureCalendarForViewport(): void {
    if (!this.isCalendarApiAvailable()) {
      return;
    }

    const calendarApi = this.calendarComponent.getApi();
    const isMobile = this.isMobileView();

    calendarApi.setOption('headerToolbar', isMobile ? false : this.desktopToolbar);
    this.currentView = calendarApi.view.type as 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay';
    this.calendarTitle = calendarApi.view.title;

    setTimeout(() => this.resizeCalendar(), 0);
  }

  goToPrevious(): void {
    this.calendarComponent?.getApi()?.prev();
  }

  goToNext(): void {
    this.calendarComponent?.getApi()?.next();
  }

  goToToday(): void {
    this.calendarComponent?.getApi()?.today();
  }

  changeView(view: string): void {
    const allowed = view as 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay';
    this.currentView = allowed;
    this.calendarComponent?.getApi()?.changeView(allowed);
  }

  trackByViewKey(_: number, view: { key: string; label: string }): string {
    return view.key;
  }

  private assignColorsToSchedules(schedules: CourseSchedule[]): void {
    schedules.forEach((schedule) => {
      const courseCode = schedule.course_details.course_code;
      if (!this.courseColorMap.has(courseCode)) {
        const colorIndex =
          this.courseColorMap.size % this.scheduleColors.length;
        this.courseColorMap.set(courseCode, this.scheduleColors[colorIndex]);
      }
    });
  }

  private createEventsFromSchedule(
    facultySchedule: typeof this.facultySchedule,
  ): EventInput[] {
    if (!facultySchedule) return [];

    const events: EventInput[] = [];
    const startDate = new Date(facultySchedule.start_date);
    const endDate = new Date(facultySchedule.end_date);

    this.assignColorsToSchedules(facultySchedule.schedules);

    facultySchedule.schedules.forEach((schedule) => {
      const dayIndex = [
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
      ].indexOf(schedule.day);

      if (dayIndex === -1) return;

      const color = this.getCourseColor(schedule.course_details.course_code);
      if (!color) return;

      const currentDate = new Date(startDate.getTime());
      while (currentDate <= endDate) {
        if (currentDate.getDay() === dayIndex) {
          const [hours, minutes] = schedule.start_time.split(':');
          const [endHours, endMinutes] = schedule.end_time.split(':');

          const start = new Date(currentDate.getTime());
          start.setHours(parseInt(hours), parseInt(minutes));

          const end = new Date(currentDate.getTime());
          end.setHours(parseInt(endHours), parseInt(endMinutes));

          events.push({
            title: `${schedule.course_details.course_code}\n${schedule.room_code}`,
            start,
            end,
            backgroundColor: color.secondary,
            borderColor: color.primary,
            textColor: color.text,
            extendedProps: { schedule },
          });
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }
    });

    return events;
  }

  private showScheduleDetails(schedule: CourseSchedule): void {
    const color = this.getCourseColor(schedule.course_details.course_code);
    if (!color) return;

    this.dialog.open(DialogScheduleDetailsComponent, {
      data: {
        schedule,
        color,
      },
      autoFocus: true,
    });
  }

  private findScheduleForEvent(event: any): CourseSchedule | null {
    return event.extendedProps?.schedule || null;
  }
}

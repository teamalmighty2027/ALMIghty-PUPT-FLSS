import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { 
  BehaviorSubject, 
  Subject, 
  finalize, 
  takeUntil, 
  combineLatest 
} from 'rxjs';
import { map } from 'rxjs/operators';

import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatSymbolDirective } from '../../core/imports/mat-symbol.directive';

import { 
  FacultyScheduleTimetableComponent 
} from '../faculty-schedule-timetable/faculty-schedule-timetable.component';
import { LoadingComponent } from '../loading/loading.component';

import { 
  ReportsService 
} from '../../core/services/admin/reports/reports.service';
import { AuthService } from '../../core/services/auth/auth.service';

import { fadeAnimation } from '../../core/animations/animations';

interface AcademicYear {
  academic_year_id: number;
  academic_year: string;
  semesters: Semester[];
}

interface Semester {
  active_semester_id: number;
  semester_id: number;
  semester_number: string;
}

/**
 * Dialog component that displays the historical load and schedule of a faculty.
 */
@Component({
  selector: 'app-dialog-schedule-history',
  imports: [
    CommonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatSelectModule,
    MatButtonModule,
    MatSymbolDirective,
    FormsModule,
    LoadingComponent,
    FacultyScheduleTimetableComponent,
  ],
  templateUrl: './dialog-schedule-history.component.html',
  styleUrls: ['./dialog-schedule-history.component.scss'],
  animations: [fadeAnimation],
})
export class DialogScheduleHistoryComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  private loadingAcademicYearsSubject = new BehaviorSubject<boolean>(true);
  private loadingScheduleHistorySubject = new BehaviorSubject<boolean>(false);
  private hasLoadedDataSubject = new BehaviorSubject<boolean>(false);

  isLoading$ = combineLatest([
    this.loadingAcademicYearsSubject.asObservable(),
    this.loadingScheduleHistorySubject.asObservable(),
  ]).pipe(
    map(
      ([loadingAcademicYears, loadingScheduleHistory]) =>
        loadingAcademicYears || loadingScheduleHistory
    )
  );

  hasLoadedData$ = this.hasLoadedDataSubject.asObservable();

  selectedYear: number | null = null;
  selectedSemester: number | null = null;
  academicYears: AcademicYear[] = [];
  semesters: Semester[] = [];
  facultySchedule: any;

  constructor(
    private reportsService: ReportsService,
    private authService: AuthService,
    private dialogRef: MatDialogRef<DialogScheduleHistoryComponent>
  ) {}

  /**
   * Initializes the component by loading academic year history.
   */
  ngOnInit(): void {
    this.loadAcademicYears();
  }

  /**
   * Cleans up subscriptions on component destruction.
   */
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Fetches academic years where the faculty member had published schedules.
   */
  private loadAcademicYears(): void {
    const facultyId = Number(this.authService.getUserFacultyId());

    this.loadingAcademicYearsSubject.next(true);
    this.hasLoadedDataSubject.next(false);

    this.reportsService
      .getFacultyAcademicYearsHistory(facultyId)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loadingAcademicYearsSubject.next(false);
          this.hasLoadedDataSubject.next(true);
        })
      )
      .subscribe({
        next: (years: AcademicYear[]) => {
          this.academicYears = years;
          if (years.length > 0) {
            const latestYear = this.getLatestAcademicYear(years);
            this.selectedYear = latestYear.academic_year_id;
            this.onYearChange();
          }
        },
        error: (error) => {
          console.error('Error fetching academic years:', error);
          this.academicYears = [];
        },
      });
  }

  /**
   * Returns the academic year with the highest ID from the list.
   * @param years List of available academic years
   * @returns The latest academic year record
   */
  private getLatestAcademicYear(years: AcademicYear[]): AcademicYear {
    return years.reduce((prev, current) =>
      prev.academic_year_id > current.academic_year_id ? prev : current
    );
  }

  /**
   * Handles selection changes for the academic year dropdown.
   */
  onYearChange(): void {
    if (!this.selectedYear) {
      this.resetSelections();
      return;
    }

    const selectedYear = this.academicYears.find(
      (ay) => ay.academic_year_id === this.selectedYear
    );

    if (selectedYear?.semesters.length) {
      this.semesters = selectedYear.semesters;
      this.selectedSemester = this.semesters[0].active_semester_id;
      this.onSemesterChange();
    } else {
      this.resetSelections();
    }
  }

  /**
   * Handles selection changes for the semester dropdown.
   */
  onSemesterChange(): void {
    if (this.selectedYear && this.selectedSemester) {
      this.fetchScheduleHistory();
    } else {
      this.facultySchedule = null;
    }
  }

  /**
   * Fetches the detailed faculty schedule for the selected semester.
   */
  private fetchScheduleHistory(): void {
    const facultyId = Number(this.authService.getUserFacultyId());

    this.loadingScheduleHistorySubject.next(true);
    this.facultySchedule = null;

    this.reportsService
      .getFacultyScheduleHistory(
        facultyId,
        this.selectedSemester!
      )
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => this.loadingScheduleHistorySubject.next(false))
      )
      .subscribe({
        next: (data) => {
          this.facultySchedule = data.faculty_schedule;
        },
        error: (error) =>
          console.error('Error fetching schedule history:', error),
      });
  }

  /**
   * Resets the semester and schedule state.
   */
  private resetSelections(): void {
    this.semesters = [];
    this.selectedSemester = null;
    this.facultySchedule = null;
  }

  /**
   * Returns true if data has been loaded but no history was found.
   */
  get hasNoScheduleHistory(): boolean {
    return this.hasLoadedDataSubject.value && this.academicYears.length === 0;
  }

  /**
   * Closes the dialog instance.
   */
  closeDialog(): void {
    this.dialogRef.close();
  }
}

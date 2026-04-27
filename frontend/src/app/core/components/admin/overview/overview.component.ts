import { Component, OnInit, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, takeUntil, forkJoin } from 'rxjs';

import { MatDialog } from '@angular/material/dialog';
import { MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSymbolDirective } from '../../../imports/mat-symbol.directive';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { DialogActionComponent, DialogActionData } from '../../../../shared/dialog-action/dialog-action.component';
import { DialogTogglePreferencesComponent, DialogTogglePreferencesData } from '../../../../shared/dialog-toggle-preferences/dialog-toggle-preferences.component';
import { LoadingComponent } from '../../../../shared/loading/loading.component';

import { OverviewService, OverviewDetails, RequestNotification as BaseRequestNotification } from '../../../services/admin/overview/overview.service';
import { PreferencesService } from '../../../services/faculty/preference/preferences.service';
import { ReschedulingService } from '../../../services/faculty/rescheduling/rescheduling.service'; 
import { AuthService } from '../../../services/auth/auth.service';
import { PermissionService } from '../../../services/permission/permission.service';

import { fadeAnimation, cardEntranceSide } from '../../../animations/animations';
import { CommonModule } from '@angular/common';

interface CurriculumInfo {
  curriculum_id: number;
  curriculum_year: string;
}

export interface RequestNotification extends BaseRequestNotification {
  request_type?: 'preference' | 'appeal';
}

@Component({
  selector: 'app-overview',
  imports: [
    CommonModule,
    MatSymbolDirective,
    MatDialogModule,
    MatTooltipModule,
    LoadingComponent,
    MatProgressSpinnerModule,
  ],
  templateUrl: './overview.component.html',
  styleUrls: ['./overview.component.scss'],
  animations: [fadeAnimation, cardEntranceSide],
})
export class OverviewComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly ANIMATION_DELAY = 100;
  private readonly SNACKBAR_DURATION = 3000;

  // Admin info
  adminName: string = '';

  // Academic info
  activeYear = 'N/A';
  activeSemester = 'N/A';
  activeSemesterId: number | null = null; 
  activeFacultyCount = 0;
  activeProgramsCount = 0;
  activeCurricula: CurriculumInfo[] = [
    { curriculum_id: 0, curriculum_year: '0' },
  ];
  globalDeadline: string | null = null;
  globalStartDate: string | null = null;

  // Progress metrics
  preferencesProgress = 0;
  schedulingProgress = 0;
  roomUtilization = 0;
  publishProgress = 0;

  // State flags
  isLoading = true;
  preferencesEnabled = true;
  schedulesPublished = false;
  notificationsLoaded = false;
  facultyWithSchedulesCount = 0;
  isMismatchedSemester = false;

  requestNotifications: RequestNotification[] = [];

  // Permission flags
  canEditPreferences = false;
  canAssignSchedules = false;
  canViewReports = false;

  isAnimatingOut = false;

  constructor(
    private cdr: ChangeDetectorRef,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private overviewService: OverviewService,
    private preferencesService: PreferencesService,
    private reschedulingService: ReschedulingService, 
    private authService: AuthService,
    private permissionService: PermissionService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.initializeAdminInfo();
    this.checkPermissions();
    this.loadAllData();
  }

  private checkPermissions(): void {
    this.canEditPreferences = this.permissionService.canEditFacultyPreferences();
    this.canAssignSchedules = this.permissionService.canAssignSchedules();
    this.canViewReports = this.permissionService.canViewReports();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initializeAdminInfo(): void {
    const fullName = this.authService.getUserName();
    this.adminName = fullName.split(' ')[0];
  }

  private loadAllData(resetAnimation = true): void {
    this.isLoading = true;
    this.notificationsLoaded = false;

    forkJoin({
      overview: this.overviewService.getOverviewDetails(),
      notifications: this.overviewService.getRequestNotifications(),
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.handleOverviewData(data.overview, resetAnimation);
          if (resetAnimation) {
            this.requestNotifications = [];
            this.cdr.detectChanges();

            setTimeout(() => {
              this.requestNotifications = data.notifications;
              this.notificationsLoaded = true;
              this.cdr.detectChanges();
            }, this.ANIMATION_DELAY);
          } else {
            this.requestNotifications = data.notifications;
            this.notificationsLoaded = true;
          }
          this.isLoading = false;
          this.cdr.detectChanges();
        },
        error: (error) => {
          this.handleError('Failed to load data. Please try again later.')(
            error
          );
          this.isLoading = false;
          this.notificationsLoaded = true;
        },
      });
  }

  private handleOverviewData(
    data: OverviewDetails,
    resetAnimation: boolean
  ): void {
    this.updateBasicInfo(data);

    if (resetAnimation) {
      this.resetProgressMetrics();
      this.cdr.detectChanges();

      setTimeout(() => {
        this.updateProgressMetrics(data);
        this.cdr.detectChanges();
      }, this.ANIMATION_DELAY);
    } else {
      this.updateProgressMetrics(data);
      this.cdr.detectChanges();
    }
  }

  private updateBasicInfo(data: any): void {
    this.activeYear = data.activeAcademicYear;
    this.activeSemester = data.activeSemester;
    this.activeSemesterId = data.activeSemesterId || 1; 
    this.isMismatchedSemester = data.isMismatchedSemester ?? false;
    this.activeFacultyCount = data.activeFacultyCount;
    this.activeProgramsCount = data.activeProgramsCount;
    this.activeCurricula = data.activeCurricula;
    this.facultyWithSchedulesCount = data.facultyWithSchedulesCount;
    this.preferencesEnabled = data.preferencesSubmissionEnabled;
    this.schedulesPublished = data.publishProgress > 0;
    this.globalDeadline = data.global_deadline || null;
    this.globalStartDate = data.global_start_date || null;
  }

  private resetProgressMetrics(): void {
    this.preferencesProgress = 0;
    this.schedulingProgress = 0;
    this.roomUtilization = 0;
    this.publishProgress = 0;
  }

  private updateProgressMetrics(data: OverviewDetails): void {
    this.preferencesProgress = data.preferencesProgress;
    this.schedulingProgress = data.schedulingProgress;
    this.roomUtilization = data.roomUtilization;
    this.publishProgress = data.publishProgress;
  }

  getCircleOffset(percentage: number): number {
    const circumference = 2 * Math.PI * 45;
    return circumference - (percentage / 100) * circumference;
  }

  formatSemester(semester: any): string {
    if (!semester || semester === 'None') return 'None';

    const sem = semester.toString();
    switch (sem) {
      case '1': return '1st Semester';
      case '2': return '2nd Semester';
      case '3': return 'Summer Semester';
      default: return sem;
    }
  }

  // ================
  // Toggle Methods
  // ================

  togglePreferencesSubmission(): void {
    if (!this.canEditPreferences) {
      this.showNoPermissionMessage();
      return;
    }

    const dialogData: DialogTogglePreferencesData = {
      type: 'all_preferences',
      academicYear: this.activeYear,
      semester: this.activeSemester,
      hasSecondaryText: true,
      currentState: this.preferencesEnabled,
      global_deadline: this.globalDeadline ? new Date(this.globalDeadline) : null,
      global_start_date: this.globalStartDate ? new Date(this.globalStartDate) : null,
    };

    const dialogRef = this.dialog.open(DialogTogglePreferencesComponent, {
      data: dialogData, disableClose: true, autoFocus: false,
    });

    dialogRef.afterClosed().subscribe((result: boolean) => {
      if (result) this.loadAllData(true);
    });
  }

  togglePublishSchedules(): void {
    if (!this.canAssignSchedules) {
      this.showNoPermissionMessage();
      return;
    }

    if (this.facultyWithSchedulesCount === 0) {
      this.showSchedulingRedirectMessage();
      return;
    }

    const dialogData: DialogActionData = {
      type: 'all_publish',
      academicYear: this.activeYear,
      semester: this.activeSemester,
      currentState: this.schedulesPublished,
      hasSecondaryText: true,
      isMismatchedSemester: this.isMismatchedSemester,
    };

    const dialogRef = this.dialog.open(DialogActionComponent, {
      data: dialogData, disableClose: true,
    });

    dialogRef.afterClosed().subscribe((result: boolean) => {
      if (result) this.loadAllData(true);
    });
  }

  generateReports(): void {
    if (!this.canViewReports) {
      this.showNoPermissionMessage();
      return;
    }

    if (this.facultyWithSchedulesCount === 0) {
      this.showSchedulingRedirectMessage();
      return;
    }

    this.dialog.open(DialogActionComponent, {
      data: { type: 'reports', academicYear: this.activeYear, semester: this.activeSemester, },
      disableClose: true,
    });
  }

  private showSchedulingRedirectMessage(): void {
    const snackBarRef = this.snackBar.open(
      'No schedule has been made yet.',
      'Go to Scheduling',
      { duration: this.SNACKBAR_DURATION }
    );

    snackBarRef.onAction().subscribe(() => {
      this.router.navigate(['/admin/scheduling']);
    });
  }

  // ======================
  // Request Action Methods
  // ======================

  approveRequest(request: RequestNotification): void {
  if (!this.canEditPreferences) {
    this.showNoPermissionMessage();
    return;
  }

  // Define shared dialog data
  const isAppeal = request.request_type === 'appeal';
  const dialogData: DialogTogglePreferencesData = {
    type: isAppeal ? 'single_appeal' : 'single_preferences', // Logic inside dialog handles the label
    academicYear: this.activeYear,
    semester: this.activeSemester,
    currentState: false, // We are enabling access
    facultyName: request.faculty_name,
    faculty_id: request.faculty_id,
    global_deadline: this.globalDeadline ? new Date(this.globalDeadline) : null,
    global_start_date: this.globalStartDate ? new Date(this.globalStartDate) : null,
  };

  const dialogRef = this.dialog.open(DialogTogglePreferencesComponent, {
    data: dialogData, 
    disableClose: true, 
    autoFocus: true,
  });

  dialogRef.afterClosed().subscribe((result) => {
    // Result should now contain { confirmed: true, startDate, endDate, sendEmail }
    if (result) {
      if (isAppeal) {
        // Pass the dates and email flag from the dialog to your service
        this.reschedulingService.toggleFacultyAppealAccess(
          request.faculty_id, 
          true, 
          this.activeSemesterId || 1,
          result.startDate, // Ensure your service accepts these
          result.endDate,
          result.sendEmail
        ).subscribe({
          next: () => {
            this.removeNotificationLocally(request);
            this.showSuccessMessage('Appeal access granted and faculty notified.');
          },
          error: this.handleError('Failed to grant appeal access.')
        });
      } else {
        // Handle Preferences (Standard Logic)
        this.preferencesService.cancelRequestAccess(request.faculty_id.toString())
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: () => {
              this.removeNotificationLocally(request);
              this.showSuccessMessage('Faculty preferences access enabled.');
            },
            error: this.handleError('Failed to process request.')
          });
      }
    }
  });
}

  discardRequest(request: RequestNotification): void {
    if (!this.canEditPreferences) {
      this.showNoPermissionMessage();
      return;
    }

    const discardedRequest = { ...request };

    // 1. Optimistic UI Update (Hide it instantly)
    this.isAnimatingOut = true;
    this.requestNotifications = this.requestNotifications.filter(
      (r) => r.faculty_id !== request.faculty_id
    );
    this.cdr.detectChanges();

    setTimeout(() => {
      this.isAnimatingOut = false;
      this.cdr.detectChanges();
    }, 600);

    // 2. IMMEDIATE API Call
    if (request.request_type === 'appeal') {
      this.reschedulingService.rejectAppealAccessRequest(request.faculty_id.toString())
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.snackBar.open('Request denied and faculty notified via email.', 'Close', { duration: 3000 });
          },
          error: (err) => this.revertDiscard(discardedRequest, err)
        });
    } else {
      this.preferencesService.cancelRequestAccess(request.faculty_id.toString())
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.snackBar.open('Faculty preference request discarded.', 'Close', { duration: 3000 });
          },
          error: (err) => this.revertDiscard(discardedRequest, err)
        });
    }
  }

  private removeNotificationLocally(request: RequestNotification) {
    this.isAnimatingOut = true;
    this.requestNotifications = this.requestNotifications.filter(
      (r) => r.faculty_id !== request.faculty_id
    );
    this.cdr.detectChanges();

    setTimeout(() => {
      this.isAnimatingOut = false;
      this.cdr.detectChanges();
    }, 600);
  }

  private revertDiscard(discardedRequest: RequestNotification, error: any) {
    this.requestNotifications = [...this.requestNotifications, discardedRequest];
    this.cdr.detectChanges();
    this.handleError('Failed to discard request. Please try again.')(error);
  }

  // ================
  // Utility Methods
  // ================

  private showSuccessMessage(message: string): void {
    this.snackBar.open(message, 'Close', { duration: this.SNACKBAR_DURATION });
  }

  private showErrorMessage(message: string): void {
    this.snackBar.open(message, 'Close', { duration: this.SNACKBAR_DURATION });
  }

  private showNoPermissionMessage(): void {
    this.snackBar.open(
      'You do not have permission to perform this action.',
      'Close',
      { duration: this.SNACKBAR_DURATION }
    );
  }

  private handleError(errorMessage: string) {
    return (error: any) => {
      console.error('Operation failed:', error);
      this.showErrorMessage(errorMessage);
      this.isLoading = false;
    };
  }
}
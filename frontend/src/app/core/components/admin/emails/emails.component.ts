import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';

import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';

import { MatSymbolDirective } from '../../../imports/mat-symbol.directive';
import { LoadingComponent } from '../../../../shared/loading/loading.component';

import {
  EmailsService,
  EmailLog,
  EmailMetrics,
} from '../../../services/admin/emails/emails.service';
import {
  OverviewService,
  RequestNotification,
} from '../../../services/admin/overview/overview.service';
import { PreferencesService } from '../../../services/faculty/preference/preferences.service';
import { ReschedulingService } from '../../../services/faculty/rescheduling/rescheduling.service';
import { PermissionService } from '../../../services/permission/permission.service';

import {
  DialogTogglePreferencesComponent,
  DialogTogglePreferencesData,
} from '../../../../shared/dialog-toggle-preferences/dialog-toggle-preferences.component';
import {
  DialogToggleAppealsComponent,
} from '../../../../shared/dialog-toggle-appeals/dialog-toggle-appeals.component';

@Component({
  selector: 'app-emails',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatTabsModule,
    MatTableModule,
    MatPaginatorModule,
    MatTooltipModule,
    MatSnackBarModule,
    MatDialogModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSymbolDirective,
    LoadingComponent,
  ],
  templateUrl: './emails.component.html',
  styleUrls: ['./emails.component.scss'],
})
export class EmailsComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private pollingTimer: any = null;

  // Active Tab Index
  activeTabIndex = 0;

  // Tab 1: Email Logs & Metrics State
  emailLogs: EmailLog[] = [];
  emailMetrics: EmailMetrics = { queued: 0, sent: 0, failed: 0 };
  isLoadingEmails = false;
  isLivePolling = false;

  // Email Filters & Pagination
  statusFilter = 'all';
  purposeFilter = 'all';
  dateFilter = '';
  searchQuery = '';
  currentPage = 1;
  pageSize = 15;
  totalEmails = 0;

  // Tab 2: Faculty Requests State
  requests: RequestNotification[] = [];
  isLoadingRequests = false;
  canEditPreferences = false;

  constructor(
    private emailsService: EmailsService,
    private overviewService: OverviewService,
    private preferencesService: PreferencesService,
    private reschedulingService: ReschedulingService,
    private permissionService: PermissionService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.loadEmailData();
    this.loadRequests();
  }

  ngOnDestroy(): void {
    this.stopPolling();
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Check user permissions for actions.
   */
  private checkPermissions(): void {
    this.canEditPreferences = this.permissionService.hasPermission(
      'edit_faculty_preferences'
    );
  }

  // ==========================================
  // TAB 1: EMAIL DISPATCH LOGS & METRICS
  // ==========================================

  /**
   * Loads both email metrics and email dispatch logs.
   */
  loadEmailData(): void {
    this.loadEmailMetrics();
    this.loadEmailLogs();
  }

  /**
   * Loads aggregate metrics for email dispatches.
   */
  loadEmailMetrics(): void {
    this.emailsService
      .getEmailMetrics()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (metrics) => {
          this.emailMetrics = metrics;
          this.cdr.detectChanges();
        },
        error: (err) => console.error('Failed to load email metrics:', err),
      });
  }

  /**
   * Loads paginated email logs with current filters.
   */
  loadEmailLogs(): void {
    this.isLoadingEmails = true;

    this.emailsService
      .getEmailLogs({
        status: this.statusFilter,
        purpose: this.purposeFilter,
        date: this.dateFilter,
        search: this.searchQuery,
        page: this.currentPage,
        per_page: this.pageSize,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.emailLogs = response.data || [];
          this.totalEmails = response.total || 0;
          this.isLoadingEmails = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('Failed to load email logs:', err);
          this.isLoadingEmails = false;
          this.cdr.detectChanges();
        },
      });
  }

  /**
   * Handles filter change events.
   */
  onFilterChange(): void {
    this.currentPage = 1;
    this.loadEmailLogs();
  }

  /**
   * Handles paginator page change events.
   */
  onPageChange(event: PageEvent): void {
    this.currentPage = event.pageIndex + 1;
    this.pageSize = event.pageSize;
    this.loadEmailLogs();
  }

  /**
   * Toggles the 15-second live auto-polling for email logs.
   */
  toggleLivePolling(): void {
    this.isLivePolling = !this.isLivePolling;

    if (this.isLivePolling) {
      this.pollingTimer = setInterval(() => {
        this.loadEmailData();
      }, 15000);
      this.snackBar.open('Live polling enabled (every 15s)', 'Close', {
        duration: 2500,
      });
    } else {
      this.stopPolling();
      this.snackBar.open('Live polling stopped', 'Close', {
        duration: 2000,
      });
    }
  }

  /**
   * Stops the live polling interval.
   */
  private stopPolling(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  /**
   * Maps purpose enum to a human-readable display string.
   *
   * @param purpose The purpose key from EmailLog
   */
  formatPurpose(purpose: string): string {
    switch (purpose) {
      case 'preference_toggle':
        return 'Preference Submission';
      case 'schedule_published':
        return 'Official Schedule';
      case 'first_login_password':
        return 'Account Password';
      case 'deadline_warning':
        return 'Deadline Warning';
      case 'reschedule_notification':
        return 'Change Request';
      default:
        return purpose;
    }
  }

  // ==========================================
  // TAB 2: FACULTY REQUESTS
  // ==========================================

  /**
   * Loads pending faculty requests from overview service.
   */
  loadRequests(): void {
    this.isLoadingRequests = true;

    this.overviewService
      .getRequestNotifications()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (requests) => {
          this.requests = requests || [];
          this.isLoadingRequests = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('Failed to load requests:', err);
          this.isLoadingRequests = false;
          this.cdr.detectChanges();
        },
      });
  }

  /**
   * Approves a faculty request.
   *
   * @param request The request notification to approve
   */
  approveRequest(request: RequestNotification): void {
    if (!this.canEditPreferences) {
      this.snackBar.open(
        'You do not have permission to approve requests.',
        'Close',
        { duration: 3000 }
      );
      return;
    }

    if (request.request_type === 'appeal') {
      const dialogRef = this.dialog.open(DialogToggleAppealsComponent, {
        data: {
          faculty_id: request.faculty_id,
          faculty_name: request.faculty_name,
          appeal_start_date: request.appeal_start_date,
          appeal_end_date: request.appeal_end_date,
        },
      });

      dialogRef.afterClosed().subscribe((result) => {
        if (result) {
          this.requests = this.requests.filter(
            (r) => r.faculty_id !== request.faculty_id
          );
          this.snackBar.open('Appeal access granted.', 'Close', {
            duration: 3000,
          });
        }
      });
    } else {
      const dialogData: DialogTogglePreferencesData = {
        type: 'single_preferences',
        academicYear: '',
        semester: '',
        currentState: false,
        facultyName: request.faculty_name,
        faculty_id: request.faculty_id,
        global_deadline: null,
        global_start_date: null,
      };

      const dialogRef = this.dialog.open(DialogTogglePreferencesComponent, {
        data: dialogData,
      });

      dialogRef.afterClosed().subscribe((result: boolean) => {
        if (result) {
          this.preferencesService
            .cancelRequestAccess(request.faculty_id.toString())
            .pipe(takeUntil(this.destroy$))
            .subscribe({
              next: () => {
                this.requests = this.requests.filter(
                  (r) => r.faculty_id !== request.faculty_id
                );
                this.snackBar.open(
                  'Faculty preferences access enabled.',
                  'Close',
                  { duration: 3000 }
                );
              },
              error: () => {
                this.snackBar.open('Failed to process request.', 'Close', {
                  duration: 3000,
                });
              },
            });
        }
      });
    }
  }

  /**
   * Discards a faculty request.
   *
   * @param request The request notification to discard
   */
  discardRequest(request: RequestNotification): void {
    if (!this.canEditPreferences) {
      this.snackBar.open(
        'You do not have permission to discard requests.',
        'Close',
        { duration: 3000 }
      );
      return;
    }

    if (request.request_type === 'appeal') {
      this.reschedulingService
        .rejectAppealAccessRequest(request.faculty_id.toString())
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.requests = this.requests.filter(
              (r) => r.faculty_id !== request.faculty_id
            );
            this.snackBar.open('Appeal request denied.', 'Close', {
              duration: 3000,
            });
          },
          error: () => {
            this.snackBar.open('Failed to discard appeal request.', 'Close', {
              duration: 3000,
            });
          },
        });
    } else {
      this.preferencesService
        .cancelRequestAccess(request.faculty_id.toString())
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.requests = this.requests.filter(
              (r) => r.faculty_id !== request.faculty_id
            );
            this.snackBar.open(
              'Faculty preference request discarded.',
              'Close',
              { duration: 3000 }
            );
          },
          error: () => {
            this.snackBar.open(
              'Failed to discard request. Please try again.',
              'Close',
              { duration: 3000 }
            );
          },
        });
    }
  }
}

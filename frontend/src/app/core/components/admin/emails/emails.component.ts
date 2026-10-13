import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { SelectionModel } from '@angular/cdk/collections';

import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';

import { MatSymbolDirective } from '../../../imports/mat-symbol.directive';
import { LoadingComponent } from '../../../../shared/loading/loading.component';

import {
  EmailsService,
  EmailLog,
  EmailMetrics,
} from '../../../services/admin/emails/emails.service';
import {
  AdminNotificationService,
  AppNotification,
} from '../../../services/admin/notification/admin-notification.service';

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
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    MatSymbolDirective,
    LoadingComponent,
  ],
  templateUrl: './emails.component.html',
  styleUrls: ['./emails.component.scss'],
})
export class EmailsComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private pollingTimer: any = null;

  // Active Tab Index (0 = Email Dispatch Log, 1 = Notifications Center)
  activeTabIndex = 0;

  // ==========================================
  // TAB 1: EMAIL DISPATCH LOGS STATE
  // ==========================================
  emailLogs: EmailLog[] = [];
  emailMetrics: EmailMetrics = { queued: 0, sent: 0, failed: 0 };
  isLoadingEmails = false;
  isLivePolling = false;

  displayedColumns: string[] = [
    'index',
    'recipient_name',
    'recipient_email',
    'purpose',
    'status',
    'dispatched_at',
    'processed_at',
    'error_details',
  ];
  statusFilter = 'all';
  purposeFilter = 'all';
  dateFilter = '';
  searchQuery = '';
  currentPage = 1;
  pageSize = 15;
  totalEmails = 0;

  // ==========================================
  // TAB 2: IN-APP NOTIFICATIONS STATE
  // ==========================================
  notifications: AppNotification[] = [];
  notificationDisplayedColumns: string[] = [
    'select',
    'status',
    'category',
    'message',
    'received',
    'actions',
  ];
  selection = new SelectionModel<AppNotification>(true, []);

  isLoadingNotifications = false;
  totalNotifications = 0;
  unreadNotificationsCount = 0;
  readNotificationsCount = 0;

  notificationPage = 1;
  notificationPageSize = 10;
  notificationFilter: 'all' | 'unread' | 'read' = 'all';
  notificationSearchQuery = '';

  constructor(
    private emailsService: EmailsService,
    private adminNotificationService: AdminNotificationService,
    private router: Router,
    private route: ActivatedRoute,
    private snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // Listen for query params to auto-switch tabs
    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe((params) => {
        if (params['tab'] === 'notifications') {
          this.activeTabIndex = 1;
        }
      });

    this.loadEmailData();
    this.loadNotifications();
  }

  ngOnDestroy(): void {
    this.stopPolling();
    this.destroy$.next();
    this.destroy$.complete();
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
   * Loads email counters and metrics summary.
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
        error: (err) => {
          console.error('Failed to load email metrics:', err);
        },
      });
  }

  /**
   * Loads paginated and filtered email dispatch logs.
   */
  loadEmailLogs(): void {
    this.isLoadingEmails = true;

    this.emailsService
      .getEmailLogs({
        page: this.currentPage,
        per_page: this.pageSize,
        status: this.statusFilter,
        purpose: this.purposeFilter,
        date: this.dateFilter,
        search: this.searchQuery,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.emailLogs = res.data;
          this.totalEmails = res.total;
          this.isLoadingEmails = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('Failed to load email logs:', err);
          this.isLoadingEmails = false;
          this.snackBar.open('Failed to load email dispatch logs.', 'Close', {
            duration: 3000,
          });
          this.cdr.detectChanges();
        },
      });
  }

  /**
   * Handles filter changes for email logs.
   */
  onFilterChange(): void {
    this.currentPage = 1;
    this.loadEmailLogs();
  }

  /**
   * Clears the search query field.
   */
  clearSearch(): void {
    this.searchQuery = '';
    this.onFilterChange();
  }

  /**
   * Handles pagination page changes for email logs.
   */
  onPageChange(event: PageEvent): void {
    this.currentPage = event.pageIndex + 1;
    this.pageSize = event.pageSize;
    this.loadEmailLogs();
  }

  /**
   * Toggles live polling of email logs every 15 seconds.
   */
  toggleLivePolling(): void {
    this.isLivePolling = !this.isLivePolling;

    if (this.isLivePolling) {
      this.pollingTimer = setInterval(() => {
        this.loadEmailData();
      }, 15000);
    } else {
      this.stopPolling();
    }
  }

  /**
   * Stops background live polling timer.
   */
  private stopPolling(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  /**
   * Returns formatted human-readable purpose label.
   */
  getPurposeLabel(purpose: string): string {
    const map: Record<string, string> = {
      preference_toggle: 'Preference Submission',
      schedule_published: 'Official Schedule',
      first_login_password: 'Account Password',
      deadline_warning: 'Deadline Warning',
      reschedule_notification: 'Change Request',
      appeal_notification: 'Appeal Request',
    };

    return map[purpose] || purpose.replace(/_/g, ' ');
  }

  /**
   * Formats purpose key into displayable string.
   */
  formatPurpose(purpose: string): string {
    return this.getPurposeLabel(purpose);
  }

  /**
   * Returns CSS class corresponding to email purpose chip.
   */
  getPurposeClass(purpose: string): string {
    const map: Record<string, string> = {
      preference_toggle: 'purpose-pref',
      schedule_published: 'purpose-sched',
      first_login_password: 'purpose-pass',
      deadline_warning: 'purpose-deadline',
      reschedule_notification: 'purpose-resched',
      appeal_notification: 'purpose-appeal',
    };

    return map[purpose] || 'purpose-default';
  }

  // ==========================================
  // TAB 2: IN-APP NOTIFICATIONS CENTER
  // ==========================================

  /**
   * Loads in-app notifications with current pagination and filter settings.
   */
  loadNotifications(): void {
    this.isLoadingNotifications = true;

    this.adminNotificationService
      .getNotifications({
        page: this.notificationPage,
        per_page: this.notificationPageSize,
        filter: this.notificationFilter,
        search: this.notificationSearchQuery,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.notifications = res.notifications || [];
          this.totalNotifications = res.total ?? res.notifications.length;
          this.unreadNotificationsCount = res.unread_count ?? 0;
          this.readNotificationsCount =
            res.read_count ??
            Math.max(0, this.totalNotifications - this.unreadNotificationsCount);

          this.selection.clear();
          this.isLoadingNotifications = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('Failed to load notifications:', err);
          this.isLoadingNotifications = false;
          this.snackBar.open('Failed to load notifications.', 'Close', {
            duration: 3000,
          });
          this.cdr.detectChanges();
        },
      });
  }

  /**
   * Handles filter dropdown change for notifications.
   */
  onNotificationFilterChange(): void {
    this.notificationPage = 1;
    this.loadNotifications();
  }

  /**
   * Clears notification search query.
   */
  clearNotificationSearch(): void {
    this.notificationSearchQuery = '';
    this.onNotificationFilterChange();
  }

  /**
   * Handles pagination change for notifications table.
   */
  onNotificationPageChange(event: PageEvent): void {
    this.notificationPage = event.pageIndex + 1;
    this.notificationPageSize = event.pageSize;
    this.loadNotifications();
  }

  /**
   * Checks whether all currently visible notifications are selected.
   */
  isAllSelected(): boolean {
    const numSelected = this.selection.selected.length;
    const numRows = this.notifications.length;

    return numRows > 0 && numSelected === numRows;
  }

  /**
   * Toggles select-all across all visible rows.
   */
  masterToggle(): void {
    if (this.isAllSelected()) {
      this.selection.clear();
    } else {
      this.notifications.forEach((row) => this.selection.select(row));
    }
  }

  /**
   * Mark an individual notification as read.
   */
  markNotificationAsRead(notif: AppNotification): void {
    if (notif.read_at) {
      return;
    }

    this.adminNotificationService
      .markAsRead(notif.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          notif.read_at = new Date().toISOString();

          if (this.unreadNotificationsCount > 0) {
            this.unreadNotificationsCount--;
          }
          this.readNotificationsCount++;
          this.cdr.detectChanges();
        },
        error: () => {
          this.snackBar.open('Failed to mark notification as read.', 'Close', {
            duration: 3000,
          });
        },
      });
  }

  /**
   * Deletes a single notification from the system.
   */
  deleteSingleNotification(notif: AppNotification): void {
    this.adminNotificationService
      .deleteNotification(notif.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.snackBar.open('Notification deleted.', 'Close', {
            duration: 2500,
          });
          this.loadNotifications();
        },
        error: () => {
          this.snackBar.open('Failed to delete notification.', 'Close', {
            duration: 3000,
          });
        },
      });
  }

  /**
   * Marks all selected notifications as read.
   */
  bulkMarkAsRead(): void {
    const selectedIds = this.selection.selected.map((item) => item.id);

    if (selectedIds.length === 0) {
      return;
    }

    this.adminNotificationService
      .bulkRead(selectedIds)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.snackBar.open(
            `${selectedIds.length} notifications marked as read.`,
            'Close',
            { duration: 3000 }
          );
          this.loadNotifications();
        },
        error: () => {
          this.snackBar.open('Failed to mark selected as read.', 'Close', {
            duration: 3000,
          });
        },
      });
  }

  /**
   * Deletes all selected notifications.
   */
  bulkDeleteSelected(): void {
    const selectedIds = this.selection.selected.map((item) => item.id);

    if (selectedIds.length === 0) {
      return;
    }

    this.adminNotificationService
      .bulkDelete(selectedIds)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.snackBar.open(
            `${selectedIds.length} notifications deleted.`,
            'Close',
            { duration: 3000 }
          );
          this.loadNotifications();
        },
        error: () => {
          this.snackBar.open('Failed to delete selected notifications.', 'Close', {
            duration: 3000,
          });
        },
      });
  }

  /**
   * Marks all notifications as read.
   */
  markAllNotificationsAsRead(): void {
    this.adminNotificationService
      .markAllAsRead()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.snackBar.open('All notifications marked as read.', 'Close', {
            duration: 3000,
          });
          this.loadNotifications();
        },
        error: () => {
          this.snackBar.open('Failed to mark all as read.', 'Close', {
            duration: 3000,
          });
        },
      });
  }

  /**
   * Clears all read notifications, preserving unread ones.
   */
  clearReadNotifications(): void {
    this.adminNotificationService
      .clearRead()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.snackBar.open('Read notifications cleared.', 'Close', {
            duration: 3000,
          });
          this.loadNotifications();
        },
        error: () => {
          this.snackBar.open('Failed to clear read notifications.', 'Close', {
            duration: 3000,
          });
        },
      });
  }

  /**
   * Navigates to target action URL and marks notification as read.
   */
  onNotificationActionClick(notif: AppNotification): void {
    if (!notif.read_at) {
      this.markNotificationAsRead(notif);
    }

    if (notif.data.action_url) {
      this.router.navigate([notif.data.action_url], {
        queryParams: { search: notif.data.faculty_id },
      });
    }
  }

  /**
   * Returns Material symbol icon for notification type.
   */
  getNotificationIcon(notif: AppNotification): string {
    if (notif.data.icon) {
      return notif.data.icon;
    }

    const type = notif.data.type || '';

    if (type.includes('preference')) {
      return 'tune';
    }

    if (type.includes('appeal')) {
      return 'swap_horiz';
    }

    return 'notifications';
  }

  /**
   * Returns category badge label for notification type.
   */
  getNotificationCategoryLabel(notif: AppNotification): string {
    const type = notif.data.type || '';

    switch (type) {
      case 'preference_request':
        return 'Preference Request';
      case 'preference_submission':
        return 'Preferences Submitted';
      case 'appeal_request':
        return 'Appeal Request';
      case 'appeal_request_cancelled':
        return 'Appeal Request Cancelled';
      case 'appeal_submitted':
        return 'Appeal Submitted';
      case 'appeal_cancelled':
        return 'Appeal Cancelled';
      default:
        return 'System Alert';
    }
  }

  /**
   * Returns category badge CSS class.
   */
  getNotificationCategoryClass(notif: AppNotification): string {
    const type = notif.data.type || '';

    if (type.includes('preference')) {
      return 'badge-preference';
    }

    if (type.includes('appeal')) {
      return 'badge-appeal';
    }

    return 'badge-general';
  }
}

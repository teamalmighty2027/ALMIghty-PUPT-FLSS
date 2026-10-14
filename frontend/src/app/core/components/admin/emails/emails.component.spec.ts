import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialogModule } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';

import { EmailsComponent } from './emails.component';
import { EmailsService } from '../../../services/admin/emails/emails.service';
import {
  AdminNotificationService
} from '../../../services/admin/notification/admin-notification.service';
import { PermissionService } from '../../../services/permission/permission.service';

describe('EmailsComponent', () => {
  let component: EmailsComponent;
  let fixture: ComponentFixture<EmailsComponent>;
  let emailsService: jasmine.SpyObj<EmailsService>;
  let adminNotificationService: jasmine.SpyObj<AdminNotificationService>;

  beforeEach(async () => {
    const emailsSpy = jasmine.createSpyObj('EmailsService', [
      'getEmailLogs',
      'getEmailMetrics',
    ]);
    const adminNotificationSpy = jasmine.createSpyObj(
      'AdminNotificationService',
      ['getNotifications', 'markAsRead', 'deleteNotification']
    );
    const permissionSpy = jasmine.createSpyObj('PermissionService', [
      'hasPermission',
    ]);
    const routerSpy = jasmine.createSpyObj('Router', ['navigate']);

    emailsSpy.getEmailMetrics.and.returnValue(
      of({ queued: 0, sent: 10, failed: 1 })
    );
    emailsSpy.getEmailLogs.and.returnValue(
      of({ data: [], current_page: 1, last_page: 1, per_page: 15, total: 0 })
    );
    adminNotificationSpy.getNotifications.and.returnValue(
      of({ notifications: [], total: 0, unread_count: 0, read_count: 0 })
    );
    permissionSpy.hasPermission.and.returnValue(true);

    await TestBed.configureTestingModule({
      imports: [
        EmailsComponent,
        HttpClientTestingModule,
        MatSnackBarModule,
        MatDialogModule,
        NoopAnimationsModule,
      ],
      providers: [
        { provide: EmailsService, useValue: emailsSpy },
        { provide: AdminNotificationService, useValue: adminNotificationSpy },
        { provide: PermissionService, useValue: permissionSpy },
        { provide: Router, useValue: routerSpy },
        {
          provide: ActivatedRoute,
          useValue: { queryParams: of({}) },
        },
      ],
    }).compileComponents();

    emailsService = TestBed.inject(
      EmailsService
    ) as jasmine.SpyObj<EmailsService>;
    adminNotificationService = TestBed.inject(
      AdminNotificationService
    ) as jasmine.SpyObj<AdminNotificationService>;

    fixture = TestBed.createComponent(EmailsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with activeTabIndex = 0 (Email tab)', () => {
    expect(component.activeTabIndex).toBe(0);
  });

  it('should load email data and requests on init', () => {
    expect(emailsService.getEmailMetrics).toHaveBeenCalled();
    expect(emailsService.getEmailLogs).toHaveBeenCalled();
    expect(adminNotificationService.getNotifications).toHaveBeenCalled();
  });

  it('should toggle live polling and start interval timer', () => {
    expect(component.isLivePolling).toBeFalse();
    component.toggleLivePolling();
    expect(component.isLivePolling).toBeTrue();
    component.toggleLivePolling();
    expect(component.isLivePolling).toBeFalse();
  });

  it('should clean up on destroy', () => {
    component.toggleLivePolling();
    expect(component.isLivePolling).toBeTrue();
    component.ngOnDestroy();
  });

  it('should define displayedColumns for mat-table', () => {
    expect(component.displayedColumns).toEqual([
      'index',
      'recipient_name',
      'recipient_email',
      'purpose',
      'status',
      'dispatched_at',
      'processed_at',
      'error_details',
    ]);
  });

  it('should clear search query when clearSearch is called', () => {
    component.searchQuery = 'test';
    component.clearSearch();
    expect(component.searchQuery).toBe('');
    expect(component.currentPage).toBe(1);
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialogModule } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of } from 'rxjs';

import { EmailsComponent } from './emails.component';
import { EmailsService } from '../../../services/admin/emails/emails.service';
import { OverviewService } from '../../../services/admin/overview/overview.service';
import { PermissionService } from '../../../services/permission/permission.service';

describe('EmailsComponent', () => {
  let component: EmailsComponent;
  let fixture: ComponentFixture<EmailsComponent>;
  let emailsService: jasmine.SpyObj<EmailsService>;
  let overviewService: jasmine.SpyObj<OverviewService>;

  beforeEach(async () => {
    const emailsSpy = jasmine.createSpyObj('EmailsService', [
      'getEmailLogs',
      'getEmailMetrics',
    ]);
    const overviewSpy = jasmine.createSpyObj('OverviewService', [
      'getRequestNotifications',
    ]);
    const permissionSpy = jasmine.createSpyObj('PermissionService', [
      'hasPermission',
    ]);

    emailsSpy.getEmailMetrics.and.returnValue(
      of({ queued: 0, sent: 10, failed: 1 })
    );
    emailsSpy.getEmailLogs.and.returnValue(
      of({ data: [], current_page: 1, last_page: 1, per_page: 15, total: 0 })
    );
    overviewSpy.getRequestNotifications.and.returnValue(of([]));
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
        { provide: OverviewService, useValue: overviewSpy },
        { provide: PermissionService, useValue: permissionSpy },
      ],
    }).compileComponents();

    emailsService = TestBed.inject(
      EmailsService
    ) as jasmine.SpyObj<EmailsService>;
    overviewService = TestBed.inject(
      OverviewService
    ) as jasmine.SpyObj<OverviewService>;

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
    expect(overviewService.getRequestNotifications).toHaveBeenCalled();
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
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of } from 'rxjs';

import { OverviewComponent } from './overview.component';
import { AuthService } from '../../../services/auth/auth.service';
import { PermissionService } from '../../../services/permission/permission.service';
import {
  OverviewService
} from '../../../services/admin/overview/overview.service';

describe('OverviewComponent', () => {
  let component: OverviewComponent;
  let fixture: ComponentFixture<OverviewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        OverviewComponent,
        HttpClientTestingModule,
        NoopAnimationsModule
      ],
      providers: [
        {
          provide: AuthService,
          useValue: {
            getUserName: () => 'Admin User',
            getUserRole: () => 'Admin',
            getUserEmail: () => 'admin@test.com',
            profilePictureUrl$: of(null),
            hasPermission: () => true
          }
        },
        {
          provide: PermissionService,
          useValue: {
            canEditFacultyPreferences: () => true,
            canAssignSchedules: () => true,
            canViewReports: () => true
          }
        },
        {
          provide: OverviewService,
          useValue: {
            getOverviewDetails: () => of({
              activeAcademicYear: '2023-2024',
              activeSemester: '1',
              activeSemesterId: 1,
              activeFacultyCount: 0,
              activeProgramsCount: 0,
              activeCurricula: [],
              preferencesSubmissionEnabled: true,
              publishProgress: 0,
              global_deadline: null,
              global_start_date: null,
              preferencesProgress: 0,
              schedulingProgress: 0,
              roomUtilization: 0
            }),
            getRequestNotifications: () => of([])
          }
        }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(OverviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

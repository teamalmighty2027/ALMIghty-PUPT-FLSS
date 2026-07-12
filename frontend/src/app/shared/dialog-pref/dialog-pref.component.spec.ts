import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';

import { DialogPrefComponent } from './dialog-pref.component';
import {
  PreferencesService
} from '../../core/services/faculty/preference/preferences.service';
import {
  ReportHeaderService
} from '../../core/services/report-header/report-header.service';

describe('DialogPrefComponent', () => {
  let component: DialogPrefComponent;
  let fixture: ComponentFixture<DialogPrefComponent>;

  let mockPreferencesService: any;
  let mockReportHeaderService: any;
  let mockSnackBar: any;

  beforeEach(async () => {
    mockPreferencesService = jasmine.createSpyObj('PreferencesService', [
      'getPreferencesHistoryByFacultyId',
      'getPreferencesByFacultyId'
    ]);
    mockReportHeaderService = jasmine.createSpyObj('ReportHeaderService', [
      'getReportHeader'
    ]);
    mockSnackBar = jasmine.createSpyObj('MatSnackBar', ['open']);

    const mockHistory = { academic_years: [] };
    const mockPrefs = {
      preferences: {
        active_semesters: [
          {
            academic_year: '2023-2024',
            semester_label: 'First Semester',
            courses: []
          }
        ]
      }
    };

    mockPreferencesService.getPreferencesHistoryByFacultyId
      .and.returnValue(of(mockHistory));
    mockPreferencesService.getPreferencesByFacultyId
      .and.returnValue(of(mockPrefs));
    mockReportHeaderService.getReportHeader.and.returnValue(of({}));

    await TestBed.configureTestingModule({
      imports: [
        DialogPrefComponent,
        HttpClientTestingModule,
        NoopAnimationsModule
      ],
      providers: [
        { provide: MatDialogRef, useValue: { close: () => {} } },
        {
          provide: MAT_DIALOG_DATA,
          useValue: { faculty_id: 1, facultyName: 'Test' }
        },
        { provide: PreferencesService, useValue: mockPreferencesService },
        { provide: ReportHeaderService, useValue: mockReportHeaderService },
        { provide: MatSnackBar, useValue: mockSnackBar }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DialogPrefComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

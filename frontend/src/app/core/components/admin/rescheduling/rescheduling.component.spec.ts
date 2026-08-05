import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReschedulingComponent } from './rescheduling.component';
import { ReschedulingService } from '../../../services/faculty/rescheduling/rescheduling.service';
import { MatDialog } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { of } from 'rxjs';

import { MatSnackBar } from '@angular/material/snack-bar';
import {
  ReportsService
} from '../../../services/admin/reports/reports.service';
import {
  ReportHeaderService
} from '../../../services/report-header/report-header.service';
import {
  SpeechRecognitionService
} from '../../../services/speech/speech-recognition.service';

class MockReschedulingService {
  getAllAppeals() {
    return of([
      {
        appeal_id: 1,
        schedule_id: 101,
        faculty_name: 'John Doe',
        program_code: 'BSIT',
        course_title: 'Web Dev',
        original_day: 'Monday',
        original_start_time: '08:00',
        original_end_time: '10:00',
        original_room: 'LAB 1',
        is_approved: null,
        appeal_day: 'Tuesday',
        appeal_start_time: '09:00',
        appeal_end_time: '11:00',
        appeal_room: 'LAB 2',
        file_path: 'test.pdf',
        reasoning: 'Test reason'
      }
    ]);
  }

  approveAppeal() { return of({}); }
  denyAppeal() { return of({}); }
}

describe('ReschedulingComponent', () => {
  let component: ReschedulingComponent;
  let fixture: ComponentFixture<ReschedulingComponent>;
  let dialogSpy: any;

  beforeEach(async () => {
    dialogSpy = {
      open: jasmine.createSpy('open').and.returnValue({}),
      closeAll: jasmine.createSpy('closeAll')
    };

    const mockReportsService = {
      getAllTermsForDropdown: () => of([
        {
          active_semester_id: 1,
          year_start: 2023,
          year_end: 2024,
          semester: '1',
          is_active: 1
        }
      ]),
      getFacultySchedulesReport: (termId: number) => of({
        faculty_schedule_reports: {
          faculties: [
            {
              faculty_id: 1,
              faculty_name: 'John Doe',
              assigned_units: 3,
              is_appeal_enabled: true,
              has_appeal_request: false,
              schedules: []
            }
          ]
        }
      }),
      clearAllCaches: () => {}
    };

    const mockReportHeaderService = {
      getReportHeader: () => of({})
    };

    const mockSnackBar = {
      open: () => {}
    };

    const mockSpeechService = {
      isSupported: () => false,
      abort: () => {}
    };

    await TestBed.configureTestingModule({
      imports: [
        ReschedulingComponent,
        NoopAnimationsModule,
        HttpClientTestingModule
      ],
      providers: [
        { provide: ReschedulingService, useClass: MockReschedulingService },
        { provide: ReportsService, useValue: mockReportsService },
        { provide: ReportHeaderService, useValue: mockReportHeaderService },
        { provide: MatSnackBar, useValue: mockSnackBar },
        { provide: SpeechRecognitionService, useValue: mockSpeechService }
      ]
    })
    .overrideComponent(ReschedulingComponent, {
      set: {
        providers: [
          { provide: MatDialog, useValue: dialogSpy }
        ]
      }
    })
    .compileComponents();

    fixture = TestBed.createComponent(ReschedulingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load appeals into dataSource on init', () => {
    // We expect the mock data to be loaded into the table source
    expect(component.dataSource.data.length).toBeGreaterThan(0);
    expect(component.dataSource.data[0].facultyName).toBe('John Doe');
  });

  it('should generate time options', () => {
    expect(component.timeOptions.length).toBeGreaterThan(0);
  });

  it('should open dialog when review is clicked', () => {
    const mockAppeal = component.dataSource.data[0];
    
    // Call the new method name
    component.openEditDialog(mockAppeal);
    
    // Check if the Dialog Service was called
    expect(dialogSpy.open).toHaveBeenCalled();
    // Check if selectedAppeal was set
    expect(component.selectedAppeal).toEqual(jasmine.objectContaining({
      facultyName: 'John Doe'
    }));
  });

  it('should close dialog', () => {
    // Call the new method name
    component.closeDialog();
    
    // Check if dialog.closeAll() was called
    expect(dialogSpy.closeAll).toHaveBeenCalled();
    expect(component.selectedAppeal).toBeNull();
  });

  it('should have original schedule data mapped correctly', () => {
    const mockAppeal = component.dataSource.data[0];
    expect(mockAppeal.originalDay).toBe('Monday');
    expect(mockAppeal.originalStartTime).toBeDefined();
  });
});
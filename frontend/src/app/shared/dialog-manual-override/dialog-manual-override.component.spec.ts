import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of } from 'rxjs';

import { DialogManualOverrideComponent } from './dialog-manual-override.component';
import {
  SchedulingService
} from '../../core/services/admin/scheduling/scheduling.service';
import {
  ReschedulingService
} from '../../core/services/faculty/rescheduling/rescheduling.service';

describe('DialogManualOverrideComponent', () => {
  let component: DialogManualOverrideComponent;
  let fixture: ComponentFixture<DialogManualOverrideComponent>;

  beforeEach(async () => {
    const dialogRefSpy = jasmine.createSpyObj('MatDialogRef', ['close']);
    const schedulingSpy = jasmine.createSpyObj('SchedulingService', [
      'getAllRooms',
    ]);
    const reschedulingSpy = jasmine.createSpyObj('ReschedulingService', [
      'checkOverrideConflict',
    ]);

    schedulingSpy.getAllRooms.and.returnValue(
      of({ rooms: [{ room_code: 'A401', status: 'Available' }] })
    );

    const mockData = {
      original: {
        scheduleId: 1,
        courseCode: 'CS101',
        courseTitle: 'Introduction to Computing',
        program: 'BSIT',
        yearLevel: '1',
        section: '1',
        day: 'Monday',
        roomCode: 'A401',
        timeRange: '08:00 AM - 11:00 AM',
      },
      facultyName: 'Prof. Test',
      options: {
        timeOptions: ['08:00 AM', '09:00 AM'],
        endTimeOptions: ['09:00 AM', '10:00 AM'],
      },
    };

    await TestBed.configureTestingModule({
      imports: [
        DialogManualOverrideComponent,
        HttpClientTestingModule,
        MatSnackBarModule,
        NoopAnimationsModule,
      ],
      providers: [
        { provide: MatDialogRef, useValue: dialogRefSpy },
        { provide: MAT_DIALOG_DATA, useValue: mockData },
        { provide: SchedulingService, useValue: schedulingSpy },
        { provide: ReschedulingService, useValue: reschedulingSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DialogManualOverrideComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

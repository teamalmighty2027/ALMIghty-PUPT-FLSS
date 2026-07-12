import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { DialogSchedulingComponent } from './dialog-scheduling.component';

describe('DialogSchedulingComponent', () => {
  let component: DialogSchedulingComponent;
  let fixture: ComponentFixture<DialogSchedulingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        DialogSchedulingComponent,
        HttpClientTestingModule,
        NoopAnimationsModule
      ],
      providers: [
        { provide: MatDialogRef, useValue: { close: () => {} } },
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            program: { id: 1, info: 'test' },
            academic: { year_level: 1, section_id: 1 },
            options: {
              dayOptions: ['Monday', 'Tuesday'],
              timeOptions: ['08:00 AM'],
              endTimeOptions: ['09:00 AM'],
              professorOptions: ['Prof. Test'],
              roomOptions: ['Room 101']
            },
            facultyOptions: [],
            roomOptionsList: [],
            selectedProgramInfo: 'BSCS',
            selectedCourseInfo: 'CS101',
            suggestedFaculty: [],
            schedule_id: 1,
            course_id: 101
          }
        },
      ],
    })
    .compileComponents();

    fixture = TestBed.createComponent(DialogSchedulingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

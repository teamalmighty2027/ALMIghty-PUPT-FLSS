import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { DialogScheduleDetailsComponent } from './dialog-schedule-details.component';

describe('DialogScheduleDetailsComponent', () => {
  let component: DialogScheduleDetailsComponent;
  let fixture: ComponentFixture<DialogScheduleDetailsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DialogScheduleDetailsComponent],
      providers: [
        { provide: MatDialogRef, useValue: { close: () => {} } },
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            schedule: {
              day: 'Monday',
              start_time: '08:00',
              end_time: '10:00',
              room_code: 'LAB 1',
              program_code: 'BSCS',
              program_title: 'Computer Science',
              year_level: 1,
              section_name: 'A',
              course_details: {
                course_code: 'CS101',
                course_title: 'Intro to CS',
                units: 3,
                lec: 3,
                lab: 0
              }
            },
            color: { primary: '#fff', secondary: '#000', text: '#333' }
          }
        }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DialogScheduleDetailsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

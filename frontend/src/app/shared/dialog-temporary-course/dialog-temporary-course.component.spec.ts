import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { DialogTemporaryCourseComponent } from './dialog-temporary-course.component';

describe('DialogTemporaryCourseComponent', () => {
  let component: DialogTemporaryCourseComponent;
  let fixture: ComponentFixture<DialogTemporaryCourseComponent>;

  const mockDialogData = {
    programLabel: 'BSIT - Information Technology',
    yearLevel: 1,
    sections: [
      { section_id: 1, section_name: '1' },
      { section_id: 2, section_name: '2' },
    ],
    defaultSectionId: 1,
    courses: [
      {
        course_id: 101,
        course_code: 'IT 101',
        course_title: 'Intro to IT',
        lec_hours: 3,
        lab_hours: 0,
        units: 3,
        tuition_hours: 3,
      },
    ],
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DialogTemporaryCourseComponent, NoopAnimationsModule],
      providers: [
        { provide: MatDialogRef, useValue: { close: () => {} } },
        { provide: MAT_DIALOG_DATA, useValue: mockDialogData },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DialogTemporaryCourseComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

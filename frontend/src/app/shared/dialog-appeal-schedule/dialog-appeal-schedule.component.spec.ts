import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DialogAppealScheduleComponent } from './dialog-appeal-schedule.component';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('DialogAppealScheduleComponent', () => {
  let component: DialogAppealScheduleComponent;
  let fixture: ComponentFixture<DialogAppealScheduleComponent>;

  const mockDialogData = {
    block: {
      courseCode: 'COMP 101',
      courseTitle: 'Intro to Computing',
      program: 'BSIT',
      yearLevel: 1,
      section: '1',
      day: 'Monday',
      roomCode: 'LAB 1'
    },
    timeRange: '7:00 AM - 9:00 AM'
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DialogAppealScheduleComponent, NoopAnimationsModule],
      providers: [
        { provide: MatDialogRef, useValue: { close: () => {} } },
        { provide: MAT_DIALOG_DATA, useValue: mockDialogData }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DialogAppealScheduleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { DialogViewScheduleComponent } from './dialog-view-schedule.component';

describe('DialogViewScheduleComponent', () => {
  let component: DialogViewScheduleComponent;
  let fixture: ComponentFixture<DialogViewScheduleComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DialogViewScheduleComponent],
      providers: [
        { provide: MatDialogRef, useValue: { close: () => {} } },
        { provide: MAT_DIALOG_DATA, useValue: {} }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DialogViewScheduleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

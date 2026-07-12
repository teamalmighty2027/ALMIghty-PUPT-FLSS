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
            schedule: {},
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

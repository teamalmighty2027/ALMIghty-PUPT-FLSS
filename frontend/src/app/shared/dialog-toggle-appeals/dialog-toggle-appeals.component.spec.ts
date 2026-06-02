import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { DialogToggleAppealsComponent } from './dialog-toggle-appeals.component';

describe('DialogToggleAppealsComponent', () => {
  let component: DialogToggleAppealsComponent;
  let fixture: ComponentFixture<DialogToggleAppealsComponent>;

  const mockDialogData = {
    type: 'all_appeals',
    academicYear: '2024-2025',
    semester: '1st Semester',
    currentState: false,
    startDate: null,
    endDate: null
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DialogToggleAppealsComponent, NoopAnimationsModule],
      providers: [
        { provide: MatDialogRef, useValue: { close: () => {} } },
        { provide: MAT_DIALOG_DATA, useValue: mockDialogData }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DialogToggleAppealsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';

import { DialogBirthdateWarningComponent } from './dialog-birthdate-warning.component';

describe('DialogBirthdateWarningComponent', () => {
  let component: DialogBirthdateWarningComponent;
  let fixture: ComponentFixture<DialogBirthdateWarningComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DialogBirthdateWarningComponent],
      providers: [
        { provide: MatDialogRef, useValue: { close: () => {} } }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DialogBirthdateWarningComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

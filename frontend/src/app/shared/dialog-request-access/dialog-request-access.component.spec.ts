import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { DialogRequestAccessComponent } from './dialog-request-access.component';

describe('DialogRequestAccessComponent', () => {
  let component: DialogRequestAccessComponent;
  let fixture: ComponentFixture<DialogRequestAccessComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DialogRequestAccessComponent],
      providers: [
        { provide: MatDialogRef, useValue: { close: () => {} } },
        { provide: MAT_DIALOG_DATA, useValue: {} }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DialogRequestAccessComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

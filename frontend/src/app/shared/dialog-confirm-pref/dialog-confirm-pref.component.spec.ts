import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { DialogConfirmPrefComponent } from './dialog-confirm-pref.component';

describe('DialogConfirmPrefComponent', () => {
  let component: DialogConfirmPrefComponent;
  let fixture: ComponentFixture<DialogConfirmPrefComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        DialogConfirmPrefComponent,
        NoopAnimationsModule
      ],
      providers: [
        { provide: MatDialogRef, useValue: { close: () => {} } },
        { provide: MAT_DIALOG_DATA, useValue: {} }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DialogConfirmPrefComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { DialogGenericComponent } from './dialog-generic.component';

describe('DialogGenericComponent', () => {
  let component: DialogGenericComponent;
  let fixture: ComponentFixture<DialogGenericComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DialogGenericComponent],
      providers: [
        { provide: MatDialogRef, useValue: { close: () => {} } },
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            title: 'Confirm',
            content: 'Are you sure?',
            action: 'Confirm'
          }
        }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DialogGenericComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

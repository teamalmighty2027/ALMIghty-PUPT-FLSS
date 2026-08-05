import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { HttpClientTestingModule } from '@angular/common/http/testing';

import { DialogTermsConditionsComponent } from './dialog-terms-conditions.component';

describe('DialogTermsConditionsComponent', () => {
  let component: DialogTermsConditionsComponent;
  let fixture: ComponentFixture<DialogTermsConditionsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DialogTermsConditionsComponent, HttpClientTestingModule],
      providers: [
        { provide: MatDialogRef, useValue: { close: () => {} } },
        { provide: MAT_DIALOG_DATA, useValue: {} }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DialogTermsConditionsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

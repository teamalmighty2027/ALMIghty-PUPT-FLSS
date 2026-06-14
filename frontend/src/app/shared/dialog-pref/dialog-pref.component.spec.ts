import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { HttpClientTestingModule } from '@angular/common/http/testing';

import { DialogPrefComponent } from './dialog-pref.component';

describe('DialogPrefComponent', () => {
  let component: DialogPrefComponent;
  let fixture: ComponentFixture<DialogPrefComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DialogPrefComponent, HttpClientTestingModule],
      providers: [
        { provide: MatDialogRef, useValue: { close: () => {} } },
        { provide: MAT_DIALOG_DATA, useValue: {} }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DialogPrefComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

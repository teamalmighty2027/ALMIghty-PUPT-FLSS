import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';

import { DialogUnsavedPreferencesComponent } from './dialog-unsaved-preferences.component';

describe('DialogUnsavedPreferencesComponent', () => {
  let component: DialogUnsavedPreferencesComponent;
  let fixture: ComponentFixture<DialogUnsavedPreferencesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DialogUnsavedPreferencesComponent],
      providers: [
        { provide: MatDialogRef, useValue: { close: () => {} } }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DialogUnsavedPreferencesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

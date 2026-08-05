import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import {
  PreferencesService
} from '../../core/services/faculty/preference/preferences.service';

import { DialogTogglePreferencesComponent } from './dialog-toggle-preferences.component';

describe('DialogTogglePreferencesComponent', () => {
  let component: DialogTogglePreferencesComponent;
  let fixture: ComponentFixture<DialogTogglePreferencesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DialogTogglePreferencesComponent, NoopAnimationsModule],
      providers: [
        { provide: MatDialogRef, useValue: { close: () => {} } },
        {
          provide: MAT_DIALOG_DATA,
          useValue: { type: 'all_preferences', currentState: false }
        },
        {
          provide: MatSnackBar,
          useValue: jasmine.createSpyObj('MatSnackBar', ['open'])
        },
        {
          provide: PreferencesService,
          useValue: jasmine.createSpyObj('PreferencesService', [
            'toggleAllPreferences',
            'toggleSingleFacultyPreferences'
          ])
        }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DialogTogglePreferencesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

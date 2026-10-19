import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter } from '@angular/router';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { DialogFacultyLoginComponent } from './dialog-faculty-login.component';

describe('DialogFacultyLoginComponent', () => {
  let component: DialogFacultyLoginComponent;
  let fixture: ComponentFixture<DialogFacultyLoginComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        DialogFacultyLoginComponent,
        HttpClientTestingModule,
        NoopAnimationsModule
      ],
      providers: [
        { provide: MatDialogRef, useValue: { close: () => {} } },
        { provide: MAT_DIALOG_DATA, useValue: {} },
        {
          provide: MatSnackBar,
          useValue: jasmine.createSpyObj('MatSnackBar', ['open'])
        },
        provideRouter([])
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DialogFacultyLoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

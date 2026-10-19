import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  MatDialogRef,
  MAT_DIALOG_DATA,
  MatDialog,
} from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { DialogViewInternalArrangementsComponent } from './dialog-view-internal-arrangements.component';

describe('DialogViewInternalArrangementsComponent', () => {
  let component: DialogViewInternalArrangementsComponent;
  let fixture: ComponentFixture<DialogViewInternalArrangementsComponent>;

  beforeEach(async () => {
    const dialogRefSpy = jasmine.createSpyObj('MatDialogRef', ['close']);
    const dialogSpy = jasmine.createSpyObj('MatDialog', ['open']);

    await TestBed.configureTestingModule({
      imports: [
        DialogViewInternalArrangementsComponent,
        NoopAnimationsModule,
      ],
      providers: [
        { provide: MatDialogRef, useValue: dialogRefSpy },
        { provide: MatDialog, useValue: dialogSpy },
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            facultyName: 'Test Faculty',
            academicYear: '2025-2026',
            semester: '1st Semester',
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(
      DialogViewInternalArrangementsComponent
    );
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

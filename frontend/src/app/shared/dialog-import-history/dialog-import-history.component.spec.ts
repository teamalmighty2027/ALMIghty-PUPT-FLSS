import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DialogImportHistoryComponent } from './dialog-import-history.component';
import { PreferencesService } from '../../core/services/faculty/preference/preferences.service';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('DialogImportHistoryComponent', () => {
  let component: DialogImportHistoryComponent;
  let fixture: ComponentFixture<DialogImportHistoryComponent>;
  let mockPreferencesService: jasmine.SpyObj<PreferencesService>;
  let mockDialogRef: jasmine.SpyObj<MatDialogRef<DialogImportHistoryComponent>>;

  const mockData = {
    facultyId: 1,
    availableCourses: [
      {
        course_id: 101,
        course_code: 'CS101',
        course_title: 'Intro to CS',
        units: 3,
        lec_hours: 3,
        lab_hours: 0
      }
    ] as any,
    existingKeys: [],
    currentSemesterId: 1
  };

  const mockHistoryResponse = {
    academic_years: [
      {
        academic_year_id: 1,
        academic_year: '2023-2024',
        semesters: [
          {
            semester_id: 1,
            preferences: [
              {
                is_temporary: false,
                course_details: {
                  course_code: 'CS101',
                  course_title: 'Intro to CS'
                }
              }
            ]
          }
        ]
      }
    ]
  };

  beforeEach(async () => {
    mockPreferencesService = jasmine.createSpyObj('PreferencesService', ['getPreferencesHistoryByFacultyId']);
    mockDialogRef = jasmine.createSpyObj('MatDialogRef', ['close']);

    mockPreferencesService.getPreferencesHistoryByFacultyId.and.returnValue(of(mockHistoryResponse));

    await TestBed.configureTestingModule({
      imports: [DialogImportHistoryComponent, NoopAnimationsModule],
      providers: [
        { provide: PreferencesService, useValue: mockPreferencesService },
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: mockData }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(DialogImportHistoryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load history on init', () => {
    expect(mockPreferencesService.getPreferencesHistoryByFacultyId).toHaveBeenCalledWith('1');
    expect(component.academicYearList().length).toBe(1);
    expect(component.selectedYear()).toEqual(mockHistoryResponse.academic_years[0]);
  });

  it('should filter importable courses based on available courses', () => {
    const importable = component.importableCourses();
    expect(importable.length).toBe(1);
    expect(importable[0].course_details.course_code).toBe('CS101');
  });

  it('should toggle selection', () => {
    const key = component.importableCourses()[0].key;
    component.toggleSelection(key);
    expect(component.selectedCourses.has(key)).toBeTrue();
    
    component.toggleSelection(key);
    expect(component.selectedCourses.has(key)).toBeFalse();
  });

  it('should import selected courses', () => {
    const importable = component.importableCourses()[0];
    component.toggleSelection(importable.key);
    
    component.importSelected();
    
    expect(mockDialogRef.close).toHaveBeenCalledWith([importable.currentMatch]);
  });
});

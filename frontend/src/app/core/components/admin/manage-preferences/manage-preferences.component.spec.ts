/// <reference types="jasmine" />

import { CUSTOM_ELEMENTS_SCHEMA, ChangeDetectorRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSlideToggleChange } from '@angular/material/slide-toggle';
import { of } from 'rxjs';

import { ManagePreferencesComponent } from './manage-preferences.component';
import { PreferencesService } from '../../../services/faculty/preference/preferences.service';
import { ReportHeaderService } from '../../../services/report-header/report-header.service';
import { ReportsService } from '../../../services/admin/reports/reports.service';

describe('ManagePreferencesComponent', () => {
  let component: ManagePreferencesComponent;
  let fixture: ComponentFixture<ManagePreferencesComponent>;

  let preferencesServiceSpy: jasmine.SpyObj<PreferencesService>;
  let reportsServiceSpy: jasmine.SpyObj<ReportsService>;
  let dialogSpy: jasmine.SpyObj<MatDialog>;

  beforeEach(async () => {
    preferencesServiceSpy = jasmine.createSpyObj('PreferencesService', [
      'clearPreferencesCache',
      'getPreferences',
    ]);
    reportsServiceSpy = jasmine.createSpyObj('ReportsService', [
      'getAllTermsForDropdown',
    ]);
    dialogSpy = jasmine.createSpyObj('MatDialog', ['open']);

    reportsServiceSpy.getAllTermsForDropdown.and.returnValue(of([]));
    dialogSpy.open.and.returnValue({
      afterClosed: () => of(true),
    } as any);

    await TestBed.configureTestingModule({
      imports: [ManagePreferencesComponent],
      providers: [
        { provide: PreferencesService, useValue: preferencesServiceSpy },
        { provide: ReportsService, useValue: reportsServiceSpy },
        {
          provide: MatDialog,
          useValue: dialogSpy,
        },
        {
          provide: MatSnackBar,
          useValue: jasmine.createSpyObj('MatSnackBar', ['open']),
        },
        {
          provide: ChangeDetectorRef,
          useValue: jasmine.createSpyObj('ChangeDetectorRef', [
            'markForCheck',
            'detectChanges',
          ]),
        },
        {
          provide: ReportHeaderService,
          useValue: jasmine.createSpyObj('ReportHeaderService', ['addHeader']),
        },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(ManagePreferencesComponent);
    component = fixture.componentInstance;
  });

  it('reloads the selected term after confirming toggle-all', () => {
    const loadSpy = spyOn(component, 'loadFacultyPreferences').and.stub();

    component.selectedTermId = 42;
    component.isToggleAllChecked = true;
    component.allData = [
      {
        faculty_id: 1,
        facultyName: 'Test Faculty',
        facultyCode: 'TF-01',
        facultyType: 'Full-time',
        facultyUnits: 3,
        is_enabled: true,
        has_request: 0,
        active_semesters: [
          {
            academic_year: '2024-2025',
            semester_label: '1st Semester',
            global_deadline: null,
            global_start_date: null,
            individual_deadline: null,
            individual_start_date: null,
            courses: [],
          },
        ],
      },
    ] as any;
    component.filteredData = [...component.allData];

    const event = new MatSlideToggleChange({ checked: false } as any, false);

    component.onToggleAllPreferences(event);

    expect(preferencesServiceSpy.clearPreferencesCache).toHaveBeenCalled();
    expect(loadSpy).toHaveBeenCalledWith(42);
    expect(dialogSpy.open).toHaveBeenCalled();
  });

  it('does not reload preferences when toggle-all is cancelled', () => {
    dialogSpy.open.and.returnValue({
      afterClosed: () => of(false),
    } as any);

    const loadSpy = spyOn(component, 'loadFacultyPreferences').and.stub();

    component.selectedTermId = 42;
    component.isToggleAllChecked = false;
    component.allData = [
      {
        faculty_id: 1,
        facultyName: 'Test Faculty',
        facultyCode: 'TF-01',
        facultyType: 'Full-time',
        facultyUnits: 3,
        is_enabled: false,
        has_request: 0,
        active_semesters: [
          {
            academic_year: '2024-2025',
            semester_label: '1st Semester',
            global_deadline: null,
            global_start_date: null,
            individual_deadline: null,
            individual_start_date: null,
            courses: [],
          },
        ],
      },
    ] as any;
    component.filteredData = [...component.allData];

    const event = new MatSlideToggleChange({ checked: true } as any, true);

    component.onToggleAllPreferences(event);

    expect(preferencesServiceSpy.clearPreferencesCache).not.toHaveBeenCalled();
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it('keeps the global toggle enabled when it is currently checked', () => {
    component.isToggleAllChecked = true;
    component.isEnabled = true;
    component.isIndividualStartDateSet = true;

    const toggleState = component.getToggleState({
      faculty_id: 1,
      facultyName: 'Test Faculty',
      facultyCode: 'TF-01',
      facultyType: 'Full-time',
      facultyUnits: 3,
      is_enabled: true,
      has_request: 0,
      active_semesters: [],
    });

    expect(toggleState.isGlobalDisabled).toBeFalse();
  });
});

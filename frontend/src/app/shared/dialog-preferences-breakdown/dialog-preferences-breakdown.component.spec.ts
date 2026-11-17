import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import {
  DialogPreferencesBreakdownComponent,
} from './dialog-preferences-breakdown.component';
import {
  OverviewService,
  PreferencesBreakdownResponse,
} from '../../core/services/admin/overview/overview.service';

describe('DialogPreferencesBreakdownComponent', () => {
  let component: DialogPreferencesBreakdownComponent;
  let fixture: ComponentFixture<DialogPreferencesBreakdownComponent>;

  const mockBreakdownResponse: PreferencesBreakdownResponse = {
    academic_year: '2024-2025',
    semester: '1st Semester',
    total_preferences_submitted: 10,
    total_subjects_offered: 20,
    total_subjects_with_preferences: 15,
    overall_subject_coverage_percentage: 75,
    general_education: {
      category_name: 'General Education',
      category_code: 'GEED',
      total_subjects_offered: 6,
      subjects_with_preferences: 5,
      subject_coverage_percentage: 83.3,
      preference_submissions_count: 5,
      preference_share_percentage: 50,
      unassigned_courses: [
        {
          course_id: 1,
          course_code: 'GEED 001',
          course_title: 'Understanding the Self',
        },
      ],
      assigned_courses: [],
    },
    programs: [
      {
        program_id: 1,
        program_code: 'BSIT',
        program_title: 'BS Information Technology',
        total_subjects_offered: 14,
        subjects_with_preferences: 10,
        subject_coverage_percentage: 71.4,
        preference_submissions_count: 5,
        preference_share_percentage: 50,
        unassigned_courses: [],
        assigned_courses: [],
      },
    ],
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        DialogPreferencesBreakdownComponent,
        NoopAnimationsModule,
      ],
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            academicYear: '2024-2025',
            semester: '1st Semester',
            activeSemesterId: 1,
          },
        },
        {
          provide: MatDialogRef,
          useValue: { close: jasmine.createSpy('close') },
        },
        {
          provide: OverviewService,
          useValue: {
            getPreferencesBreakdown: () => of(mockBreakdownResponse),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DialogPreferencesBreakdownComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should toggle unassigned course expansion', () => {
    expect(component.isExpanded('GEED')).toBeFalse();
    component.toggleExpand('GEED');
    expect(component.isExpanded('GEED')).toBeTrue();
    component.toggleExpand('GEED');
    expect(component.isExpanded('GEED')).toBeFalse();
  });

  it('should return appropriate coverage class', () => {
    expect(component.getCoverageClass(85)).toBe('coverage-high');
    expect(component.getCoverageClass(60)).toBe('coverage-medium');
    expect(component.getCoverageClass(30)).toBe('coverage-low');
  });
});

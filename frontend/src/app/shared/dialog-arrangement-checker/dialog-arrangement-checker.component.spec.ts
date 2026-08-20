import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DialogArrangementCheckerComponent, DialogArrangementCheckerData } from './dialog-arrangement-checker.component';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { ScheduleValidationService } from '../../core/services/admin/scheduling/schedule-validation.service';

describe('DialogArrangementCheckerComponent', () => {
  let component: DialogArrangementCheckerComponent;
  let fixture: ComponentFixture<DialogArrangementCheckerComponent>;
  let mockDialogRef: jasmine.SpyObj<MatDialogRef<DialogArrangementCheckerComponent>>;
  let mockValidationService: jasmine.SpyObj<ScheduleValidationService>;

  const mockData: DialogArrangementCheckerData = {
    cachedSchedules: {
      active_semester_id: 1,
      academic_year_id: 1,
      semester_id: 1,
      is_submission_enabled: 1,
      programs: [
        {
          program_id: 10,
          program_code: 'BSIT',
          program_title: 'Bachelor of Science in Information Technology',
          year_levels: [
            {
              year_level: 1,
              curriculum_id: 1,
              curriculum_year: '2024',
              semesters: [
                {
                  semester: 1,
                  sections: [
                    {
                      section_per_program_year_id: 100,
                      section_name: '1',
                      courses: [
                        {
                          course_assignment_id: 1,
                          course_id: 50,
                          course_code: 'COMP 101',
                          course_title: 'Introduction to Computing',
                          lec_hours: 2,
                          lab_hours: 3,
                          units: 3,
                          tuition_hours: 5,
                          professor: 'Prof. Dela Cruz',
                          faculty_id: 23,
                          faculty_email: 'delacruz@pupt.edu.ph',
                          section_course_id: 500,
                          room: {
                            room_id: 5,
                            room_code: 'LAB 1',
                          },
                          schedule: {
                            schedule_id: 1000,
                            day: 'Monday',
                            start_time: '07:00:00',
                            end_time: '10:00:00',
                            room_id: 5,
                          },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    cachedRooms: {
      rooms: [
        {
          room_id: 5,
          room_code: 'LAB 1',
          location: 'Main Building',
          floor_level: '2',
          room_type: 'Laboratory',
          capacity: 40,
          status: 'Active',
        },
      ],
    },
    cachedArrangements: [],
    faculties: [
      { facultyId: 23, facultyName: 'Prof. Dela Cruz' },
    ],
    rooms: [
      {
        room_id: 5,
        room_code: 'LAB 1',
        location: 'Main Building',
        floor_level: '2',
        room_type: 'Laboratory',
        capacity: 40,
        status: 'Active',
      },
    ],
  };

  beforeEach(async () => {
    mockDialogRef = jasmine.createSpyObj('MatDialogRef', ['close']);
    mockValidationService = jasmine.createSpyObj('ScheduleValidationService', [
      'validateScheduleConflictsWithArrangements',
    ]);

    await TestBed.configureTestingModule({
      imports: [
        DialogArrangementCheckerComponent,
        NoopAnimationsModule,
        HttpClientTestingModule,
      ],
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: mockData },
        { provide: ScheduleValidationService, useValue: mockValidationService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DialogArrangementCheckerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should extract programs from cached schedules', () => {
    expect(component.programsList.length).toBe(1);
    expect(component.programsList[0].program_code).toBe('BSIT');
  });

  it('should update available year levels when a program is selected', () => {
    component.checkerForm.patchValue({ program_id: 10 });
    expect(component.availableYearLevels).toEqual([1]);
  });

  it('should update available sections when year level is selected', () => {
    component.checkerForm.patchValue({ program_id: 10, year_level: 1 });
    expect(component.availableSections.length).toBe(1);
    expect(component.availableSections[0].display_name).toBe('BSIT 1-1');
  });

  it('should update available courses when section is selected', () => {
    component.checkerForm.patchValue({ program_id: 10, year_level: 1 });
    component.checkerForm.patchValue({ section_id: 100 });
    expect(component.availableCourses.length).toBe(1);
    expect(component.availableCourses[0].course_code).toBe('COMP 101');
  });

  it('should auto-fill faculty_id and room_id when course is selected', () => {
    component.checkerForm.patchValue({ program_id: 10, year_level: 1 });
    component.checkerForm.patchValue({ section_id: 100 });
    component.checkerForm.patchValue({ course_id: 50 });

    expect(component.checkerForm.get('faculty_id')?.value).toBe(23);
    expect(component.checkerForm.get('room_id')?.value).toBe(5);
  });

  it('should run conflict check and display success card when no conflicts exist', () => {
    mockValidationService.validateScheduleConflictsWithArrangements.and.returnValue({
      hasConflicts: false,
      messages: [],
      warnings: [],
    });

    component.checkerForm.patchValue({
      program_id: 10,
      year_level: 1,
      section_id: 100,
      course_id: 50,
      faculty_id: 23,
      room_id: 5,
      day: 'Tuesday',
      start_time: '7:00 AM',
      end_time: '10:00 AM',
    });

    component.runCheck();

    expect(component.hasRunCheck).toBeTrue();
    expect(component.hasConflicts).toBeFalse();
    expect(component.conflictMessages.length).toBe(0);
  });

  it('should run conflict check and display conflict card when conflicts exist', () => {
    mockValidationService.validateScheduleConflictsWithArrangements.and.returnValue({
      hasConflicts: true,
      messages: ['Prof. Dela Cruz is already assigned to another course on Tuesday from 7:00 AM to 10:00 AM.'],
      warnings: [],
    });

    component.checkerForm.patchValue({
      program_id: 10,
      year_level: 1,
      section_id: 100,
      course_id: 50,
      faculty_id: 23,
      room_id: 5,
      day: 'Tuesday',
      start_time: '7:00 AM',
      end_time: '10:00 AM',
    });

    component.runCheck();

    expect(component.hasRunCheck).toBeTrue();
    expect(component.hasConflicts).toBeTrue();
    expect(component.conflictMessages[0]).toContain('already assigned');
  });

  it('should close dialog when close() is called', () => {
    component.close();
    expect(mockDialogRef.close).toHaveBeenCalled();
  });
});

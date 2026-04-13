import { TestBed } from '@angular/core/testing';
import { DraftStateService, DraftEntry } from './draft-state.service';
import { Schedule } from '../../../models/scheduling.model';

describe('DraftStateService', () => {
  let service: DraftStateService;

  const mockSchedules: Schedule[] = [
    {
      schedule_id: 1,
      course_id: 101,
      course_code: 'CS101',
      course_title: 'Intro to CS',
      lec_hours: 3,
      lab_hours: 0,
      units: 3,
      tuition_hours: 3,
      day: 'Monday',
      time: '08:00:00 - 09:00:00',
      start_time: '08:00:00',
      end_time: '09:00:00',
      professor: 'Dr. Smith',
      faculty_id: 1,
      room: 'Room 101',
      room_id: 1,
      program: 'BSCS',
      program_code: 'BSCS',
      year: 1,
      curriculum: '2024',
      section: 'A',
      section_course_id: 1,
      is_copy: 0
    }
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DraftStateService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should initialize state from schedules', () => {
    service.initFromSchedules(mockSchedules);
    const entry = service.get(1);
    expect(entry).toBeDefined();
    expect(entry?.faculty_id).toBe(1);
    expect(entry?.day).toBe('Monday');
    expect(service.hasDirtyEntries()).toBeFalse();
  });

  it('should detect dirty entries when modified', () => {
    service.initFromSchedules(mockSchedules);
    const entry = service.get(1)!;
    
    const modifiedEntry: DraftEntry = {
      ...entry,
      day: 'Tuesday'
    };
    
    service.set(1, modifiedEntry);
    
    expect(service.hasDirtyEntries()).toBeTrue();
    expect(service.getDirty().length).toBe(1);
    expect(service.getDirty()[0].day).toBe('Tuesday');
  });

  it('should clear state', () => {
    service.initFromSchedules(mockSchedules);
    service.clear();
    expect(service.get(1)).toBeUndefined();
    expect(service.hasDirtyEntries()).toBeFalse();
  });

  it('should return conflicted entries', () => {
    service.initFromSchedules(mockSchedules);
    const entry = service.get(1)!;
    service.set(1, { ...entry, hasConflict: true });
    
    expect(service.getConflicted().length).toBe(1);
    expect(service.getConflicted()[0].schedule_id).toBe(1);
  });
});

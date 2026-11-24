import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';

import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
    });
    service = TestBed.inject(AuthService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // Verifies that getUserFacultyId returns string representation of faculty_id
  it('should return string faculty ID when faculty_id is a number', () => {
    spyOn(service, 'getUserData').and.returnValue({
      faculty: { faculty_id: 12 },
    });

    expect(service.getUserFacultyId()).toBe('12');
  });

  // Verifies that getUserFacultyId returns empty string when faculty is missing
  it('should return empty string when faculty is undefined', () => {
    spyOn(service, 'getUserData').and.returnValue({});

    expect(service.getUserFacultyId()).toBe('');
  });
});

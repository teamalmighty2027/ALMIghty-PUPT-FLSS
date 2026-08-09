import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';

import { FacultyNotificationService } from './faculty-notification.service';

describe('FacultyNotificationService', () => {
  let service: FacultyNotificationService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
    });
    service = TestBed.inject(FacultyNotificationService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});

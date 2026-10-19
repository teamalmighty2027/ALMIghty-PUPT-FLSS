import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';

import { ReschedulingService } from './rescheduling.service';

describe('ReschedulingService', () => {
  let service: ReschedulingService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
    });
    service = TestBed.inject(ReschedulingService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});

import { TestBed } from '@angular/core/testing';

import { ReschedulingService } from './rescheduling.service';

describe('ReschedulingService', () => {
  let service: ReschedulingService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ReschedulingService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});

import { TestBed } from '@angular/core/testing';

import { ScheduleSuggestionService } from './schedule-suggestion.service';

describe('ScheduleSuggestionService', () => {
  let service: ScheduleSuggestionService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ScheduleSuggestionService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});

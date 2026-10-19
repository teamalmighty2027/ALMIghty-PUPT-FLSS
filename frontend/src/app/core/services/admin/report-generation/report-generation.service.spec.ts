import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';

import { ReportGenerationService } from './report-generation.service';

describe('ReportGenerationService', () => {
  let service: ReportGenerationService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
    });
    service = TestBed.inject(ReportGenerationService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});

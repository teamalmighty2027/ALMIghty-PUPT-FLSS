import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';

import { LogoService } from './logo.service';

describe('LogoService', () => {
  let service: LogoService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
    });
    service = TestBed.inject(LogoService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});

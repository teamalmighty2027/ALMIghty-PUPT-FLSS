import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { SystemNoticeService } from './system-notice.service';

describe('SystemNoticeService', () => {
  let service: SystemNoticeService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [SystemNoticeService],
    });
    service = TestBed.inject(SystemNoticeService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});

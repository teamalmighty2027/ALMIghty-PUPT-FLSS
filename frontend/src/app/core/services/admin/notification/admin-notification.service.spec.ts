import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';

import { AdminNotificationService } from './admin-notification.service';

describe('AdminNotificationService', () => {
  let service: AdminNotificationService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [AdminNotificationService]
    });
    service = TestBed.inject(AdminNotificationService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});

import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { EmailsService } from './emails.service';
import { environment } from '../../../../../environments/environment.dev';

describe('EmailsService', () => {
  let service: EmailsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [EmailsService],
    });
    service = TestBed.inject(EmailsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should fetch email logs via GET', () => {
    const mockResponse = {
      data: [
        {
          id: 1,
          faculty_id: 10,
          recipient_email: 'test@example.com',
          recipient_name: 'Test Faculty',
          purpose: 'preference_toggle' as const,
          status: 'sent' as const,
          error_message: null,
          dispatched_at: '2026-10-11T12:00:00Z',
          processed_at: '2026-10-11T12:00:02Z',
        },
      ],
      current_page: 1,
      last_page: 1,
      per_page: 15,
      total: 1,
    };

    service.getEmailLogs({ status: 'sent', page: 1 }).subscribe((res) => {
      expect(res.data.length).toBe(1);
      expect(res.data[0].status).toBe('sent');
      expect(res.total).toBe(1);
    });

    const req = httpMock.expectOne(
      `${environment.apiUrl}/emails/email-logs?status=sent&page=1`
    );
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });

  it('should fetch email metrics via GET', () => {
    const mockMetrics = { queued: 2, sent: 25, failed: 1 };

    service.getEmailMetrics().subscribe((metrics) => {
      expect(metrics.sent).toBe(25);
      expect(metrics.failed).toBe(1);
      expect(metrics.queued).toBe(2);
    });

    const req = httpMock.expectOne(
      `${environment.apiUrl}/emails/email-metrics`
    );
    expect(req.request.method).toBe('GET');
    req.flush(mockMetrics);
  });
});

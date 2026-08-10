import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { SystemNoticeService } from './system-notice.service';

describe('SystemNoticeService', () => {
  let service: SystemNoticeService;
  let httpMock: HttpTestingController;
  let mockRouter: any;

  beforeEach(() => {
    mockRouter = {
      url: '/test-route'
    };

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        SystemNoticeService,
        { provide: Router, useValue: mockRouter }
      ],
    });
    service = TestBed.inject(SystemNoticeService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should send report to backend via report()', () => {
    service.report('warning', 'Test Warning', 'This is a warning message', { key: 'val' });

    const req = httpMock.expectOne(`${service['baseUrl']}/system-notices/report`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.severity).toBe('warning');
    expect(req.request.body.title).toBe('Test Warning');
    expect(req.request.body.message).toBe('This is a warning message');
    expect(req.request.body.context.key).toBe('val');
    expect(req.request.body.context.route).toBe('/test-route');
    expect(req.request.body.context.timestamp).toBeDefined();

    req.flush({ message: 'Success' });
  });

  it('should format and send errors via error()', () => {
    const errorInstance = new Error('Runtime failure');
    service.error('Test Error Title', errorInstance, { scope: 'test' });

    const req = httpMock.expectOne(`${service['baseUrl']}/system-notices/report`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.severity).toBe('error');
    expect(req.request.body.title).toBe('Test Error Title');
    expect(req.request.body.message).toBe('Runtime failure');
    expect(req.request.body.context.stack).toBeDefined();
    expect(req.request.body.context.scope).toBe('test');

    req.flush({ message: 'Success' });
  });

  it('should send warnings via warn()', () => {
    service.warn('Warn Title', 'Warn message', { key: 'warn-val' });

    const req = httpMock.expectOne(`${service['baseUrl']}/system-notices/report`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.severity).toBe('warning');
    expect(req.request.body.title).toBe('Warn Title');
    expect(req.request.body.message).toBe('Warn message');
    expect(req.request.body.context.key).toBe('warn-val');

    req.flush({ message: 'Success' });
  });

  it('should send info via info()', () => {
    service.info('Info Title', 'Info message', { key: 'info-val' });

    const req = httpMock.expectOne(`${service['baseUrl']}/system-notices/report`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.severity).toBe('info');
    expect(req.request.body.title).toBe('Info Title');
    expect(req.request.body.message).toBe('Info message');
    expect(req.request.body.context.key).toBe('info-val');

    req.flush({ message: 'Success' });
  });
});

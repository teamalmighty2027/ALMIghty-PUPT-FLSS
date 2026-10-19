import { TestBed } from '@angular/core/testing';
import { Injector } from '@angular/core';
import { GlobalErrorHandler } from './global-error.handler';
import { SystemNoticeService } from '../services/superadmin/system-notice/system-notice.service';

describe('GlobalErrorHandler', () => {
  let handler: GlobalErrorHandler;
  let noticeServiceSpy: jasmine.SpyObj<SystemNoticeService>;

  beforeEach(() => {
    const spy = jasmine.createSpyObj('SystemNoticeService', ['error']);

    TestBed.configureTestingModule({
      providers: [
        GlobalErrorHandler,
        { provide: SystemNoticeService, useValue: spy },
        {
          provide: Injector,
          useValue: {
            get: (token: any) => {
              if (token === SystemNoticeService) {
                return spy;
              }
              return null;
            },
          },
        },
      ],
    });

    handler = TestBed.inject(GlobalErrorHandler);
    noticeServiceSpy = TestBed.inject(SystemNoticeService) as jasmine.SpyObj<SystemNoticeService>;
  });

  it('should be created', () => {
    expect(handler).toBeTruthy();
  });

  it('should handle errors and call notice service', () => {
    const testError = new Error('Test unhandled exception');
    
    // Spy on console.error to avoid cluttering test logs
    spyOn(console, 'error');

    handler.handleError(testError);

    expect(console.error).toHaveBeenCalled();
    expect(noticeServiceSpy.error).toHaveBeenCalledWith(
      'Uncaught application error',
      testError,
      { caught_by: 'GlobalErrorHandler' }
    );
  });
});

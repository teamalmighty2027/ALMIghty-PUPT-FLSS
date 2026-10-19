import { Injectable, ErrorHandler, Injector } from '@angular/core';
import { SystemNoticeService } from '../services/superadmin/system-notice/system-notice.service';

// Intercepts all unhandled errors in the Angular application,
// logs them to the console, and forwards them to SystemNoticeService.
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private noticeService?: SystemNoticeService;

  constructor(private injector: Injector) {}

  /**
   * Main entry point to handle unhandled exceptions.
   */
  handleError(error: any): void {
    // Print to console so devtools still show the original error stack
    console.error('[GlobalErrorHandler]', error);

    try {
      // Lazily resolve service to avoid circular dependency issues
      if (!this.noticeService) {
        this.noticeService = this.injector.get(SystemNoticeService);
      }

      this.noticeService.error(
        'Uncaught application error',
        error,
        { caught_by: 'GlobalErrorHandler' }
      );
    } catch (e) {
      // Fail silently to prevent infinite loops in error handling
      console.error('Error logging global exception:', e);
    }
  }
}

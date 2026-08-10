import { inject } from '@angular/core';
import {
  HttpErrorResponse,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, switchMap } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { AuthService } from '../services/auth/auth.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SystemNoticeService } from '../services/superadmin/system-notice/system-notice.service';

const REFRESH_PATH = '/auth/refresh';

// Build a request with credentials and an optional Bearer token.
const buildAuthRequest = (
  req: HttpRequest<unknown>,
  token: string | null,
): HttpRequest<unknown> => {
  let authReq = req.clone({
    withCredentials: true,
  });

  if (token) {
    authReq = authReq.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
      },
    });
  }

  return authReq;
};

// Attach auth headers and handle token refresh for sessions.
export const AuthHeaderInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const snackBar = inject(MatSnackBar);
  const systemNoticeService = inject(SystemNoticeService);

  const token = authService.getToken();
  const isRefreshRequest = req.url.includes(REFRESH_PATH);
  const skipRefresh = req.headers.has('X-Skip-Auth-Refresh');
  const hasRetry = req.headers.has('X-Refresh-Retry');

  const shouldCheckExpiry = !isRefreshRequest && !skipRefresh;
  const authReq = buildAuthRequest(req, token);

  if (shouldCheckExpiry && authService.isTokenExpired()) {
    authService.expireSession();
    return throwError(() => new HttpErrorResponse({
      status: 401,
      statusText: 'Session expired',
    }));
  }

  if (
    shouldCheckExpiry
    && authService.isFlssSession()
    && authService.isTokenExpiringSoon()
  ) {
    return authService.refreshFlssTokenOnce().pipe(
      switchMap(() => {
        const updatedToken = authService.getToken();
        const retryReq = buildAuthRequest(
          req.clone({
            setHeaders: { 'X-Refresh-Retry': '1' },
          }),
          updatedToken,
        );
        return next(retryReq);
      }),
      catchError((error) => {
        authService.expireSession();
        return throwError(() => new HttpErrorResponse({
          status: 401,
          statusText: 'Session expired',
          error: error,
        }));
      }),
    );
  }

  return next(authReq).pipe(
    catchError((error) => {
      const isAuthError = error instanceof HttpErrorResponse
        && error.status === 401;

      if (
        isAuthError
        && shouldCheckExpiry
        && !hasRetry
        && authService.isFlssSession()
      ) {
        return authService.refreshFlssTokenOnce().pipe(
          switchMap(() => {
            const updatedToken = authService.getToken();
            const retryReq = buildAuthRequest(
              req.clone({
                setHeaders: { 'X-Refresh-Retry': '1' },
              }),
              updatedToken,
            );
            return next(retryReq);
          }),
          catchError((refreshError) => {
            authService.expireSession();
            return throwError(() => new HttpErrorResponse({
              status: 401,
              statusText: 'Session expired',
              error: refreshError,
            }));
          }),
        );
      }

      if (error instanceof HttpErrorResponse) {
        // --- 1. Global Snackbar & Session Expiry Alerts ---
        if (error.status === 401) {
          authService.expireSession();
        } 
        else if (error.status === 422) {
          console.warn('Validation Error:', error.error?.errors);
          snackBar.open('Please check your inputs. Some data was invalid.', 'Close', { 
            duration: 4000 
          });
        }
        else if (error.status === 409) {
          console.error('Conflict:', error.error?.message);
          snackBar.open(error.error?.message || 'A conflict occurred. Please try again.', 'Close', {
            duration: 4000
          });
        } 
        else if (error.status === 429) {
          console.error('Too Many Requests:', error.error?.message);
          snackBar.open('Too many requests. Please wait a moment before trying again.', 'Close', {
            duration: 4000
          });
        }
        else if (error.status >= 500) {
          console.error('Server Error:', error.error?.message);
          snackBar.open('A server error occurred. Our team has been notified.', 'Close', { 
            duration: 4000 
          });
        }

        // --- 2. System Notice Reporting for Crucial Errors ---
        const reportableStatuses = [400, 403, 409, 429];
        const isReportable = reportableStatuses.includes(error.status) || error.status >= 500;

        if (
          isReportable &&
          token &&
          !req.url.includes('/system-notices/report')
        ) {
          let title = `HTTP ${error.status} — Error`;
          let severity: 'info' | 'warning' | 'error' | 'critical' = 'error';

          if (error.status === 403) {
            title = 'HTTP 403 — Access Denied';
            severity = 'warning';
          } else if (error.status === 409) {
            title = 'HTTP 409 — State Conflict';
            severity = 'warning';
          } else if (error.status === 429) {
            title = 'HTTP 429 — Rate Limit Exceeded';
            severity = 'warning';
          } else if (error.status === 400) {
            title = 'HTTP 400 — Bad Request';
            severity = 'error';
          } else if (error.status >= 500) {
            title = `HTTP ${error.status} — Server Error`;
            severity = 'error';
          }

          try {
            systemNoticeService.report(
              severity,
              title,
              error.error?.message || error.message || 'HTTP Request Failure',
              {
                url: error.url,
                status: error.status,
                body: error.error,
              }
            );
          } catch (e) {
            console.error('Error reporting HTTP error to SystemNoticeService:', e);
          }
        }
      }

      return throwError(() => error);
    }),
  );
};
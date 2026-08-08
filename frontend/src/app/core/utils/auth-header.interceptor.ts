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
  
  // 1. INJECT THE SNACKBAR HERE
  const snackBar = inject(MatSnackBar);

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
        // Handle 401 Unauthorized
        if (error.status === 401) {
          authService.expireSession();
        } 
        // 2. USE SNACKBAR FOR VALIDATION ERRORS (422)
        else if (error.status === 422) {
          console.warn('Validation Error:', error.error.errors);
          snackBar.open('Please check your inputs. Some data was invalid.', 'Close', { 
            duration: 4000 
          });
        } 
        // 3. USE SNACKBAR FOR BAD REQUESTS (400)
        else if (error.status === 400) {
          console.error('Bad Request:', error.error.message);
          snackBar.open(error.error.message || 'Invalid request format. Please try again.', 'Close', { 
            duration: 4000 
          });
        } 
        // 4. USE SNACKBAR AND REPORT FOR SERVER ERRORS (5xx)
        else if (error.status >= 500) {
          console.error('Server Error:', error.error?.message);

          if (!req.url.includes('/system-notices/report')) {
            try {
              inject(SystemNoticeService).error(
                `HTTP ${error.status} — Server Error`,
                error,
                {
                  url: error.url,
                  status: error.status,
                  body: error.error,
                }
              );
            } catch (e) {
              console.error('Error reporting 5xx to SystemNoticeService:', e);
            }
          }

          snackBar.open('A server error occurred. Our team has been notified.', 'Close', { 
            duration: 4000 
          });
        }
      }

      return throwError(() => error);
    }),
  );
};
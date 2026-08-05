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

// Attach auth headers and handle token refresh for FLSS sessions.
export const AuthHeaderInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);

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
        // Handle 422 Validation Errors
        else if (error.status === 422) {
          console.warn('Validation Error:', error.error.errors);
          // Optional: If you have a toast/snackbar service, call it here
          alert('Please check your inputs. Some data was invalid.');
        } 
        // Handle 400 Bad Request
        else if (error.status === 400) {
          console.error('Bad Request:', error.error.message);
          alert(error.error.message || 'Invalid request format. Please try again.');
        } 
        // Handle 500 Internal Server Error
        else if (error.status === 500) {
          console.error('Server Error:', error.error.message);
          alert('A server error occurred. Our team has been notified.');
        }
      }

      return throwError(() => error);
    }),
  );
};
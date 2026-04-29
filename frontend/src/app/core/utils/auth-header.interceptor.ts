import { inject } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';
import { throwError } from 'rxjs';

import { AuthService } from '../services/auth/auth.service';

/**
 * Attach auth headers and block expired sessions.
 */
export const AuthHeaderInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);

  if (authService.isTokenExpired()) {
    authService.expireSession();
    return throwError(() => new Error('Session expired'));
  }

  /**
   * Get token from localStorage if available.
   */
  const token = authService.getToken();

  let authReq = req.clone({
    withCredentials: true,
  });

  /**
   * If token exists, add Authorization header.
   */
  if (token) {
    authReq = authReq.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
      },
    });
  }

  return next(authReq);
};

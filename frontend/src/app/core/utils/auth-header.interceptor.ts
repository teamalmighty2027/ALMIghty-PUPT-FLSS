import { HttpInterceptorFn } from '@angular/common/http';

export const AuthHeaderInterceptor: HttpInterceptorFn = (req, next) => {
  // Get token from localStorage if available
  const token = localStorage.getItem('token');
  
  let authReq = req.clone({ 
    withCredentials: true,
  });

  // If token exists, add Authorization header
  if (token) {
    authReq = authReq.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
      },
    });
  }

  return next(authReq);
};

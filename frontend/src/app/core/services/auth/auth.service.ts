import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';

import { Observable, of } from 'rxjs';
import { map, tap, switchMap, finalize, catchError } from 'rxjs/operators';

import { CookieService } from 'ngx-cookie-service';

import { environment } from '../../../../environments/environment.dev';
import { environmentOAuth } from '../../../../environments/env.auth';

export interface LoginError {
  message: string;
  status: number;
}

export interface LoginResponse {
  token: string;
  expires_at: string;
  user: any;
}

interface OAuthTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  faculty_data?: any;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private baseUrl = environment.apiUrl;
  private requestedRole: string[] = [];
  private userDataCache: any = null;

  constructor(
    private http: HttpClient,
    private cookieService: CookieService,
    private router: Router,
  ) {}

  // ==============================
  // IDP auth methods 
  // ==============================

  checkIdpHealth(): Observable<boolean> {
    return this.http.get(`${environmentOAuth.idpUrl}/auth/authorize`).pipe(
      map((response: any) => response.error === 'no client id given'),
      catchError((error) => { 
        console.error('Error checking IDP health:', error);
        return of(false);
      }),
    );
  }

  // Call the IDP's authorization endpoint to initiate login
  initiateIdpLogin(intendedRole: string[]): void {
    const clientId = environmentOAuth.clientId;
    this.cookieService.set('intended_role', JSON.stringify(intendedRole), undefined, '/');
    window.location.href = `${environmentOAuth.idpUrl}/api/v1/auth/authorize?client_id=${clientId}`;
  }

  // Pass the IDP callback parameters to the backend for processing
  handleIdpCallback(params: any): Observable<any> {
    const { code } = params;
    this.requestedRole = this.cookieService.get('intended_role') 
      ? JSON.parse(this.cookieService.get('intended_role')) : [];

    const payload = { 
      'code': code,
      'request_role': this.requestedRole,
    };

    return this.http.post<any>(`${this.baseUrl}/auth/callback`, payload).pipe(      
      switchMap((response) => {
        // Extract token and user data from backend response
        const token = response.token;
        const user = response.data;

        if (!token?.access_token) {
          throw new Error('No access token received');
        }

        if (!token?.expires_in) {
          throw new Error('No token expiry received');
        }

        if (!token.refresh_token) {
          throw new Error('No refresh token received');
        }

        if (!user?.role) {
          throw new Error('No user role received from backend');
        }

        // Calculate expiry date
        const expiresIn = token.expires_in || 3600;
        const expiryDate = new Date();
        expiryDate.setSeconds(expiryDate.getSeconds() + expiresIn);

        // Store user data and Sanctum token for Authorization header
        this.setUserData(response.data);
        localStorage.setItem('token', response.token?.token || '');
        this.setIdpToken(token.access_token, token.refresh_token, expiresIn);

        return of(response);
      }),
      catchError((error) => {
        console.error('Error in handleIdpCallback:', error);
        throw error;
      }),
    );
  }

  /**
   * Calls the IDP's logout endpoint to invalidate the session
   * then clears cookies as well
   * Skipped in dev mode to avoid IDP logout during testing
   */
  logoutFromIdp(): void {
    // Skip IDP logout in dev mode
    if (!environment.production) {
      console.log('[DEV MODE] IDP logout skipped - clearCookies still called');
      this.clearCookies();
      return;
    }
    
    // Proxy through backend to avoid browser CORS issues
    this.http.request('POST', `${this.baseUrl}/auth/session`, {})
    .subscribe({
      next: () => {
        this.clearCookies();
      },
      error: (error) => {
        console.error('Error logging out from IDP:', error);
        this.clearCookies();
      }
    });
  }

  // ==============================
  // Internal FLSS auth methods
  // ==============================
  flssLogin(
    email: string,
    password: string,
    allowedRoles: string[],
  ): Observable<any> {
    const loginData = {
      email: email,
      password: password,
      allowed_roles: allowedRoles,
    };

    // 1. Get the root URL (remove '/api' from the end of baseUrl if it exists)
    // Sanctum's cookie route is usually at the base domain, not inside /api
    const rootUrl = this.baseUrl.replace(/\/api$/, '');

    console.log('BASE URL:', this.baseUrl);
    console.log('ROOT URL:', rootUrl);

    // 2. Do the Sanctum Handshake FIRST, then send the login data
    return this.http.get(`${rootUrl}/sanctum/csrf-cookie`, { withCredentials: true }).pipe(
      switchMap(() => {
        console.log('Handshake successful, now logging in...');
        // 3. Send the actual login request, explicitly attaching the cookies
        return this.http.post(`${this.baseUrl}/login`, loginData, {
          withCredentials: true // 🚨 THIS IS THE MAGIC KEY 🚨
        });
      })
    );
  }

  logout(): Observable<any> {
    return this.http.post(`${this.baseUrl}/logout`, {}).pipe(
      finalize(() => {
        this.logoutFromIdp();
        this.clearCookies();
        this.router.navigate(['/login']);
      }),
    );
  }

  // ==============================
  // Password Reset methods
  // ==============================
  sendPasswordResetEmail(email: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/password/email`, { email });
  }

  verifyResetToken(token: string, email: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/password/verify-token`, {
      token,
      email,
    });
  }

  resetPassword(
    token: string,
    email: string,
    password: string,
    password_confirmation: string,
  ): Observable<any> {
    return this.http.post(`${this.baseUrl}/password/reset`, {
      token,
      email,
      password,
      password_confirmation,
    });
  }

  // ==============================
  // Password management methods
  // ==============================
  changePassword(
    currentPassword: string,
    newPassword: string,
    newPasswordConfirmation: string,
  ): Observable<any> {
    return this.http.post(`${this.baseUrl}/change-password`, {
      current_password: currentPassword,
      password: newPassword,
      password_confirmation: newPasswordConfirmation,
    });
  }

  // ==============================
  // Helper methods
  // ==============================
  private generateRandomState(): string {
    const array = new Uint32Array(8);
    crypto.getRandomValues(array);
    return Array.from(array, (dec) => dec.toString(16).padStart(8, '0')).join(
      '',
    );
  }

  // ==============================
  // Cookies handling methods
  // ==============================
  getToken(): string {
    return localStorage.getItem('token') || '';
  }

  private setIdpToken(access_token: string, refresh_token: string, expiresIn: number) {
    const expiryDate = new Date();
    expiryDate.setSeconds(expiryDate.getSeconds() + expiresIn);
  
    this.cookieService.set('access_token', access_token, expiryDate, '/');
    this.cookieService.set('refresh_token', refresh_token, expiryDate, '/');
  }

  setSanctumToken(sanctumToken: string, expiresAt: string): void {
    const expiryDate = new Date(expiresAt);
    // Store Sanctum token as the main token
    this.cookieService.set('token', sanctumToken, {
      expires: expiryDate,
      path: '/',
      sameSite: 'Lax',
      secure: false,
    });
  }

  clearCookies(): void {
    const cookiesToClear = [
      'token',
      'role',
      'user_id',
      'user_name',
      'user_email',
      'user_role',
      'faculty_id',
      'faculty_type',
      'faculty_units',
      'termsAccepted',
      'access_token',
      'refresh_token',
      'permissions',
      'allowed_programs',
    ];

    cookiesToClear.forEach((cookieName) => {
      this.cookieService.delete(cookieName, '/');
    });

    // Clear localStorage
    localStorage.removeItem('oauth_state');
    localStorage.removeItem('user_data');
    localStorage.removeItem('token');
    this.userDataCache = null;
  }

  /**
   * Handles login with error handling and role validation
   */
  handleLogin(
    email: string,
    password: string,
    allowedRoles: string[],
  ): Observable<LoginResponse> {
    return this.flssLogin(email, password, allowedRoles).pipe(
      tap((response) => {
        if (response.user) {
          this.setUserData(response.user);
          localStorage.setItem('token', response.token);
        }
      }),
      catchError((error) => {
        const errorMessage = this.handleLoginError(error);
        throw { message: errorMessage, status: error.status };
      }),
    );
  }

  /**
   * Unified error handling for login attempts
   */
  private handleLoginError(error: any): string {
    let errorMessage = '';
    if (error.error?.message) {
      errorMessage = error.error.message;
    } else if (typeof error.error === 'string') {
      try {
        const parsedError = JSON.parse(error.error);
        errorMessage = parsedError.message;
      } catch {
        errorMessage = error.error;
      }
    }

    if (!errorMessage || errorMessage.trim() === '') {
      return this.getDefaultErrorMessage(error.status);
    }

    return errorMessage;
  }

  private getDefaultErrorMessage(status: number): string {
    switch (status) {
      case 401:
        return 'Invalid credentials.';
      case 403:
        return 'Access forbidden.';
      case 429:
        return 'Too many login attempts. Please try again later.';
      case 500:
        return 'Server error occurred. Please try again later.';
      case 0:
        return 'Unable to connect to the server. Please check your internet connection.';
      default:
        return 'An unexpected error occurred. Please try again later.';
    }
  }

  setUserData(user: any): void {
    // Only store non-sensitive user info in cache
    this.userDataCache = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      code: user.code || user.user_code || '',
      faculty: user.faculty || null,
      roles: user.roles || [user.role],
      permissions: user.permissions || [],
      allowed_programs: user.allowed_programs || [],
      is_full_access: user.is_full_access !== false,
    };
    // Save to localStorage (not cookies) if needed for page reloads
    localStorage.setItem('user_data', JSON.stringify(this.userDataCache));
  }

  getUserData(): any {
    return this.userDataCache || JSON.parse(localStorage.getItem('user_data') || '{}');
  }

  getUserId(): string {
    return this.getUserData().id;
  }

  getUserRole(): string {
    return this.getUserData().role;
  }

  getUserRoles(): string[] {
    const roles = this.getUserData().roles || [this.getUserData().role];
    return roles.filter((r: string) => !!r);
  }

  getUserName(): string {
    return this.getUserData().name;
  }

  getUserEmail(): string {
    return this.getUserData().email;
  }

  getUserCode(): string {
    return this.getUserData().code || '';
  }

  getUserFacultyId(): string {
    const faculty = this.getUserData().faculty;
    return faculty?.faculty_id ?? '';
  }

  getPermissions(): string[] {
    return this.getUserData().permissions || [];
  }

  hasPermission(key: string): boolean {
    const permissions = this.getPermissions();
    return permissions.includes(key);
  }

  getAllowedPrograms(): number[] {
    return this.getUserData().allowed_programs || [];
  }

  isFullProgramAccess(): boolean {
    return this.getUserData().is_full_access !== false;
  }

  isAuthenticated(): boolean {
    return !!this.getUserData().id;
  }
}

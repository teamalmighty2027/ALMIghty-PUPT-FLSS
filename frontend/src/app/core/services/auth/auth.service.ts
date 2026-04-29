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
  private sessionTimeoutId: ReturnType<typeof setTimeout> | null = null;

  // Wire up auth dependencies.
  constructor(
    private http: HttpClient,
    private cookieService: CookieService,
    private router: Router,
  ) {}

  // ==============================
  // IDP auth methods
  // ==============================

  /**
   * Check if the IDP authorize endpoint is reachable.
   */
  checkIdpHealth(): Observable<boolean> {
    return this.http
      .get(`${environmentOAuth.idpUrl}/auth/authorize`)
      .pipe(
        map((response: any) => response.error === 'no client id given'),
        catchError((error) => {
          console.error('Error checking IDP health:', error);
          return of(false);
        }),
      );
  }

  /**
   * Call the IDP's authorization endpoint to initiate login.
   */
  initiateIdpLogin(intendedRole: string[]): void {
    const clientId = environmentOAuth.clientId;
    this.cookieService.set(
      'intended_role',
      JSON.stringify(intendedRole),
      undefined,
      '/',
    );
    window.location.href =
      `${environmentOAuth.idpUrl}/api/v1/auth/authorize` +
      `?client_id=${clientId}`;
  }

  /**
   * Pass the IDP callback parameters to the backend for processing.
   */
  handleIdpCallback(params: any): Observable<any> {
    const { code } = params;
    this.requestedRole = this.cookieService.get('intended_role')
      ? JSON.parse(this.cookieService.get('intended_role'))
      : [];

    const payload = {
      'code': code,
      'request_role': this.requestedRole,
    };

    return this.http
      .post<any>(`${this.baseUrl}/auth/callback`, payload)
      .pipe(
        switchMap((response) => {
          // Extract token and user data from backend response.
          const token = response.token;
          const user = response.data;
          const expiresAt = response.expires_at || null;

          if (!token?.access_token) {
            throw new Error('No access token received');
          }

          if (!token?.expires_in) {
            throw new Error('No token expiry received');
          }

          if (!user?.role) {
            throw new Error('No user role received from backend');
          }

          // Calculate expiry date for fallback when backend omits it.
          const expiresIn = token.expires_in || 3600;
          const fallbackExpiresAt =
            this.getExpiresAtIsoFromSeconds(expiresIn);
          const normalizedExpiresAt = expiresAt || fallbackExpiresAt;

          // Store user data and Sanctum token for Authorization header.
          this.setUserData(response.data, normalizedExpiresAt);
          localStorage.setItem('token', response.token?.token || '');
          this.setIdpToken(
            token.access_token,
            token.refresh_token || null,
            expiresIn,
          );

          return of(response);
        }),
        catchError((error) => {
          console.error('Error in handleIdpCallback:', error);
          throw error;
        }),
      );
  }

  /**
   * Proxy logout to IDP to invalidate the IDP session.
   */
  logoutFromIdp(): Observable<any> {
    const cookieToken = this.cookieService.get('access_token');

    if (!cookieToken) {
      return of(null);
    }

    // Send access token in request body to avoid Sanctum middleware checks.
    return this.http
      .post(`${this.baseUrl}/auth/session`, {
        idp_token: cookieToken,
      })
      .pipe(
        catchError((error) => {
          console.error('Error logging out from IDP:', error);
          return of(null);
        }),
      );
  }

  // ==============================
  // Internal FLSS auth methods
  // ==============================
  /**
   * Call the FLSS login endpoint.
   */
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
    return this.http.post(`${this.baseUrl}/login`, loginData);
  }

  /**
   * Logout from backend and clear local session state.
   */
  logout(): Observable<any> {
    return this.http.post(`${this.baseUrl}/logout`, {}).pipe(
      catchError(() => of(null)),
      switchMap(() => this.logoutFromIdp()),
      finalize(() => {
        this.clearCookies();
        this.router.navigate(['/login']);
      }),
    );
  }

  // ==============================
  // Password Reset methods
  // ==============================
  /**
   * Request a password reset email.
   */
  sendPasswordResetEmail(email: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/password/email`, { email });
  }

  /**
   * Verify a password reset token.
   */
  verifyResetToken(token: string, email: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/password/verify-token`, {
      token,
      email,
    });
  }

  /**
   * Reset a password using a verified token.
   */
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
  /**
   * Change the current user's password.
   */
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
  // Generate a random string for OAuth-like flows.
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
  // Read the stored Sanctum token.
  getToken(): string {
    return localStorage.getItem('token') || '';
  }

  // Store IDP tokens in secure cookies.
  private setIdpToken(
    access_token: string,
    refresh_token: string | null,
    expiresIn: number,
  ) {
    const expiryDate = new Date();
    expiryDate.setSeconds(expiryDate.getSeconds() + expiresIn);

    // Explicitly set flags for production HTTPS compatibility.
    const cookieOptions = {
      expires: expiryDate,
      path: '/',
      secure: true,
      sameSite: 'Lax' as const,
    };

    this.cookieService.set('access_token', access_token, cookieOptions);

    if (refresh_token) {
      this.cookieService.set('refresh_token', refresh_token, cookieOptions);
    }
  }

  // Store Sanctum token in a cookie for HTTP-only paths.
  setSanctumToken(sanctumToken: string, expiresAt: string): void {
    const expiryDate = new Date(expiresAt);
    // Store Sanctum token as the main token.
    this.cookieService.set('token', sanctumToken, {
      expires: expiryDate,
      path: '/',
      sameSite: 'Lax',
      secure: false,
    });
  }

  // Clear auth cookies, storage, and session timers.
  clearCookies(): void {
    this.clearSessionTimeout();
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
      'scheduling_selected_program',
    ];

    cookiesToClear.forEach((cookieName) => {
      this.cookieService.delete(cookieName, '/');
    });

    // Clear localStorage.
    localStorage.removeItem('oauth_state');
    localStorage.removeItem('user_data');
    localStorage.removeItem('token');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    this.userDataCache = null;
  }

  // Handle login and persist user data on success.
  handleLogin(
    email: string,
    password: string,
    allowedRoles: string[],
  ): Observable<LoginResponse> {
    return this.flssLogin(email, password, allowedRoles).pipe(
      tap((response) => {
        if (response.user) {
          this.setUserData(response.user, response.expires_at);
          localStorage.setItem('token', response.token);
        }
      }),
      catchError((error) => {
        const errorMessage = this.handleLoginError(error);
        throw { message: errorMessage, status: error.status };
      }),
    );
  }

  // Normalize errors for login responses.
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

  // Provide fallback messages for common status codes.
  private getDefaultErrorMessage(status: number): string {
    switch (status) {
      case 401:
        return 'Invalid credentials.';
      case 403:
        return 'Access forbidden.';
      case 429:
        return (
          'Too many login attempts. ' +
          'Please try again later.'
        );
      case 500:
        return 'Server error occurred. Please try again later.';
      case 0:
        return (
          'Unable to connect to the server. ' +
          'Please check your internet connection.'
        );
      default:
        return 'An unexpected error occurred. Please try again later.';
    }
  }

  // Store safe user data and track session expiration.
  setUserData(user: any, expiresAt?: string | null): void {
    const resolvedExpiresAt = expiresAt || user.expires_at || null;

    // Only store non-sensitive user info in cache.
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
      expires_at: resolvedExpiresAt,
    };
    // Save to localStorage (not cookies) for page reloads.
    localStorage.setItem('user_data', JSON.stringify(this.userDataCache));
    this.scheduleSessionExpiry(resolvedExpiresAt);
  }

  // Get cached user data, clearing it if expired.
  getUserData(): any {
    if (!this.userDataCache) {
      const rawData = localStorage.getItem('user_data') || '{}';
      this.userDataCache = JSON.parse(rawData);
    }

    if (this.isTokenExpired()) {
      this.expireSession();
      return {};
    }

    return this.userDataCache;
  }

  // Read the current user id.
  getUserId(): string {
    return this.getUserData().id;
  }

  // Read the current user role.
  getUserRole(): string {
    return this.getUserData().role;
  }

  // Read the current user roles list.
  getUserRoles(): string[] {
    const roles = this.getUserData().roles || [this.getUserData().role];
    return roles.filter((r: string) => !!r);
  }

  // Read the current user display name.
  getUserName(): string {
    return this.getUserData().name;
  }

  // Read the current user email.
  getUserEmail(): string {
    return this.getUserData().email;
  }

  // Read the user code for display or filtering.
  getUserCode(): string {
    return this.getUserData().code || '';
  }

  // Read the current user's faculty id, if any.
  getUserFacultyId(): string {
    const faculty = this.getUserData().faculty;
    return faculty?.faculty_id ?? '';
  }

  // Read the current user's permissions.
  getPermissions(): string[] {
    return this.getUserData().permissions || [];
  }

  // Check if the user has a specific permission key.
  hasPermission(key: string): boolean {
    const permissions = this.getPermissions();
    return permissions.includes(key);
  }

  // Read the list of program ids the user can access.
  getAllowedPrograms(): number[] {
    return this.getUserData().allowed_programs || [];
  }

  // Check if the user has full program access.
  isFullProgramAccess(): boolean {
    return this.getUserData().is_full_access !== false;
  }

  // Return true when a non-expired session exists.
  isAuthenticated(): boolean {
    return !!this.getUserData().id && !this.isTokenExpired();
  }

  // Return true when the stored expiration has passed.
  isTokenExpired(): boolean {
    const expiresAtMs = this.getExpiresAtMs();

    if (!expiresAtMs) {
      return false;
    }

    return Date.now() >= expiresAtMs;
  }

  // Expire the local session without backend refresh.
  expireSession(): void {
    this.clearCookies();
    this.router.navigate(['/login']);
  }

  // Parse the stored expiration into a timestamp.
  private getExpiresAtMs(): number | null {
    const data = this.userDataCache
      ? this.userDataCache
      : JSON.parse(localStorage.getItem('user_data') || '{}');
    const expiresAt = data?.expires_at;

    if (!expiresAt) {
      return null;
    }

    const parsed = Date.parse(expiresAt);

    return Number.isNaN(parsed) ? null : parsed;
  }

  // Schedule a timer to clear the session at expiration time.
  private scheduleSessionExpiry(expiresAt?: string | null): void {
    this.clearSessionTimeout();

    if (!expiresAt) {
      return;
    }

    const expiresAtMs = Date.parse(expiresAt);

    if (Number.isNaN(expiresAtMs)) {
      return;
    }

    const timeoutMs = expiresAtMs - Date.now();

    if (timeoutMs <= 0) {
      this.expireSession();
      return;
    }

    this.sessionTimeoutId = setTimeout(() => {
      this.expireSession();
    }, timeoutMs);
  }

  // Cancel any pending session expiry timer.
  private clearSessionTimeout(): void {
    if (!this.sessionTimeoutId) {
      return;
    }

    clearTimeout(this.sessionTimeoutId);
    this.sessionTimeoutId = null;
  }

  // Build an ISO string from the current time plus seconds.
  private getExpiresAtIsoFromSeconds(expiresIn: number): string {
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + expiresIn);

    return expiresAt.toISOString();
  }
}

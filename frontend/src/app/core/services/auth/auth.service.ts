import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { map, tap, switchMap, finalize, catchError, shareReplay } from 'rxjs/operators';

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

type AuthProvider = 'flss' | 'idp';

interface OAuthTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  faculty_data?: any;
}

interface RefreshResponse {
  token: string;
  expires_at: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private baseUrl = environment.apiUrl;
  private requestedRole: string[] = [];
  private userDataCache: any = null;
  private sessionExpiryTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshLeewayMs = 30 * 60 * 1000;
  private refreshInFlight: Observable<RefreshResponse> | null = null;
  private profilePictureUrlSubject = new BehaviorSubject<string | null>(null);
  public profilePictureUrl$ = this.profilePictureUrlSubject.asObservable();

  // Initialize AuthService dependencies.
  constructor(
    private http: HttpClient,
    private cookieService: CookieService,
    private router: Router,
  ) {}

  // ==============================
  // IDP auth methods 
  // ==============================

  // Check the IDP health endpoint.
  checkIdpHealth(): Observable<boolean> {
    return this.http.get(`${environmentOAuth.idpUrl}/auth/authorize`).pipe(
      map((response: any) => response.error === 'no client id given'),
      catchError((error) => {
        console.error('Error checking IDP health:', error);
        return of(false);
      }),
    );
  }

  // Call the IDP's authorization endpoint to initiate login.
  initiateIdpLogin(intendedRole: string[]): void {
    const clientId = environmentOAuth.clientId;
    this.cookieService.set(
      'intended_role',
      JSON.stringify(intendedRole),
      undefined,
      '/',
    );
    window.location.href =
      `${environmentOAuth.idpUrl}` +
      `/api/v1/auth/authorize?client_id=${clientId}`;
  }

  // Pass the IDP callback parameters to the backend for processing.
  handleIdpCallback(params: any): Observable<any> {
    const { code } = params;
    this.requestedRole = this.cookieService.get('intended_role')
      ? JSON.parse(this.cookieService.get('intended_role'))
      : [];

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

        // Calculate expiry date.
        const expiresIn = token.expires_in || 3600;
        const expiryDate = new Date();
        expiryDate.setSeconds(expiryDate.getSeconds() + expiresIn);
        const expiresAt = expiryDate.toISOString();

        // Store user data and Sanctum token for Authorization header.
        this.setUserData(response.data, expiresAt, 'idp');
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
   * Returns an observable that completes after proxying or skipping
   */
  logoutFromIdp(): Observable<any> {
    const cookieToken = this.cookieService.get('access_token');

    if (!cookieToken) {
      return of(null);
    }

    // Send access token in request body to avoid Sanctum middleware.
    return this.http.post(`${this.baseUrl}/auth/session`, {
      idp_token: cookieToken,
    }).pipe(
      catchError((error) => {
        console.error('Error logging out from IDP:', error);
        return of(null);
      }),
    );
  }

  /**
   * Proxy-check existing IDP session via the backend redirect endpoint.
   */
  checkOnePortalSession(idpToken: string): Observable<any> {
    return this.http.get<any>(
      `${this.baseUrl}/auth/redirect`,
      { params: { idp_token: idpToken } }
    );
  }

  // ==============================
  // Internal FLSS auth methods
  // ==============================
  // Submit FLSS login credentials.
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

  // Log out and clear local auth data.
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
  // Send a password reset email.
  sendPasswordResetEmail(email: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/password/email`, { email });
  }

  // Verify the password reset token.
  verifyResetToken(token: string, email: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/password/verify-token`, {
      token,
      email,
    });
  }

  // Submit the new password to the backend.
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
  // Update the current user's password.
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
  // Generate a random state string for OAuth flow.
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
  // Read the local Sanctum token.
  getToken(): string {
    return localStorage.getItem('token') || '';
  }

  // Store the IDP access and refresh tokens in cookies.
  private setIdpToken(
    access_token: string,
    refresh_token: string,
    expiresIn: number,
  ) {
    const expiryDate = new Date();
    expiryDate.setSeconds(expiryDate.getSeconds() + expiresIn);

    // Explicitly set flags for production HTTPS compatibility
    const cookieOptions = {
      expires: expiryDate,
      path: '/',
      secure: true,
      sameSite: 'Lax' as const,
    };

    this.cookieService.set('access_token', access_token, cookieOptions);
    this.cookieService.set('refresh_token', refresh_token, cookieOptions);
  }

  // Store the Sanctum token cookie for legacy compatibility.
  setSanctumToken(sanctumToken: string, expiresAt: string): void {
    const expiryDate = new Date(expiresAt);
    this.cookieService.set('token', sanctumToken, {
      expires: expiryDate,
      path: '/',
      sameSite: 'Lax',
      secure: false,
    });
  }

  // Clear all auth-related cookies and cached data.
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
      'scheduling_selected_program',
    ];

    cookiesToClear.forEach((cookieName) => {
      this.cookieService.delete(cookieName, '/');
    });

    // Clear localStorage
    localStorage.removeItem('oauth_state');
    localStorage.removeItem('user_data');
    localStorage.removeItem('token');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('termsAccepted');
    localStorage.removeItem('scheduling_selected_program');
    localStorage.removeItem('scheduling_selected_year');
    localStorage.removeItem('scheduling_selected_section');
    localStorage.removeItem('curriculum_selected_category');
    localStorage.removeItem('curriculum_selected_program');
    localStorage.removeItem('curriculum_selected_year');
    localStorage.removeItem('curriculum_selected_semester');
    this.userDataCache = null;
    this.clearExpiryTimer();
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
          this.setUserData(response.user, response.expires_at, 'flss');
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

  // Map status codes to default login error messages.
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
        return 'Unable to connect to the server. Please check your internet'
          + ' connection.';
      default:
        return 'An unexpected error occurred. Please try again later.';
    }
  }

  // Cache user data and optional session metadata.
  setUserData(
    user: any,
    expiresAt?: string,
    authProvider?: AuthProvider,
  ): void {
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
      expires_at: expiresAt || user.expires_at || null,
      auth_provider: authProvider || user.auth_provider || null,
      profile_picture_url: user.profile_picture_url || user.profile?.profile_picture_url || null,
    };

    // Update the profile picture observable
    this.profilePictureUrlSubject.next(this.userDataCache.profile_picture_url);
    // Save to localStorage (not cookies) if needed for page reloads
    localStorage.setItem('user_data', JSON.stringify(this.userDataCache));
    this.scheduleSessionExpiry(this.userDataCache.expires_at);
  }

  // Load user data from cache or localStorage.
  getUserData(): any {
    if (!this.userDataCache) {
      this.userDataCache = this.loadUserDataFromStorage();
      this.scheduleSessionExpiry(this.userDataCache?.expires_at);
      
      // Initialize the profile picture observable from storage
      if (this.userDataCache?.profile_picture_url) {
        this.profilePictureUrlSubject.next(this.userDataCache.profile_picture_url);
      }
    }

    return this.userDataCache;
  }

  /**
   * Manually update the profile picture URL and notify subscribers
   */
  updateProfilePictureUrl(url: string | null): void {
    const userData = this.getUserData();
    if (userData) {
      userData.profile_picture_url = url;
      localStorage.setItem('user_data', JSON.stringify(userData));
    }
    this.profilePictureUrlSubject.next(url);
  }

  // Return the session expiration timestamp in ms.
  getExpiresAtMs(): number | null {
    const expiresAt = this.getUserData()?.expires_at;
    if (!expiresAt) {
      return null;
    }

    const expiresAtMs = Date.parse(expiresAt);
    return Number.isNaN(expiresAtMs) ? null : expiresAtMs;
  }

  // Return true when the current session is FLSS-based.
  isFlssSession(): boolean {
    return this.getUserData()?.auth_provider === 'flss';
  }

  // Check if the session has expired.
  isTokenExpired(): boolean {
    const expiresAtMs = this.getExpiresAtMs();
    if (!expiresAtMs) {
      return false;
    }

    return Date.now() >= expiresAtMs;
  }

  // Check if the session is close to expiring.
  isTokenExpiringSoon(): boolean {
    const expiresAtMs = this.getExpiresAtMs();
    if (!expiresAtMs) {
      return false;
    }

    const remainingMs = expiresAtMs - Date.now();
    return remainingMs > 0 && remainingMs <= this.refreshLeewayMs;
  }

  // Update only the stored expiration timestamp.
  updateSessionExpiration(expiresAt: string): void {
    const userData = this.getUserData();
    if (!userData?.id) {
      return;
    }

    this.userDataCache = {
      ...userData,
      expires_at: expiresAt,
    };
    localStorage.setItem('user_data', JSON.stringify(this.userDataCache));
    this.scheduleSessionExpiry(expiresAt);
  }

  // Request a refreshed Sanctum token for FLSS sessions.
  refreshFlssToken(): Observable<RefreshResponse> {
    return this.http
      .post<RefreshResponse>(
        `${this.baseUrl}/auth/refresh`,
        {},
        {
          headers: {
            'X-Skip-Auth-Refresh': '1',
          },
        },
      )
      .pipe(
        tap((response) => {
          if (!response?.token || !response?.expires_at) {
            return;
          }

          localStorage.setItem('token', response.token);
          this.updateSessionExpiration(response.expires_at);
        }),
      );
  }

  // Share a single refresh request across callers.
  refreshFlssTokenOnce(): Observable<RefreshResponse> {
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.refreshFlssToken().pipe(
        finalize(() => {
          this.refreshInFlight = null;
        }),
        shareReplay(1),
      );
    }

    return this.refreshInFlight;
  }

  // Clear auth state and redirect to the login screen.
  expireSession(): void {
    this.clearCookies();
    this.router.navigate(['/login'], {
      queryParams: { reason: 'session-expired' },
      replaceUrl: true,
    });
  }

  // Load user data from storage with parse guards.
  private loadUserDataFromStorage(): any {
    const rawUserData = localStorage.getItem('user_data');
    if (!rawUserData) {
      return {};
    }

    try {
      const parsed = JSON.parse(rawUserData);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      console.error('Failed to parse user_data:', error);
      localStorage.removeItem('user_data');
      return {};
    }
  }

  // Cancel any pending expiry timer.
  private clearExpiryTimer(): void {
    if (this.sessionExpiryTimer) {
      clearTimeout(this.sessionExpiryTimer);
      this.sessionExpiryTimer = null;
    }
  }

  // Schedule automatic session expiry.
  private scheduleSessionExpiry(expiresAt?: string): void {
    this.clearExpiryTimer();

    if (!expiresAt) {
      return;
    }

    const expiresAtMs = Date.parse(expiresAt);
    if (Number.isNaN(expiresAtMs)) {
      return;
    }

    const delayMs = expiresAtMs - Date.now();
    if (delayMs <= 0) {
      this.expireSession();
      return;
    }

    this.sessionExpiryTimer = setTimeout(() => {
      this.expireSession();
    }, delayMs);
  }

  // Return the current user id.
  getUserId(): string {
    return this.getUserData().id;
  }

  // Return the current user's primary role.
  getUserRole(): string {
    return this.getUserData().role;
  }

  // Return all roles for the current user.
  getUserRoles(): string[] {
    const roles = this.getUserData().roles || [this.getUserData().role];
    return roles.filter((r: string) => !!r);
  }

  // Return the current user's name.
  getUserName(): string {
    return this.getUserData().name;
  }

  // Return the current user's email.
  getUserEmail(): string {
    return this.getUserData().email;
  }

  // Return the current user's code.
  getUserCode(): string {
    return this.getUserData().code || '';
  }

  // Return the current user's faculty id.
  getUserFacultyId(): string {
    const faculty = this.getUserData().faculty;
    return faculty?.faculty_id ?? '';
  }

  // Return the current user's permissions.
  getPermissions(): string[] {
    return this.getUserData().permissions || [];
  }

  // Check whether the user has a permission key.
  hasPermission(key: string): boolean {
    const permissions = this.getPermissions();
    return permissions.includes(key);
  }

  // Return the allowed program ids for the user.
  getAllowedPrograms(): number[] {
    return this.getUserData().allowed_programs || [];
  }

  // Return whether the user has full program access.
  isFullProgramAccess(): boolean {
    return this.getUserData().is_full_access !== false;
  }

  // Return true if the user is authenticated.
  isAuthenticated(): boolean {
    return !!this.getUserData().id;
  }
}
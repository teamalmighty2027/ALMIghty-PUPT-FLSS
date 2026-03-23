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
    window.location.href = `${environmentOAuth.idpUrl}/login?client_id=${clientId}`;
    this.requestedRole = intendedRole;
  }

  // Pass the IDP callback parameters to the backend for processing
  handleIdpCallback(params: any): Observable<any> {
    const { code } = params;
    const payload = { 
      'code': code,
      'request_role': this.requestedRole
    };

    return this.http.post<any>(`${this.baseUrl}/auth/callback`, payload).pipe(
      tap((response) => {
        this.setUserData(response.data);
      }),
      switchMap((response) => {
        // Extract token and user data from backend response
        const token = response.token;
        const user = response.data;

        if (!token?.access_token) {
          throw new Error('No access token received');
        }

        if (!user?.role) {
          throw new Error('No user role received from backend');
        }

        // Calculate expiry date
        const expiresIn = token.expires_in || 3600;
        const expiryDate = new Date();
        expiryDate.setSeconds(expiryDate.getSeconds() + expiresIn);

        // Set individual user info cookies
        this.setUserInfo(user, expiryDate.toISOString());
        this.setSanctumToken(response.token.token, expiryDate.toISOString());
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
   * Calls the session route and confirms whether the token is still valid
   * (Placeholder)
   */
  checkIdpSession() {
      this.http.get(`${environmentOAuth.idpUrl}/auth/session`).subscribe({
        next: (response) => {
          console.log('IDP session valid:', response);
        },
        error: (error) => {
          console.error('IDP session invalid:', error);
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
    return this.http.post(`${this.baseUrl}/login`, loginData);
  }

  logout(): Observable<any> {
    return this.http.post(`${this.baseUrl}/logout`, {}).pipe(
      finalize(() => {
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
    return this.cookieService.get('token');
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

  setUserInfo(user: any, expiresAt: string): void {
    const expiryDate = new Date(expiresAt);
    this.cookieService.set(
      'user_id',
      user.id,
      expiryDate,
      '/',
      '',
      true,
      'Strict',
    );
    this.cookieService.set(
      'user_name',
      user.name,
      expiryDate,
      '/',
      '',
      true,
      'Strict',
    );

    if (user.faculty) {
      this.cookieService.set(
        'faculty_id',
        user.faculty.faculty_id,
        expiryDate,
        '/',
        '',
        true,
        'Strict',
      );
      this.cookieService.set(
        'faculty_type',
        user.faculty.faculty_type,
        expiryDate,
        '/',
        '',
        true,
        'Strict',
      );
      this.cookieService.set(
        'faculty_units',
        user.faculty.faculty_units,
        expiryDate,
        '/',
        '',
        true,
        'Strict',
      );
    }
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
          this.setUserInfo(response.user, response.expires_at);
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

  // Create a secure user data object that can be retrieved
  private userDataCache: any = null;

  setUserData(user: any): void {
    // Only store non-sensitive user info in cache
    this.userDataCache = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      code: user.code || user.user_code || '', // Support both field names
      faculty: user.faculty,
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

  isAuthenticated(): boolean {
    return !!this.getUserData().id;
  }
}

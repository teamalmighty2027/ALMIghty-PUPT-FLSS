import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CookieService } from 'ngx-cookie-service';
import { MatButtonModule } from '@angular/material/button';
import { CustomSpinnerComponent } from
  '../../shared/custom-spinner/custom-spinner.component';
import { AuthService } from '../../core/services/auth/auth.service';

type RedirectState = 'checking' | 'role-selection' | 'error';

@Component({
  selector: 'app-redirect',
  templateUrl: './redirect.component.html',
  styleUrls: ['./redirect.component.scss'],
  imports: [CommonModule, CustomSpinnerComponent, MatButtonModule],
})
export class RedirectComponent implements OnInit, OnDestroy {
  private unsubscribe$ = new Subject<void>();

  // Current UI state of the redirect page
  state: RedirectState = 'checking';
  availableRoles: string[] = [];
  errorMessage = 'Something went wrong. Please try again.';

  constructor(
    private authService: AuthService,
    private cookieService: CookieService,
    private router: Router,
  ) {}

  // Lifecycle hook on initialization
  ngOnInit(): void {
    this.checkSession();
  }

  // Lifecycle hook on destruction
  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  // Read stored IDP token and call the backend proxy
  private checkSession(): void {
    const idpToken = this.cookieService.get('access_token');

    if (!idpToken) {
      // No stored session — start fresh IDP login for all roles
      this.authService.initiateIdpLogin(
        ['faculty', 'admin', 'superadmin']
      );
      return;
    }

    this.authService.checkOnePortalSession(idpToken)
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe({
        next: (response) => this.handleResponse(response),
        error: () => {
          this.state = 'error';
        },
      });
  }

  // Route based on backend response shape
  private handleResponse(response: any): void {
    if (!response.session) {
      this.router.navigate(['/login']);
      return;
    }

    if (response.requires_role_selection) {
      this.availableRoles = response.available_roles ?? [];
      this.state = 'role-selection';
      return;
    }

    // Single role — store auth data and navigate
    const token = response.token;
    const user  = response.data;

    let expiresAt: string | undefined;
    if (token?.expires_in) {
      const expiryDate = new Date();
      expiryDate.setSeconds(expiryDate.getSeconds() + token.expires_in);
      expiresAt = expiryDate.toISOString();
    }

    this.authService.setUserData(user, expiresAt, 'idp');
    localStorage.setItem('token', token.token ?? '');

    this.router.navigate([response.redirect_to]);
  }

  // Complete session login scoped to the chosen role
  selectRole(role: string): void {
    const idpToken = this.cookieService.get('access_token');

    if (!idpToken) {
      this.authService.initiateIdpLogin([role]);
      return;
    }

    this.state = 'checking';
    this.authService.checkOnePortalSession(idpToken, role)
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe({
        next: (response) => this.handleResponse(response),
        error: () => {
          this.state = 'error';
        },
      });
  }

  // Return to the login landing page
  goToLogin(): void {
    this.router.navigate(['/login']);
  }
}

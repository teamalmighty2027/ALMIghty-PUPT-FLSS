import {
  Component,
  OnInit,
  OnDestroy,
  Renderer2,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';

import { Subject, Observable } from 'rxjs';

import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRippleModule } from '@angular/material/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatMenuModule } from '@angular/material/menu';
import { MatSymbolDirective } from '../../core/imports/mat-symbol.directive';

import { DialogFacultyLoginComponent } from
  '../../shared/dialog-faculty-login/dialog-faculty-login.component';
import { DialogAdminLoginComponent } from
  '../../shared/dialog-admin-login/dialog-admin-login.component';
import { SlideshowComponent } from '../../shared/slideshow/slideshow.component';

import { ThemeService } from '../../core/services/theme/theme.service';
import { AuthService } from '../../core/services/auth/auth.service';
import { environment } from '../../../environments/environment.dev';
import { environmentOAuth } from '../../../environments/env.auth';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
  imports: [
    CommonModule,
    SlideshowComponent,
    MatSymbolDirective,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatRippleModule,
    MatTooltipModule,
    MatSnackBarModule,
  ],
})
export class LoginComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private isAdminDialogOpen = false;
  private isFacultyDialogOpen = false;

  isFacultyLoading = false;
  isAdminLoading = false;
  isIdpAvailable = true;

  readonly slideshowImages = [
    'assets/images/pupt_img_1.webp',
    'assets/images/pupt_img_2.webp',
    'assets/images/pupt_img_3.webp',
    'assets/images/pupt_img_4.webp',
    'assets/images/pupt_img_5.webp',
  ];

  currentBackgroundImage = '';
  isDarkTheme$: Observable<boolean>;

  /**
   * Wire up login dependencies.
   */
  constructor(
    private themeService: ThemeService,
    private authService: AuthService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private route: ActivatedRoute,
    private router: Router,
  ) {
    this.isDarkTheme$ = this.themeService.isDarkTheme$;
  }

  /**
   * Return true if the Local Login button should be displayed.
   */
  get showLocalLoginButton(): boolean {
    return this.isLocalLoginForced() || !this.isIdpAvailable;
  }

  /**
   * Initialize the login view state.
   */
  ngOnInit() {
    this.currentBackgroundImage = `url(${this.slideshowImages[0]})`;
    this.showSessionExpiredNotice();
    this.checkIdpAvailability();
  }

  /**
   * Probe IDP service status on page load.
   */
  private checkIdpAvailability(): void {
    if (this.isLocalLoginForced()) {
      return;
    }

    this.authService.checkIdpReachable().subscribe((isReachable) => {
      this.isIdpAvailable = isReachable;
    });
  }

  /**
   * Tear down subscriptions and resources.
   */
  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Update the background image when the slideshow changes.
   */
  onSlideChange(index: number) {
    this.currentBackgroundImage = `url(${this.slideshowImages[index]})`;
  }

  /**
   * Check if local login should be forced directly.
   */
  private isLocalLoginForced(): boolean {
    const useLocal = (environment as any).useLocalLogin ||
      (environmentOAuth as any).useLocalLogin;

    return !!useLocal;
  }

  /**
   * Handle faculty login attempt via IDP with fallback to local dialog.
   */
  onFacultyLogin(): void {
    if (this.isLocalLoginForced()) {
      this.openFacultyLoginDialog();
      return;
    }

    if (this.isFacultyLoading || this.isFacultyDialogOpen) return;

    this.isFacultyLoading = true;
    this.authService.getIdpLoginUrl(['faculty']).subscribe({
      next: (response) => {
        this.isFacultyLoading = false;
        window.location.href = response.url;
      },
      error: (error) => {
        console.error('IDP login error:', error);
        this.isFacultyLoading = false;
        this.isIdpAvailable = false;
        const msg = error.error?.message ||
          'IDP login service unavailable. Opening local login.';
        this.snackBar.open(
          msg,
          'Close',
          {
            duration: 5000,
            horizontalPosition: 'center',
            verticalPosition: 'bottom',
          },
        );
        this.openFacultyLoginDialog();
      },
    });
  }

  /**
   * Handle admin login attempt via IDP with fallback to local dialog.
   */
  onAdminLogin(): void {
    if (this.isLocalLoginForced()) {
      this.openAdminLoginDialog();
      return;
    }

    if (this.isAdminLoading || this.isAdminDialogOpen) return;

    this.isAdminLoading = true;
    this.authService.getIdpLoginUrl(['admin', 'superadmin']).subscribe({
      next: (response) => {
        this.isAdminLoading = false;
        window.location.href = response.url;
      },
      error: (error) => {
        console.error('IDP login error:', error);
        this.isAdminLoading = false;
        this.isIdpAvailable = false;
        const msg = error.error?.message ||
          'IDP login service unavailable. Opening local login.';
        this.snackBar.open(
          msg,
          'Close',
          {
            duration: 5000,
            horizontalPosition: 'center',
            verticalPosition: 'bottom',
          },
        );
        this.openAdminLoginDialog();
      },
    });
  }

  /**
   * Open the faculty login dialog.
   */
  openFacultyLoginDialog(): void {
    if (this.isFacultyDialogOpen) return;

    this.isFacultyDialogOpen = true;
    const dialogRef = this.dialog.open(DialogFacultyLoginComponent, {
      autoFocus: true,
    });

    dialogRef.afterClosed().subscribe(() => {
      this.isFacultyDialogOpen = false;
    });
  }

  /**
   * Open the admin login dialog.
   */
  openAdminLoginDialog(): void {
    if (this.isAdminDialogOpen) return;

    this.isAdminDialogOpen = true;
    const dialogRef = this.dialog.open(DialogAdminLoginComponent, {
      autoFocus: true,
    });

    dialogRef.afterClosed().subscribe(() => {
      this.isAdminDialogOpen = false;
    });
  }

  /**
   * Toggle the current theme preference.
   */
  toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  /**
   * Show a snackbar when the session expired and clear the flag.
   */
  private showSessionExpiredNotice(): void {
    const reason = this.route.snapshot.queryParamMap.get('reason');

    if (reason !== 'session-expired') {
      return;
    }

    this.snackBar.open(
      'Session expired. Please log in again.',
      'Close',
      {
        duration: 5000,
        horizontalPosition: 'center',
        verticalPosition: 'bottom',
      },
    );

    this.router.navigate([], {
      queryParams: { reason: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}

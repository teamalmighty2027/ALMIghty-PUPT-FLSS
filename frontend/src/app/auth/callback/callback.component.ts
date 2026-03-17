import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { Subject, finalize, timer } from 'rxjs';
import { map, switchMap, takeUntil } from 'rxjs/operators';

import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';

import { CustomSpinnerComponent } from '../../shared/custom-spinner/custom-spinner.component';
import { AccessDeniedDialogComponent } from './access-denied-dialog/access-denied-dialog.component';

import { AuthService } from '../../core/services/auth/auth.service';

import { environmentOAuth } from '../../../environments/env.auth';

@Component({
  selector: 'app-callback',
  templateUrl: './callback.component.html',
  styleUrls: ['./callback.component.scss'],
  imports: [CustomSpinnerComponent],
})
export class CallbackComponent implements OnInit, OnDestroy {
  private unsubscribe$ = new Subject<void>();
  loadingText = 'Processing your request...';
  private originalOAuthParams?: {
    client_id: string;
    redirect_uri: string;
    state: string;
    response_type: string;
    user_id: string;
  };

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {}

  ngOnInit() {
    this.route.queryParams
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe((params) => {
        this.loadingText = 'Almost there! Finishing your login';
        const minimumDelay = timer(3000);

        this.authService
          .handleIdpCallback(params)
          .pipe(
            switchMap((response) =>
              minimumDelay.pipe(map(() => response))
            ),
            takeUntil(this.unsubscribe$)
          )
          .subscribe({
            next: (response) => {
              // Redirect based on user role
              const role = response.data?.role;

              if (!role) {
                this.handleError('User role could not be determined');
                return;
              }
              
              const navigationPath = this.getNavigationPath(role);
              
              if (!navigationPath) {
                console.warn('Unknown user role:', role);
                this.handleError(`Unknown user role: ${role}`);
                return;
              }

              this.router.navigate([navigationPath]).then(
                (error) => console.error('Navigation error:', error)
              );
            },
            error: (error) => {
              console.error('OAuth callback error:', error);
              this.handleError(error.message || 'Failed to process login');
            },
          });
      });
  }

  ngOnDestroy() {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  /**
   * Helper method to determine navigation path based on user role
   * @param role 
   * @returns 
   */
  private getNavigationPath(role: string): string | null {
    switch (role) {
      case 'faculty':
        return '/faculty/home';
      case 'admin':
        return '/admin';
      case 'superadmin':
        return '/superadmin';
      default:
        return null;
    }
  }

  private handleError(message: string) {
    this.snackBar.open(message, 'Close', {
      duration: 5000,
      horizontalPosition: 'end',
      verticalPosition: 'top',
    });
    this.router.navigate(['/login']);
  }
}

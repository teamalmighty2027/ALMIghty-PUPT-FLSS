import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { A11yModule } from '@angular/cdk/a11y';
import { MatButtonModule } from '@angular/material/button';
import { MatRippleModule } from '@angular/material/core';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSymbolDirective } from '../../core/imports/mat-symbol.directive';

import { AuthService, LoginError } from '../../core/services/auth/auth.service';
import { DialogRedirectComponent } from '../dialog-redirect/dialog-redirect.component';

@Component({
  selector: 'app-dialog-faculty-login',
  templateUrl: './dialog-faculty-login.component.html',
  styleUrls: ['./dialog-faculty-login.component.scss'],
  imports: [
    ReactiveFormsModule,
    A11yModule,
    MatButtonModule,
    MatIconModule,
    MatRippleModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatSymbolDirective,
    MatFormFieldModule,
    MatInputModule,
    CommonModule,
  ],
})
export class DialogFacultyLoginComponent implements OnInit {
  loginForm!: FormGroup;
  showPassword = false;
  passwordHasValue = false;
  isLoading = false;
  isRedirectDialogOpen = false;

  constructor(
    public dialogRef: MatDialogRef<DialogFacultyLoginComponent>,
    private formBuilder: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private snackbar: MatSnackBar,
    private dialog: MatDialog,
    @Inject(MAT_DIALOG_DATA) public data: any,
  ) {}

  // Initialize the dialog form.
  ngOnInit(): void {
    this.initForm();
  }

  // Configure the login form controls.
  initForm(): void {
    this.loginForm = this.formBuilder.group({
      email: [
        '',
        [Validators.required, Validators.email, Validators.maxLength(254)],
      ],
      password: [
        '',
        [
          Validators.required,
          Validators.minLength(8),
          Validators.maxLength(128),
        ],
      ],
    });

    this.loginForm.get('password')?.valueChanges.subscribe((value) => {
      this.passwordHasValue = !!value;
    });
  }

  // Return the email control.
  get email() {
    return this.loginForm.get('email');
  }

  // Return the password control.
  get password() {
    return this.loginForm.get('password');
  }

  // Toggle password visibility.
  public togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  // Close the dialog without logging in.
  public onCloseClick(): void {
    this.dialogRef.close();
  }

  // Submit the login form and navigate on success.
  public onSubmit(): void {
    if (this.loginForm.valid) {
      this.isLoading = true;
      const { email, password } = this.loginForm.value;

      this.authService.handleLogin(email, password, ['faculty']).subscribe({
        next: (response) => {
          this.authService.setSanctumToken(response.token, response.expires_at);

          this.isLoading = false;
          this.dialogRef.close();
          this.router.navigateByUrl('/faculty/home', { replaceUrl: true });
        },
        error: (error: LoginError) => {
          this.showErrorSnackbar(error.message);
          this.isLoading = false;
        },
      });
    }
  }

  // Start the IDP login flow.
  onIdpLogin(): void {
    if (this.isRedirectDialogOpen) return;

    this.dialogRef.close();

    this.isRedirectDialogOpen = true;
    const dialogRef = this.dialog.open(DialogRedirectComponent, {
      autoFocus: true,
      data: { checkingIDP: true, redirecting: true, intendedRole: ['faculty'] },
    });

    dialogRef.afterClosed().subscribe(() => {
      this.isRedirectDialogOpen = false;
    });

    try {
      this.authService.initiateIdpLogin(['faculty']);
    } catch (error) {
      console.error('Error initiating IDP login:', error);
      dialogRef.close();
      this.snackbar.open('Failed to initiate global login. Please try again.', 'Close', { duration: 5000 });
    }
  }

  // Log out after an automatic expiry event.
  private onAutoLogout(): void {
    if (this.authService.getToken()) {
      this.authService.logout().subscribe({
        next: () =>
          this.handleLogoutSuccess('Session expired. Please log in again.'),
        error: () =>
          this.handleLogoutSuccess('Session expired. Please log in again.'),
      });
    } else {
      this.handleLogoutSuccess('Session expired. Please log in again.');
    }
  }

  // Finalize logout by clearing auth state and redirecting.
  private handleLogoutSuccess(message?: string): void {
    this.authService.clearCookies();
    this.dialogRef.close();
    if (message) {
      alert(message);
    }
    this.router.navigate(['/login']);
  }

  // Show error feedback for the login attempt.
  private showErrorSnackbar(message: string): void {
    this.snackbar.open(message, 'Close', {
      duration: 5000,
      horizontalPosition: 'center',
      verticalPosition: 'bottom',
      panelClass: ['error-snackbar'],
    });
  }

  // Navigate to the password reset flow.
  public onForgotPassword(): void {
    this.dialogRef.close();
    this.router.navigate(['/reset-password']);
  }
}

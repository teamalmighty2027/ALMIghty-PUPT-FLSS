import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { A11yModule } from '@angular/cdk/a11y';
import { MatDialogRef } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth/auth.service';
import { CookieService } from 'ngx-cookie-service';
import { fadeAnimation } from '../../core/animations/animations';

@Component({
  selector: 'app-dialog-terms-conditions',
  standalone: true,
  imports: [CommonModule, FormsModule, A11yModule],
  templateUrl: './dialog-terms-conditions.component.html',
  styleUrl: './dialog-terms-conditions.component.scss',
  animations: [fadeAnimation],
})
export class DialogTermsConditionsComponent {
  isAccepted: boolean = false;

  constructor(
    public dialogRef: MatDialogRef<DialogTermsConditionsComponent>,
    private router: Router,
    private authService: AuthService,
    private cookieService: CookieService
  ) {}

  /**
   * Closes the dialog and redirects the user to the login page
   */
  onCancel(): void {
    this.dialogRef.close(false);
    this.authService.logout().subscribe({
          next: () => {
            this.authService.clearCookies();
            this.router.navigate(['/login']);
          },
          error: () => {

          },
        });
  }

  onContinue(): void {
    if (this.isAccepted) {
      this.dialogRef.close(true);
      this.cookieService.set('termsAccepted', 'true', 365);
    }
  }
}
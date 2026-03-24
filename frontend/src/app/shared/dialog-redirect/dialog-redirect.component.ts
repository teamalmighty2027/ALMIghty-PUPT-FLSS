import { Component, OnInit, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';

import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatSymbolDirective } from '../../core/imports/mat-symbol.directive';

import { CustomSpinnerComponent } from '../custom-spinner/custom-spinner.component';

import { AuthService } from '../../core/services/auth/auth.service';

import { slideTextAnimation } from '../../core/animations/animations';

@Component({
  selector: 'app-dialog-redirect',
  imports: [CommonModule, CustomSpinnerComponent, MatSymbolDirective],
  templateUrl: './dialog-redirect.component.html',
  styleUrls: ['./dialog-redirect.component.scss'],
  animations: [slideTextAnimation],
})
export class DialogRedirectComponent implements OnInit {
  checkingIDP: boolean;
  redirecting: boolean;
  intendedRole: string[];

  constructor(
    private dialogRef: MatDialogRef<DialogRedirectComponent>,
    private authService: AuthService,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    this.checkingIDP = data.checkingIDP;
    this.redirecting = data.redirecting;
    this.intendedRole = Array.isArray(data?.intendedRole)
      ? data.intendedRole : [];
  }

  ngOnInit(): void {
    if (!this.checkingIDP) {
      this.initiateRedirection();
    }
  }

  updateState(checkingIDP: boolean, redirecting: boolean): void {
    this.checkingIDP = checkingIDP;
    this.redirecting = redirecting;
    if (this.redirecting) {
      this.initiateRedirection();
    }
  }

  initiateRedirection(): void {
    setTimeout(() => {
      this.dialogRef.close();
      this.authService.initiateIdpLogin(this.intendedRole);
    }, 2000);
  }

  get currentTextState(): 'connecting' | 'redirecting' {
    if (this.checkingIDP) return 'connecting';
    if (this.redirecting) return 'redirecting';

    return 'connecting';
  }
}

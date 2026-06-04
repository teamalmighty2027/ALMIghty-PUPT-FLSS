import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';

import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSymbolDirective } from '../../core/imports/mat-symbol.directive';

import { PreferencesService } from '../../core/services/faculty/preference/preferences.service';
import { ReschedulingService } from '../../core/services/faculty/rescheduling/rescheduling.service';

interface DialogRequestAccessData {
  has_request: boolean;
  facultyId: string;
  requestType?: 'preference' | 'appeal'; // ADDED THIS
}

@Component({
  selector: 'app-dialog-request-access',
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatSymbolDirective,
  ],
  templateUrl: './dialog-request-access.component.html',
  styleUrls: ['./dialog-request-access.component.scss'],
})
export class DialogRequestAccessComponent {
  hasRequest: boolean;
  isLoading: boolean = false;
  isAppeal: boolean = false;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: DialogRequestAccessData,
    private dialogRef: MatDialogRef<DialogRequestAccessComponent>,
    private preferencesService: PreferencesService,
    private reschedulingService: ReschedulingService, // INJECTED THIS
    private snackBar: MatSnackBar,
  ) {
    this.hasRequest = data.has_request;
    this.isAppeal = data.requestType === 'appeal';
  }

  closeDialog(): void {
    this.dialogRef.close();
  }

  requestAccess(): void {
    this.isLoading = true;
    
    // BRANCH LOGIC BASED ON REQUEST TYPE
    const requestObservable = this.isAppeal 
      ? this.reschedulingService.requestAppealAccess(this.data.facultyId)
      : this.preferencesService.requestAccess(this.data.facultyId);

    requestObservable.subscribe({
      next: () => {
        this.snackBar.open('Request for submission access successfully sent.', 'Close', { duration: 3000 });
        this.dialogRef.close(true);
      },
      error: () => {
        this.snackBar.open('Failed to submit request for access. Try again.', 'Close', { duration: 3000 });
        this.isLoading = false;
      },
    });
  }

  cancelRequestAccess(): void {
    this.isLoading = true;

    // BRANCH LOGIC BASED ON REQUEST TYPE
    const cancelObservable = this.isAppeal
      ? this.reschedulingService.cancelAppealAccessRequest(this.data.facultyId)
      : this.preferencesService.cancelRequestAccess(this.data.facultyId);

    cancelObservable.subscribe({
      next: () => {
        this.snackBar.open('Request for submission access has been canceled.', 'Close', { duration: 3000 });
        this.dialogRef.close(false);
      },
      error: () => {
        this.snackBar.open('Request cancellation has failed. Please try again.', 'Close', { duration: 3000 });
        this.isLoading = false;
      },
    });
  }
}
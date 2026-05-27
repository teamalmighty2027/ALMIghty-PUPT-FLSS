import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title style="color: #800000; font-weight: bold; margin-bottom: 0;">{{ data.title }}</h2>
    <mat-dialog-content style="margin-top: 10px; font-size: 15px; color: #333;">
      <p>{{ data.message }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end" style="padding-bottom: 15px; padding-right: 15px;">
      <button mat-button mat-dialog-close style="color: #666;">Cancel</button>
      <button mat-flat-button [mat-dialog-close]="true" style="background-color: #d32f2f; color: white;">
        {{ data.confirmText || 'Delete' }}
      </button>
    </mat-dialog-actions>
  `
})
export class ConfirmDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<ConfirmDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { title: string; message: string; confirmText?: string }
  ) {}
}
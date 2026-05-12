import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'app-dialog-birthdate-warning',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule],
<<<<<<< HEAD
  template: `
    <div class="dialog-content">
      <h2 class="dialog-title">Invalid Birthdate</h2>
      <p class="dialog-message">
        Birthdate cannot be today. Please select a valid date of birth so that admin users are legally aged.
      </p>
      <div class="dialog-actions">
        <button mat-flat-button color="primary" (click)="close()">OK</button>
      </div>
    </div>
  `,
  styles: [
    `
      .dialog-content {
        padding: 24px;
        min-width: 320px;
      }
      .dialog-title {
        margin: 0 0 16px;
        font-size: 1.25rem;
        font-weight: 600;
      }
      .dialog-message {
        margin: 0 0 24px;
        color: rgba(0, 0, 0, 0.8);
      }
      .dialog-actions {
        display: flex;
        justify-content: flex-end;
      }
    `
  ]
})
export class DialogBirthdateWarningComponent {
  constructor(private dialogRef: MatDialogRef<DialogBirthdateWarningComponent>) {}
=======
  templateUrl: './dialog-birthdate-warning.component.html',
  styleUrl: './dialog-birthdate-warning.component.scss'
})
export class DialogBirthdateWarningComponent {
  constructor(
    private dialogRef: MatDialogRef<DialogBirthdateWarningComponent>
  ) {}
>>>>>>> bc930bb6c46df52076b60341f075a51f3906ed44

  close(): void {
    this.dialogRef.close();
  }
}

import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'app-dialog-birthdate-warning',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule],
  templateUrl: './dialog-birthdate-warning.component.html',
  styleUrl: './dialog-birthdate-warning.component.scss'
})
export class DialogBirthdateWarningComponent {
  constructor(
    private dialogRef: MatDialogRef<DialogBirthdateWarningComponent>
  ) {}

  close(): void {
    this.dialogRef.close();
  }
}

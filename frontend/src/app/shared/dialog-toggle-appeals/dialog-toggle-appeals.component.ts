import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { provideNativeDateAdapter } from '@angular/material/core';

@Component({
  selector: 'app-dialog-toggle-appeals',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
    MatIconModule
  ],
  providers: [provideNativeDateAdapter()],
  templateUrl: './dialog-toggle-appeals.component.html',
  styleUrl: './dialog-toggle-appeals.component.scss'
})
export class DialogToggleAppealsComponent {
  startDate: Date | null = null;
  endDate: Date | null = null;
  sendEmail: boolean = false;
  minDate: Date = new Date();

  constructor(
    public dialogRef: MatDialogRef<DialogToggleAppealsComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { 
      type: string, 
      facultyName?: string, 
      academicYear: string, 
      semester: string,
      currentState: boolean 
    }
  ) {}

  onStartDateChange(event: any): void {
    if (this.endDate && event.value > this.endDate) {
      this.endDate = null;
    }
  }

  confirm(): void {
    // If turning OFF (currentState is true), dates are not required.
    if (this.data.currentState || (this.startDate && this.endDate)) {
      this.dialogRef.close({
        startDate: this.startDate,
        endDate: this.endDate,
        sendEmail: this.sendEmail
      });
    }
  }

  close(): void {
    this.dialogRef.close(null);
  }
}
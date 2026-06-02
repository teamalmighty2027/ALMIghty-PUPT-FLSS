import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatRippleModule } from '@angular/material/core';

@Component({
  selector: 'app-dialog-rescheduling',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatRippleModule,
  ],
  templateUrl: './dialog-rescheduling.component.html',
  styleUrl: './dialog-rescheduling.component.scss'
})
export class DialogReschedulingComponent implements OnInit {
  adminRemarks: string = '';
  daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  constructor(
    public dialogRef: MatDialogRef<DialogReschedulingComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { appeal: any; timeOptions: string[] }
  ) {}

  ngOnInit(): void {
    this.adminRemarks = this.data.appeal.adminRemarks || '';
  }

  onAction(action: 'Approve' | 'Deny'): void {
    this.dialogRef.close({
      action,
      remarks: this.adminRemarks,
      updatedAppeal: this.data.appeal
    });
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  clearAll(): void {
    this.data.appeal.preferredDay = undefined;
    this.data.appeal.preferredStartTime = undefined;
    this.data.appeal.preferredEndTime = undefined;
    this.data.appeal.room = undefined;
    this.adminRemarks = '';
  }
}
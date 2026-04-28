import { Component, Inject, OnInit, Injectable } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { DateAdapter, MAT_DATE_FORMATS, MAT_DATE_LOCALE, NativeDateAdapter } from '@angular/material/core';

// 1. The custom adapter (Notice the @Injectable decorator here)
@Injectable()
export class CustomDateAdapter extends NativeDateAdapter {
  override format(date: Date, displayFormat: Object): string {
    if (displayFormat === 'input') {
      const day = date.getDate();
      const month = date.toLocaleString('en-US', { month: 'long' });
      const year = date.getFullYear();
      return `${month} ${day}, ${year}`;
    }
    return date.toDateString();
  }
}

// 2. The date formats
export const MY_DATE_FORMATS = {
  parse: {
    dateInput: 'MM/dd/yyyy',
  },
  display: {
    dateInput: 'input',
    monthYearLabel: 'MMMM yyyy',
    dateA11yLabel: 'MMMM d, yyyy',
    monthYearA11yLabel: 'MMMM yyyy',
  },
};

// 3. The Component decorator (This MUST be right above the Dialog class)
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
  providers: [
    { provide: DateAdapter, useClass: CustomDateAdapter },
    { provide: MAT_DATE_LOCALE, useValue: 'en-US' },
    { provide: MAT_DATE_FORMATS, useValue: MY_DATE_FORMATS },
  ],
  templateUrl: './dialog-toggle-appeals.component.html',
  styleUrl: './dialog-toggle-appeals.component.scss'
})
export class DialogToggleAppealsComponent implements OnInit {
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
      currentState: boolean,
      startDate?: string | Date | null,
      endDate?: string | Date | null
    }
  ) {}

  ngOnInit(): void {
    if (this.data.startDate) {
      this.startDate = new Date(this.data.startDate);
    }
    if (this.data.endDate) {
      this.endDate = new Date(this.data.endDate);
    }
  }

  onStartDateChange(event: any): void {
    if (this.endDate && event.value > this.endDate) {
      this.endDate = null;
    }
  }

  confirm(): void {
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
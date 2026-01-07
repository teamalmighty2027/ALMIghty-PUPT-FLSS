import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';

@Component({
  selector: 'app-dialog-appeal-schedule',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatSelectModule
  ],
  templateUrl: './dialog-appeal-schedule.component.html',
  styleUrls: ['./dialog-appeal-schedule.component.scss']
})
export class DialogAppealScheduleComponent {
  appealForm: FormGroup;
  isEditMode: boolean = false;
  selectedFile: File | null = null;
  selectedFileName: string = '';

  days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  
  // Time options for dropdowns
  timeOptions: string[] = [];

  constructor(
    private fb: FormBuilder,
    public dialogRef: MatDialogRef<DialogAppealScheduleComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    this.isEditMode = data.isEditMode || false;
    this.generateTimeOptions();
    
    // Initialize appealForm immediately in constructor
    this.appealForm = this.fb.group({});
    this.initializeForm();
  }

  private generateTimeOptions(): void {
    const times: string[] = [];
    for (let hour = 7; hour <= 21; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const period = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
        const displayMinute = minute.toString().padStart(2, '0');
        times.push(`${displayHour}:${displayMinute} ${period}`);
      }
    }
    this.timeOptions = times;
  }

  private initializeForm(): void {
    if (this.isEditMode) {
      // Edit mode with appeal schedule fields - rebuild the form
      this.appealForm = this.fb.group({
        appealFile: [null, Validators.required],
        appealDay: [this.data.block.day || '', Validators.required],
        appealStartTime: ['', Validators.required],
        appealEndTime: ['', Validators.required],
        appealRoom: ['', Validators.required],
        reason: ['', [Validators.required, Validators.minLength(10)]]
      });
    } else {
      // Original appeal mode - rebuild the form
      this.appealForm = this.fb.group({
        reason: ['', [Validators.required, Validators.minLength(10)]]
      });
    }
  }

  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      // Validate file type (PDF only)
      if (file.type !== 'application/pdf') {
        alert('Please upload a PDF file only.');
        event.target.value = '';
        return;
      }

      // Validate file size (max 5MB)
      const maxSize = 5 * 1024 * 1024; // 5MB
      if (file.size > maxSize) {
        alert('File size must be less than 5MB.');
        event.target.value = '';
        return;
      }

      this.selectedFile = file;
      this.selectedFileName = file.name;
      this.appealForm.patchValue({ appealFile: file });
    }
  }

  removeFile(): void {
    this.selectedFile = null;
    this.selectedFileName = '';
    this.appealForm.patchValue({ appealFile: null });
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onClearAll(): void {
    if (this.isEditMode) {
      this.appealForm.reset({
        appealDay: '',
        appealStartTime: '',
        appealEndTime: '',
        appealRoom: '',
        reason: ''
      });
      this.removeFile();
    } else {
      this.appealForm.reset();
    }
  }

  onSubmit(): void {
    if (this.appealForm.valid) {
      if (this.isEditMode) {
        // Validate end time is after start time
        const startTime = this.appealForm.value.appealStartTime;
        const endTime = this.appealForm.value.appealEndTime;
        
        if (this.compareTimeStrings(startTime, endTime) >= 0) {
          alert('End time must be after start time.');
          return;
        }

        const appealData = {
          ...this.data.block,
          appealFile: this.selectedFile,
          appealSchedule: {
            day: this.appealForm.value.appealDay,
            startTime: this.appealForm.value.appealStartTime,
            endTime: this.appealForm.value.appealEndTime,
            room: this.appealForm.value.appealRoom
          },
          reason: this.appealForm.value.reason,
          timestamp: new Date()
        };
        
        console.log('Edit Appeal Submitted:', appealData);
        this.dialogRef.close(appealData);
      } else {
        const appealData = {
          ...this.data.block,
          reason: this.appealForm.value.reason,
          timestamp: new Date()
        };
        
        console.log('Appeal Submitted:', appealData);
        this.dialogRef.close(appealData);
      }
    }
  }

  // Helper function to compare time strings
  private compareTimeStrings(time1: string, time2: string): number {
    const parseTime = (timeStr: string): number => {
      const [time, period] = timeStr.split(' ');
      let [hours, minutes] = time.split(':').map(Number);
      
      if (period === 'PM' && hours !== 12) hours += 12;
      if (period === 'AM' && hours === 12) hours = 0;
      
      return hours * 60 + minutes;
    };

    return parseTime(time1) - parseTime(time2);
  }
}
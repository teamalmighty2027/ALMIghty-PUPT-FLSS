import { Component, Inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { HttpClient } from '@angular/common/http';

@Component({
  // ... your component metadata
})
export class DialogAppealScheduleComponent {
  appealForm: FormGroup;
  selectedFile: File | null = null;
  selectedFileName: string = '';
  isEditMode: boolean = true; // Assuming this is set based on your logic

  constructor(
    private fb: FormBuilder,
    private http: HttpClient,
    public dialogRef: MatDialogRef<DialogAppealScheduleComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    // Initialize your form
    this.appealForm = this.fb.group({
      appealDay: ['', Validators.required],
      appealStartTime: ['', Validators.required],
      appealEndTime: ['', Validators.required],
      appealRoom: [''],
      reason: ['', [Validators.required, Validators.minLength(10)]]
    });
  }

  // 1. Capture the file when selected in the HTML
  onFileSelected(event: any) {
    const file: File = event.target.files[0];
    if (file) {
      this.selectedFile = file;
      this.selectedFileName = file.name; // This updates your UI to show the filename
    }
  }

  // Optional: Allow users to remove the selected file
  removeFile() {
    this.selectedFile = null;
    this.selectedFileName = '';
  }

  // 2. Submit the form using FormData
  onSubmit() {
    if (this.appealForm.invalid) {
      return;
    }

    const formValues = this.appealForm.value;
    const formData = new FormData();

    // Map your form values to match Laravel's expected keys perfectly
    // Ensure scheduleId exists in your injected data!
    formData.append('scheduleId', this.data.original.schedule_id.toString()); 
    formData.append('reason', formValues.reason);
    formData.append('day', formValues.appealDay);
    formData.append('startTime', formValues.appealStartTime);
    formData.append('endTime', formValues.appealEndTime);
    
    if (formValues.appealRoom) {
      formData.append('roomCode', formValues.appealRoom);
    }

    // Append the file if they uploaded one
    if (this.selectedFile) {
      formData.append('appealFile', this.selectedFile);
    }

    // Send it to your Laravel API
    this.http.post('http://localhost:8000/api/submit-rescheduling-appeal', formData)
      .subscribe({
        next: (response) => {
          console.log('Appeal submitted successfully', response);
          this.dialogRef.close(true); // Close dialog on success
        },
        error: (error) => {
          console.error('Error submitting appeal', error);
          // Handle your error UI here
        }
      });
  }

  onCancel() {
    this.dialogRef.close();
  }

  onClearAll() {
    this.appealForm.reset();
    this.removeFile();
  }
}
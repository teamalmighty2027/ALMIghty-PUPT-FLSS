import { Component, Inject, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subject, takeUntil } from 'rxjs';

import { ReschedulingService } from '../../core/services/faculty/rescheduling/rescheduling.service';
import { SchedulingService } from '../../core/services/admin/scheduling/scheduling.service';

export interface ManualOverrideDialogData {
  original: {
    scheduleId: number;
    courseCode: string;
    courseTitle: string;
    program: string;
    yearLevel: string;
    section: string;
    day: string;
    roomCode: string;
    timeRange: string;
  };
  facultyName: string;
  options: {
    timeOptions: string[];
    endTimeOptions?: string[];
  };
  cachedSchedules?: any;
  cachedRooms?: any;
  cachedArrangements?: any;
  scheduleContext?: any;
}

@Component({
  selector: 'app-dialog-manual-override',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatSelectModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './dialog-manual-override.component.html',
  styleUrls: ['./dialog-manual-override.component.scss']
})
export class DialogManualOverrideComponent implements OnInit, OnDestroy {
  overrideForm: FormGroup;

  days = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday'
  ];

  roomOptions: string[] = [];

  conflictMessages: string[] = [];

  hasConflicts = false;

  isSubmitting = false;

  endTimeOptions: string[] = [];

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private schedulingService: SchedulingService,
    private reschedulingService: ReschedulingService,
    public dialogRef: MatDialogRef<DialogManualOverrideComponent>,
    private snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef,
    @Inject(MAT_DIALOG_DATA) public data: ManualOverrideDialogData
  ) {
    this.overrideForm = this.fb.group({
      day: [data.original.day || '', Validators.required],
      startTime: ['', Validators.required],
      endTime: ['', Validators.required],
      room: [data.original.roomCode || '']
    });
  }

  // Initializes room dropdown and start time change listeners
  ngOnInit(): void {
    this.loadRooms();
    this.subscribeToStartTimeChanges();
  }

  // Fetches active room list from scheduling service
  private loadRooms(): void {
    this.schedulingService.getAllRooms().subscribe({
      next: (response: any) => {
        if (response && response.rooms) {
          const availableRooms = response.rooms.filter(
            (room: any) => room.status === 'Available'
          );

          this.roomOptions = availableRooms.map(
            (room: any) => room.room_code
          );
        }
      },
      error: (error: any) => {
        console.error('Failed to load rooms:', error);
        this.roomOptions = ['A401', 'A402'];
      }
    });
  }

  // Subscribes to start time changes to dynamically calculate end times
  private subscribeToStartTimeChanges(): void {
    this.overrideForm
      .get('startTime')!
      .valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe((startTime) => {
        if (startTime) {
          this.updateEndTimeOptions(startTime);
        } else {
          this.endTimeOptions = [...this.data.options.timeOptions];
        }

        this.hasConflicts = false;
        this.cdr.markForCheck();
      });

    this.overrideForm
      .get('endTime')!
      .valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.hasConflicts = false;
        this.cdr.markForCheck();
      });

    this.overrideForm
      .get('day')!
      .valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.hasConflicts = false;
        this.cdr.markForCheck();
      });

    this.overrideForm
      .get('room')!
      .valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.hasConflicts = false;
        this.cdr.markForCheck();
      });
  }

  // Updates available end time options based on selected start time
  private updateEndTimeOptions(startTime: string): void {
    const startIndex = this.data.options.timeOptions.indexOf(startTime);

    if (startIndex === -1) {
      this.endTimeOptions = [];
      return;
    }

    this.endTimeOptions = this.data.options.timeOptions.slice(
      startIndex + 1
    );

    const currentEndTime = this.overrideForm.get('endTime')?.value;

    if (currentEndTime) {
      const endIndex = this.data.options.timeOptions.indexOf(currentEndTime);

      if (endIndex <= startIndex) {
        this.overrideForm.get('endTime')?.reset('');
      }
    }

    this.cdr.markForCheck();
  }

  // Cancels and closes dialog without saving
  onCancel(): void {
    if (this.isSubmitting) return;

    this.dialogRef.close(false);
  }

  selectedFile: File | null = null;

  selectedFileName = '';

  // Handles PDF file selection for record keeping
  onFileSelected(event: any): void {
    if (this.isSubmitting) return;

    const file = event.target.files[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      this.snackBar.open(
        'Please upload a PDF file only.',
        'Close',
        { duration: 3000 }
      );
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      this.snackBar.open(
        'File size must be less than 5MB.',
        'Close',
        { duration: 3000 }
      );
      return;
    }

    const reader = new FileReader();
    reader.onloadend = (e: any) => {
      const arr = (new Uint8Array(e.target.result)).subarray(0, 4);
      let header = '';
      for (let i = 0; i < arr.length; i++) {
        header += String.fromCharCode(arr[i]);
      }

      if (header !== '%PDF') {
        this.snackBar.open(
          'Invalid PDF content detected.',
          'Close',
          { duration: 3000 }
        );
        this.removeFile();
      } else {
        this.selectedFile = file;
        this.selectedFileName = file.name;
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // Removes current file selection
  removeFile(): void {
    if (this.isSubmitting) return;

    this.selectedFile = null;
    this.selectedFileName = '';
  }

  // Submits manual schedule override via synthetic appeal creation and approval
  onSubmit(): void {
    if (!this.overrideForm.valid || this.isSubmitting) {
      this.overrideForm.markAllAsTouched();
      return;
    }

    const formValues = this.overrideForm.getRawValue();

    this.isSubmitting = true;
    this.conflictMessages = [];
    this.hasConflicts = false;

    // First create appeal with auto-reason
    this.reschedulingService
      .submitReschedulingAppeal(
        this.data.original.scheduleId,
        this.selectedFile,
        'Manual Admin Override',
        {
          day: formValues.day,
          startTime: formValues.startTime,
          endTime: formValues.endTime,
          roomCode: formValues.room
        }
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (createResponse) => {
          const appealId = createResponse?.appeal_id || createResponse?.id;

          if (!appealId) {
            this.isSubmitting = false;
            this.snackBar.open(
              'Failed to create override record.',
              'Close',
              { duration: 4000 }
            );
            return;
          }

          // Approve appeal immediately
          this.reschedulingService
            .approveAppeal(
              appealId,
              {
                day: formValues.day,
                startTime: formValues.startTime,
                endTime: formValues.endTime,
                room: formValues.room
              },
              'Manually overridden by Admin'
            )
            .pipe(takeUntil(this.destroy$))
            .subscribe({
              next: () => {
                this.isSubmitting = false;
                this.snackBar.open(
                  'Schedule changes saved and applied successfully!',
                  'Close',
                  { duration: 3000 }
                );
                this.dialogRef.close(true);
              },
              error: (approveError) => {
                this.isSubmitting = false;
                console.error('Approval failed:', approveError);
                this.handleErrorResponse(approveError);
              }
            });
        },
        error: (createError) => {
          this.isSubmitting = false;
          console.error('Creation failed:', createError);
          this.handleErrorResponse(createError);
        }
      });
  }

  // Formats and displays backend or validation error messages
  private handleErrorResponse(error: any): void {
    let errorBody = error?.error;

    if (typeof errorBody === 'string' && errorBody.includes('{"message"')) {
      try {
        const jsonPart = errorBody.substring(
          errorBody.indexOf('{"message"')
        );
        errorBody = JSON.parse(jsonPart);
      } catch (e) {
        // ignore parse error
      }
    }

    if (error?.status === 409 && errorBody?.conflicts) {
      this.conflictMessages = errorBody.conflicts;
      this.hasConflicts = true;

      this.snackBar.open(
        'Schedule conflicts detected. Please select a valid slot.',
        'Close',
        { duration: 5000 }
      );
    } else {
      const msg = errorBody?.message || 'Failed to save schedule changes.';

      this.snackBar.open(msg, 'Close', { duration: 4000 });
    }

    this.cdr.markForCheck();
  }

  // Cleans up active subscriptions on component destruction
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}

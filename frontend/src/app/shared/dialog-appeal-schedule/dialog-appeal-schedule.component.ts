import { ChangeDetectorRef, Component, Inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SchedulingService } from '../../core/services/admin/scheduling/scheduling.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subject, takeUntil } from 'rxjs';
import {
  ExtractedSchedule,
  PreScanResult,
  ReschedulingService
} from '../../core/services/faculty/rescheduling/rescheduling.service';
import { SpeechRecognitionService } from '../../core/services/speech/speech-recognition.service';

interface DialogData {  
  isEditMode?: boolean;
  facultyName: string,
  appealFile: File | null,
  appealDay: string,
  appealStartTime: string,
  appealEndTime: string,
  appealRoom: string,
  reason: string,
  options: {  
    timeOptions: string[];
    endTimeOptions: string[];
  },
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
  },
};


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
    MatSelectModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './dialog-appeal-schedule.component.html',
  styleUrls: ['./dialog-appeal-schedule.component.scss']
})
export class DialogAppealScheduleComponent implements OnDestroy {
  appealForm: FormGroup;
  isEditMode: boolean = false;
  selectedFile: File | null = null;
  selectedFileName: string = '';
  days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  
  // Time options for dropdowns
  timeOptions: string[] = [];
  roomOptions: string[] = [];
  conflictMessages: string[] = [];
  hasConflicts: boolean = false;
  isSubmitting: boolean = false;
  
  // Speech recognition properties
  isListening: boolean = false;
  speechSupported: boolean = false;

  // AI Pre-scan properties
  isAnalyzing: boolean = false;
  extractedSchedule: ExtractedSchedule | null = null;
  preScanToken: string | null = null;
  aiSummary: string | null = null;

  private destroy$ = new Subject<void>();
  private speechSession$ = new Subject<void>();
  private scanCancel$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private schedulingService: SchedulingService,
    private reschedulingService: ReschedulingService,
    private speechRecognitionService: SpeechRecognitionService,
    public dialogRef: MatDialogRef<DialogAppealScheduleComponent>,
    private snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef,
    @Inject(MAT_DIALOG_DATA) public data: DialogData
  ) {
    this.isEditMode = data.isEditMode || false;
    
    this.appealForm = this.fb.group({
      day: [data.appealDay || '', Validators.required],
      startTime: [data.appealStartTime || '', Validators.required],
      endTime: [data.appealEndTime || '', Validators.required],
      room: [data.appealRoom || ''],
      reason: [data.reason || '', [Validators.required, Validators.minLength(10)]]
    });
    
    this.initializeForm();
  }

  ngOnInit(): void {    
    this.loadRooms();

    queueMicrotask(() => {
      requestAnimationFrame(() => {
        this.subscribeToStartTimeChanges();        
        this.cdr.markForCheck();
      });
    });
  }

  // Load available rooms from the scheduling service
  private loadRooms(): void {
    this.schedulingService.getAllRooms().subscribe({
      next: (response: any) => {
        if (response && response.rooms) {
          const availableRooms = response.rooms.filter(
            (room: any) => room.status === 'Available'
          );
          this.roomOptions = [
            'None / Any',
            ...availableRooms.map((room: any) => room.room_code)
          ];
        }
      },
      error: (error: any) => {
        console.error('Failed to load rooms:', error);
        this.roomOptions = ['None / Any', 'A401', 'A402']; 
      }
    });
  }

  // Add listeners to start time changes to update end time options
  private subscribeToStartTimeChanges(): void {
    this.appealForm
      .get('appealStartTime')!
      .valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe((startTime) => {
        const endTimeControl = this.appealForm.get('appealEndTime');

        if (startTime) {
          this.updateEndTimeOptions(startTime);
          if (!endTimeControl?.value) {              
            endTimeControl?.setErrors({ required: true });
          }
        } else {
          this.data.options.endTimeOptions = [...this.data.options.timeOptions];
          if (!endTimeControl?.value) {
            endTimeControl?.setErrors(null);
          }
        }

        endTimeControl?.markAsTouched();
        this.cdr.markForCheck();
      });

    this.appealForm
      .get('appealEndTime')!
      .valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe((endTime) => {
        const startTimeControl = this.appealForm.get('appealStartTime');

        if (endTime) {
          if (!startTimeControl?.value) {
            startTimeControl?.setErrors({ required: true });
          }
        } else {
          if (!startTimeControl?.value) {
            startTimeControl?.setErrors(null);
          }
        }

        startTimeControl?.markAsTouched();
        this.cdr.markForCheck();
      });
    }

  // Helper function to update end time options based on selected start time
  private updateEndTimeOptions(startTime: string): void {    
    const startIndex = this.data.options.timeOptions.indexOf(startTime);
    if (startIndex === -1) {
      const endTimeControl = this.appealForm.get('appealEndTime');

      if (endTimeControl) {
        endTimeControl.reset('');
        endTimeControl.markAsTouched();

        if (!endTimeControl.value) {
          endTimeControl.setErrors({ required: true });
        }

        this.data.options.endTimeOptions = [];
      }
      return;
    }

    this.data.options.endTimeOptions = this.data.options.timeOptions.slice(
      startIndex + 1
    );

    const currentEndTime = this.appealForm.get('appealEndTime')?.value;

    if (currentEndTime) {      
      const endTimeIndex =
        this.data.options.timeOptions.indexOf(currentEndTime);

      if (endTimeIndex <= startIndex) {
        const endTimeControl = this.appealForm.get('appealEndTime');

        if (endTimeControl) {
          endTimeControl.reset('');
          endTimeControl.markAsTouched();
          endTimeControl.setErrors({ required: true });
        }
      }
    }
    
    this.cdr.markForCheck();
  }

  // Initialize the form based on previous data (if any)
  private initializeForm(): void {
    if (this.isEditMode) {
      // Edit mode with appeal schedule fields - rebuild the form
      this.appealForm = this.fb.group({
        appealFile: [null, Validators.required],
        appealDay: [this.data.appealDay || '', Validators.required],
        appealStartTime: ['', Validators.required],
        appealEndTime: ['', Validators.required],
        appealRoom: [this.data.appealRoom || 'None / Any'],
        reason: ['', [Validators.required, Validators.minLength(10)]]
      });
      this.setupFormValueChanges();
    } else {
      // Original appeal mode - rebuild the form
      this.appealForm = this.fb.group({
        reason: ['', [Validators.required, Validators.minLength(10)]]
      });
    }
  }

  // Reset hasConflicts state on value changes while preserving conflictMessages for reference
  private setupFormValueChanges(): void {
    const controls = [
      'appealDay',
      'appealStartTime',
      'appealEndTime',
      'appealRoom'
    ];
    controls.forEach(ctrl => {
      this.appealForm.get(ctrl)?.valueChanges.pipe(
        takeUntil(this.destroy$)
      ).subscribe(() => {
        this.hasConflicts = false;
        this.cdr.markForCheck();
      });
    });
  }

  onFileSelected(event: any): void {
    if (this.isSubmitting) return;

    const file = event.target.files[0];
    if (!file) return;

    // 1. Basic Type Check
    if (file.type !== 'application/pdf') {
      this.snackBar.open(
        'Please upload a PDF file only.', 
        'Close', 
        { duration: 3000 }
      );
      return;
    }

    // 2. Size Check (10MB)
    if (file.size > 10 * 1024 * 1024) {
      this.snackBar.open(
        'File size must be less than 10MB.', 
        'Close', 
        { duration: 3000 }
      );
      return;
    }

    // 3. "Magic Number" Header Check (Local Sanity Check)
    const reader = new FileReader();
    reader.onloadend = (e: any) => {
      const arr = (new Uint8Array(e.target.result)).subarray(0, 4);
      let header = "";
      for (let i = 0; i < arr.length; i++) {
         header += String.fromCharCode(arr[i]);
      }
      
      if (header !== "%PDF") {
        this.snackBar.open(
          'Invalid PDF content detected.', 
          'Close', 
          { duration: 3000 }
        );
        this.removeFile();
      } else {
        this.selectedFile = file;
        this.selectedFileName = file.name;
        this.appealForm.patchValue({ appealFile: file });
        this.startPreScan(file);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // Start background pre-scan of uploaded PDF with Gemini AI
  private startPreScan(file: File): void {
    if (this.preScanToken) {
      this.reschedulingService.cancelPreScan(this.preScanToken)
        .pipe(takeUntil(this.destroy$))
        .subscribe();
    }

    this.scanCancel$.next();
    this.preScanToken = null;
    this.extractedSchedule = null;
    this.aiSummary = null;
    this.isAnalyzing = true;
    this.cdr.markForCheck();

    this.reschedulingService.preScanAppealDocument(file)
      .pipe(
        takeUntil(this.scanCancel$),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (res) => {
          this.preScanToken = res.tempToken;
          this.extractedSchedule = res.extracted;
          this.aiSummary = res.aiSummary;
          this.isAnalyzing = false;
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('Pre-scan error:', err);
          this.isAnalyzing = false;
          this.cdr.markForCheck();
        }
      });
  }

  // Apply extracted schedule fields to appeal form controls
  applyExtractedSchedule(): void {
    if (!this.extractedSchedule) return;

    const patches: any = {};

    if (
      this.extractedSchedule.day &&
      this.days.includes(this.extractedSchedule.day)
    ) {
      patches.appealDay = this.extractedSchedule.day;
    }

    if (
      this.extractedSchedule.startTime &&
      this.data.options.timeOptions.includes(this.extractedSchedule.startTime)
    ) {
      patches.appealStartTime = this.extractedSchedule.startTime;
    }

    if (this.extractedSchedule.endTime) {
      const startTime = patches.appealStartTime ||
        this.appealForm.get('appealStartTime')?.value;
      if (startTime) {
        this.updateEndTimeOptions(startTime);
      }
      if (
        this.data.options.endTimeOptions.includes(
          this.extractedSchedule.endTime
        )
      ) {
        patches.appealEndTime = this.extractedSchedule.endTime;
      }
    }

    if (
      this.extractedSchedule.room &&
      this.roomOptions.includes(this.extractedSchedule.room)
    ) {
      patches.appealRoom = this.extractedSchedule.room;
    }

    if (this.extractedSchedule.reason) {
      const currentReason = this.appealForm.get('reason')?.value || '';
      if (!currentReason.trim()) {
        patches.reason = this.extractedSchedule.reason;
      } else if (!currentReason.includes(this.extractedSchedule.reason)) {
        patches.reason = currentReason + ' ' + this.extractedSchedule.reason;
      }
    }

    this.appealForm.patchValue(patches);
    this.appealForm.markAsDirty();
    this.cdr.markForCheck();
  }

  // Check if any extracted field can be populated into the form
  hasAutoFillableFields(): boolean {
    if (!this.extractedSchedule) return false;
    const { day, startTime, endTime, room, reason } = this.extractedSchedule;
    return !!(day || startTime || endTime || room || reason);
  }

  // Remove selected file button handler
  removeFile(): void {
    if (this.isSubmitting) return;

    this.scanCancel$.next();

    if (this.preScanToken) {
      this.reschedulingService.cancelPreScan(this.preScanToken)
        .pipe(takeUntil(this.destroy$))
        .subscribe();
    }

    this.selectedFile = null;
    this.selectedFileName = '';
    this.preScanToken = null;
    this.extractedSchedule = null;
    this.aiSummary = null;
    this.isAnalyzing = false;
    this.appealForm.patchValue({ appealFile: null });
  }

  // Cancel and close the dialog button handler
  onCancel(): void {
    if (this.isSubmitting) {
      return;
    }
    this.dialogRef.close();
  }

  // Clear all form fields button handler
  onClearAll(): void {
    if (this.isSubmitting) {
      return;
    }
    if (this.isEditMode) {
      this.appealForm.reset({
        appealDay: '',
        appealStartTime: '',
        appealEndTime: '',
        appealRoom: 'None / Any',
        reason: ''
      });
      this.removeFile();
    } else {
      this.appealForm.reset();
    }
  }

  // Submit the appeal form button handler
  onSubmit(force: boolean = false): void {
    if (!this.appealForm.valid || this.isSubmitting) {
      this.appealForm.markAllAsTouched();
      return;
    }

    const formValues = this.appealForm.getRawValue();
    const startTime = formValues.appealStartTime;
    const endTime = formValues.appealEndTime;
    
    if (this.isEditMode && startTime && endTime && 
        this.compareTimeStrings(startTime, endTime) >= 0) {
      this.snackBar.open(
        'End time must be after start time.',
        'Close',
        { duration: 3000 }
      );
      return;
    }

    // Show submitting message
    this.snackBar.open(
      force ? 'Confirming submission...' : 'Submitting appeal...', 
      'Close', 
      { duration: 5000 }
    );

    // Disable submit button and actions
    this.isSubmitting = true;
    this.appealForm.disable();

    const selectedRoom = formValues.appealRoom;
    const roomCode = (selectedRoom === 'None / Any') ? '' : (selectedRoom || '');

    // Submit in background
    this.reschedulingService.submitReschedulingAppeal(
      this.data.original.scheduleId,
      this.selectedFile,
      formValues.reason,
      {
        day: formValues.appealDay,
        startTime: formValues.appealStartTime,
        endTime: formValues.appealEndTime,
        roomCode: roomCode
      },
      force,
      this.preScanToken,
      this.aiSummary
    )
    .pipe(takeUntil(this.destroy$))
    .subscribe({
      next: (response) => {
        this.isSubmitting = false;
        this.snackBar.open(
          response.message || 'Appeal submitted successfully.', 
          'Close', 
          { duration: 3000 }
        );
        this.dialogRef.close(true);
      },
      error: (error) => {
        console.error('Appeal error:', error);
        this.isSubmitting = false;
        this.appealForm.enable();

        let errorBody = error.error;
        if (typeof errorBody === 'string' && errorBody.includes('{"message"')) {
          try {
            const jsonPart = errorBody.substring(
              errorBody.indexOf('{"message"')
            );
            errorBody = JSON.parse(jsonPart);
          } catch (e) {
            // failed parsing
          }
        }

        if (error.status === 201) {
          this.snackBar.open(
            'Appeal submitted successfully.', 
            'Close', 
            { duration: 3000 }
          );
          this.dialogRef.close(true);
          return;
        }

        if (error.status === 409 && errorBody?.conflicts) {
          this.conflictMessages = errorBody.conflicts;
          this.hasConflicts = true;
          
          if (this.conflictMessages.length >= 3) {
            this.snackBar.open(
              'Proposed schedule has 3 or more conflicts and cannot be submitted.',
              'Close',
              { duration: 6000 }
            );
          } else {
            this.snackBar.open(
              'Conflicts detected. Please review or click "Submit Anyway" to proceed.',
              'Close',
              { duration: 5000 }
            );
          }
        } else {
          this.snackBar.open(
            errorBody?.message || 'Failed to submit appeal. Please try again.', 
            'Close', 
            { duration: 3000 }
          );
        }
        this.cdr.markForCheck();
      }
    });
  }

  /**
   * Handle speech recognition button click
   * Starts listening and appends speech to reason field
   */
  onSpeechRecognition(): void {
    // Check if speech recognition is supported
    if (!this.speechRecognitionService.isSupported()) {
      this.snackBar.open(
        'Speech Recognition is not supported in your browser. Please use Chrome, Edge, or Safari.',
        'Close',
        { duration: 5000 }
      );
      return;
    }

    if (this.isListening) {
      // Stop listening and cleanup subscriptions
      this.speechRecognitionService.stopListening();
      this.isListening = false;
      this.speechSession$.next();
      this.speechSession$.complete();
      this.speechSession$ = new Subject<void>();
      return;
    }

    // Reset speech session subject for new session
    this.speechSession$ = new Subject<void>();

    // Start listening
    this.isListening = true;
    this.speechRecognitionService.startListening();

    // Subscribe to transcript updates
    this.speechRecognitionService
      .getTranscript()
      .pipe(takeUntil(this.speechSession$))
      .subscribe((result) => {
        const reasonControl = this.appealForm.get('reason');
        if (reasonControl && result.isFinal) {
          const currentValue = reasonControl.value || '';
          // Only append final results to avoid duplicates
          const newValue = currentValue +
            (currentValue ? ' ' : '') +
            result.transcript;
          reasonControl.setValue(newValue);
          reasonControl.markAsDirty();
          this.cdr.markForCheck();
        }
      });

    // Subscribe to errors
    this.speechRecognitionService
      .getError()
      .pipe(takeUntil(this.speechSession$))
      .subscribe((error) => {
        this.isListening = false;
        this.snackBar.open(error, 'Close', { duration: 5000 });
        this.speechSession$.next();
        this.speechSession$.complete();
        this.cdr.markForCheck();
      });

    // Subscribe to listening status
    this.speechRecognitionService
      .getIsListening()
      .pipe(takeUntil(this.speechSession$))
      .subscribe((listening) => {
        this.isListening = listening;
        this.cdr.markForCheck();
      });
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

  /**
   * Clean up subscriptions and abort speech recognition on component destroy
   */
  ngOnDestroy(): void {
    this.scanCancel$.next();
    this.scanCancel$.complete();
    this.destroy$.next();
    this.destroy$.complete();
    
    // Abort any active speech recognition
    if (this.isListening) {
      this.speechSession$.next();
      this.speechSession$.complete();
      this.speechRecognitionService.abort();
      this.isListening = false;
    }
  }
}
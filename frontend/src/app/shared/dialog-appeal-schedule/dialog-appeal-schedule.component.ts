import { ChangeDetectorRef, Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { SchedulingService } from '../../core/services/admin/scheduling/scheduling.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subject, takeUntil } from 'rxjs';
import { ReschedulingService } from '../../core/services/faculty/rescheduling/rescheduling.service';

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
  roomOptions: string[] = [];

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private schedulingService: SchedulingService,
    private reschedulingService: ReschedulingService,
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

  private loadRooms(): void {
    this.schedulingService.getAllRooms().subscribe({
      next: (response: any) => {
        if (response && response.rooms) {
          const availableRooms = response.rooms.filter(
            (room: any) => room.status === 'Available'
          );
          this.roomOptions = availableRooms.map((room: any) => room.room_code);
        }
      },
      error: (error: any) => {
        console.error('Failed to load rooms:', error);
        this.roomOptions = ['A401', 'A402']; 
      }
    });
  }

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
              console.log('Clearing error on endTimeControl');
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

  private initializeForm(): void {
    if (this.isEditMode) {
      // Edit mode with appeal schedule fields - rebuild the form
      this.appealForm = this.fb.group({
        appealFile: [null, Validators.required],
        appealDay: [this.data.appealDay || '', Validators.required],
        appealStartTime: ['', Validators.required],
        appealEndTime: ['', Validators.required],
        appealRoom: [''],
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
      // Validate end time is after start time
      const startTime = this.appealForm.value.appealStartTime;
      const endTime = this.appealForm.value.appealEndTime;
      
      if (this.compareTimeStrings(startTime, endTime) >= 0) {
        this.snackBar.open('End time must be after start time.');
        return;
      }

      this.reschedulingService.submitReschedulingAppeal(
        this.data.original.scheduleId,
        this.selectedFile,
        this.appealForm.value.reason,
        {
          day: this.appealForm.value.appealDay,
          startTime: this.appealForm.value.appealStartTime,
          endTime: this.appealForm.value.appealEndTime,
          roomCode: this.appealForm.value.appealRoom
        },          
      )
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (response) => {
            this.snackBar.open(response, 
              'Close', {duration: 3000,}
            );
            this.dialogRef.close();
            // TODO: Remove the send appeal button to the schedule block 
          },
          error: (error) => {
            console.log('Error submitting appeal:', error);
            this.snackBar.open(error.message, 
              'Close', {duration: 3000,}
            );
          }
        });
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
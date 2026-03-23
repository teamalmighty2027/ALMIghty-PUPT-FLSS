import { Component, OnInit, AfterViewInit, ViewChild, TemplateRef, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { trigger, transition, style, animate } from '@angular/animations';
import { Subject, takeUntil } from 'rxjs';
import { LoadingComponent } from '../../../../shared/loading/loading.component';
import { TableHeaderComponent } from '../../../../shared/table-header/table-header.component';
import { ReschedulingService, AppealResponse } from '../../../services/faculty/rescheduling/rescheduling.service';
import { SpeechRecognitionService } from '../../../services/speech/speech-recognition.service';
import { MatSnackBar } from '@angular/material/snack-bar';

// ── Local view model ───────────────────────────────────────────
interface ReschedulingAppeal {
  id: number;
  rawAppealId: number;
  facultyName: string;
  programCode: string;
  courseTitle: string;
  originalSchedule: string;
  originalDay?: string;
  originalStartTime?: string;
  originalEndTime?: string;
  originalRoom?: string;
  appealVerification: string;   // 'Pending' | 'Approved' | 'Denied'
  preferredDay?: string;
  preferredStartTime?: string;
  preferredEndTime?: string;
  room?: string;
  filePath?: string | null;
  reasoning?: string | null;
}

@Component({
  selector: 'app-rescheduling',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatTableModule,
    MatPaginatorModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MatSlideToggleModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatDialogModule,
    LoadingComponent,
    TableHeaderComponent,
  ],
  animations: [
    trigger('fadeAnimation', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('300ms', style({ opacity: 1 })),
      ]),
    ]),
  ],
  templateUrl: './rescheduling.component.html',
  styleUrl: './rescheduling.component.scss',
})
export class ReschedulingComponent implements OnInit, AfterViewInit, OnDestroy {
  isLoading = false;
  headerInputFields: any[] = [];

  selectedAppeal: ReschedulingAppeal | null = null;
  newSchedule: ReschedulingAppeal | null = null;
  adminRemarks = '';

  // Get reference to the ng-templates in HTML
  @ViewChild('viewDialog') viewDialog!: TemplateRef<any>;
  @ViewChild('appealDialog') appealDialog!: TemplateRef<any>;

  displayedColumns: string[] = [
    'index', 'facultyName', 'programCode',
    'originalSchedule', 'appealVerification', 'action',
  ];
  dataSource = new MatTableDataSource<ReschedulingAppeal>([]);

  @ViewChild(MatPaginator) paginator!: MatPaginator;

  daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  timeOptions: string[] = [];

  // Speech recognition properties
  isListening: boolean = false;
  speechSupported: boolean = false;
  private destroy$ = new Subject<void>();
  private speechSession$ = new Subject<void>();

  constructor(
    private reschedulingService: ReschedulingService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private speechRecognitionService: SpeechRecognitionService,
    private cdr: ChangeDetectorRef
  ) {
    this.speechSupported = this.speechRecognitionService.isSupported();
  }

  ngOnInit(): void {
    this.generateTimeOptions();
    this.loadAppeals();
  }

  ngAfterViewInit(): void {
    this.dataSource.paginator = this.paginator;
  }

  // ── Helpers ────────────────────────────────────────────────────
  generateTimeOptions(): void {
    for (let hour = 7; hour <= 21; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const period = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
        const displayMinute = minute === 0 ? '00' : String(minute).padStart(2, '0');
        this.timeOptions.push(`${displayHour}:${displayMinute} ${period}`);
      }
    }
  }

  /**
   * Converts "08:00:00" or "08:00" (DB time format) → "8:00 AM"
   * Also handles already-converted "8:00 AM" strings safely.
   */
  private to12Hour(time: string | null | undefined): string {
    if (!time) return '—';
    // Already 12-hour format
    if (time.includes('AM') || time.includes('PM')) return time;
    const [hourStr, minuteStr] = time.split(':');
    let hours = parseInt(hourStr, 10);
    const minutes = minuteStr ?? '00';
    const period = hours >= 12 ? 'PM' : 'AM';
    if (hours === 0) hours = 12;
    else if (hours > 12) hours -= 12;
    return `${hours}:${minutes} ${period}`;
  }

  private mapAppeal(a: AppealResponse): ReschedulingAppeal {
    // Cast to 'any' to bypass the strict string interface warning
    const approved: any = a.is_approved;
    
    // NEW LOGIC:
    let status = 'Pending'; // Default state
    // We check for numbers (1, 0) or their string equivalents just in case
    if (approved === true || approved === 1 || approved === '1') status = 'Approved';
    if (approved === false || approved === 0 || approved === '0') status = 'Denied';

    const origStart = this.to12Hour(a.original_start_time);
    const origEnd   = this.to12Hour(a.original_end_time);
    const appStart  = this.to12Hour(a.appeal_start_time);
    const appEnd    = this.to12Hour(a.appeal_end_time);

    return {
      id:               a.appeal_id,
      rawAppealId:      a.appeal_id,
      facultyName:      a.faculty_name,
      programCode:      a.program_code,
      courseTitle:      a.course_title,
      originalSchedule: `${a.original_day} | ${origStart} - ${origEnd}`,
      originalDay:      a.original_day,
      originalStartTime: origStart,
      originalEndTime:  origEnd,
      originalRoom:     a.original_room,
      appealVerification: status,
      preferredDay:      a.appeal_day,
      preferredStartTime: appStart,
      preferredEndTime:  appEnd,
      room:              a.appeal_room ?? undefined,
      filePath:          a.file_path,
      reasoning:         a.reasoning,
    };
  }

  // ── Data loading ───────────────────────────────────────────────
  loadAppeals(): void {
    this.isLoading = true;
    this.reschedulingService.getAllAppeals().subscribe({
      next: (data) => {
        this.dataSource.data = data.map(a => this.mapAppeal(a));
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Failed to load appeals:', err);
        this.isLoading = false;
      },
    });
  }

  getRowIndex(i: number): number {
    const pageIndex = this.paginator ? this.paginator.pageIndex : 0;
    const pageSize = this.paginator ? this.paginator.pageSize : 25;
    return i + 1 + pageIndex * pageSize;
  }

  openViewDialog(appeal: ReschedulingAppeal): void {
    this.selectedAppeal = { ...appeal };
    
    this.dialog.open(this.viewDialog, {
      width: '55%',           
      maxWidth: '1000px',     
      maxHeight: '90vh',      
      height: 'auto',        
      disableClose: true,
      panelClass: 'custom-dialog-container'
    });
  }

  openEditDialog(appeal: ReschedulingAppeal): void {
    this.selectedAppeal = { ...appeal };
    
    // Load previous appeal data if the appeal is not pending
    if (this.selectedAppeal.appealVerification !== 'Pending') {
      this.newSchedule = { ...this.selectedAppeal };
    } else {
      // For pending appeals, initialize with empty form fields
      this.newSchedule = {
        ...appeal,
        preferredDay: undefined,
        preferredStartTime: undefined,
        preferredEndTime: undefined,
        room: undefined,
      };
    }
    this.adminRemarks = '';
    
    this.dialog.open(this.appealDialog, {
      width: '55%',           
      maxWidth: '1000px',     
      maxHeight: '90vh',      
      height: 'auto',        
      disableClose: true,
      panelClass: 'custom-dialog-container'
    });
  }

  closeDialog(): void {
    this.dialog.closeAll();
    this.selectedAppeal = null;
    this.newSchedule = null;
    this.adminRemarks = '';
  }

  clearAll(): void {
    if (!this.selectedAppeal) return;
    this.selectedAppeal.preferredDay       = undefined;
    this.selectedAppeal.preferredStartTime = undefined;
    this.selectedAppeal.preferredEndTime   = undefined;
    this.selectedAppeal.room               = undefined;
    this.adminRemarks = '';
  }

  isDaySelected(day: string): boolean {
    return this.selectedAppeal?.preferredDay === day;
  }

  selectDay(day: string): void {
    if (this.selectedAppeal) this.selectedAppeal.preferredDay = day;
  }

  // ── Approve ────────────────────────────────────────────────────
  approveAppeal(): void {
    if (!this.selectedAppeal) return;

    this.reschedulingService.approveAppeal(
      this.selectedAppeal.rawAppealId,
      {
        day:       this.newSchedule?.preferredDay       ?? '',
        startTime: this.newSchedule?.preferredStartTime ?? '',
        endTime:   this.newSchedule?.preferredEndTime   ?? '',
        room:      this.newSchedule?.room               ?? '',
      },
      this.adminRemarks
    ).subscribe({
      next: () => {
        this.updateLocalStatus(this.selectedAppeal!.id, 'Approved');
        this.closeDialog();
      },
      error: (err) => console.error('Failed to approve appeal:', err),
    });
  }

  // ── Deny ───────────────────────────────────────────────────────
  denyAppeal(): void {
    if (!this.selectedAppeal) return;

    this.reschedulingService.denyAppeal(
      this.selectedAppeal.rawAppealId,
      this.adminRemarks
    ).subscribe({
      next: () => {
        this.updateLocalStatus(this.selectedAppeal!.id, 'Denied');
        this.closeDialog();
      },
      error: (err) => console.error('Failed to deny appeal:', err),
    });
  }

  private updateLocalStatus(id: number, status: string): void {
    this.dataSource.data = this.dataSource.data.map(row =>
      row.id === id ? { ...row, appealVerification: status } : row
    );
  }

  // ── Other ──────────────────────────────────────────────────────
  /**
   * Handle speech recognition button click
   * Starts listening and appends speech to admin remarks field
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
        if (result.isFinal) {
          // Append final transcript to admin remarks
          this.adminRemarks = (this.adminRemarks + ' ' + result.transcript).trim();
          this.cdr.markForCheck();
          
          // Stop listening after final result
          this.isListening = false;
          this.speechRecognitionService.stopListening();
          this.speechSession$.next();
          this.speechSession$.complete();
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

  onExportAll(): void {
    console.log('Export all appeals', this.dataSource.data);
  }

  onInputChange(event: any): void {
    this.dataSource.filter = event?.value?.trim().toLowerCase() ?? '';
  }

  // Build full URL for uploaded appeal PDF
  getFileUrl(filePath: string | null | undefined): string {
    if (!filePath) return "#";
    return `http://127.0.0.1:8000/storage/${filePath}`;
  }

  assignSchedule(): void {
    this.approveAppeal();
  }

  /**
   * Clean up subscriptions and abort speech recognition on component destroy
   */
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    
    // Abort any active speech recognition
    if (this.isListening) {
      this.speechRecognitionService.abort();
    }
  }
}
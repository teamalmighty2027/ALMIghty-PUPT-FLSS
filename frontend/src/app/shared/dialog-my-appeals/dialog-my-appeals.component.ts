import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ReschedulingService, AppealResponse } from '../../core/services/faculty/rescheduling/rescheduling.service';

// Import your environment variables
import { environment } from '../../../../../environments/environment.dev';

interface AppealView {
  appealId:         number;
  status:           string;        // 'Pending' | 'Approved' | 'Denied'
  createdAt:        string;
  originalDay:      string;
  originalStartTime: string;
  originalEndTime:  string;
  originalRoom:     string;
  appealDay:        string;
  appealStartTime:  string;
  appealEndTime:    string;
  appealRoom:       string;
  reasoning:        string | null;
  filePath:         string | null;
}

@Component({
  selector: 'app-dialog-my-appeals',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
  ],
  templateUrl: './dialog-my-appeals.component.html',
  styleUrls: ['./dialog-my-appeals.component.scss'],
})
export class DialogMyAppealsComponent implements OnInit {
  isLoading = true;
  appeals: AppealView[] = [];
  cancellingId: number | null = null;

  constructor(
    private reschedulingService: ReschedulingService,
    private snackBar: MatSnackBar,
    public dialogRef: MatDialogRef<DialogMyAppealsComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { scheduleId: number }
  ) {}

  ngOnInit(): void {
    this.loadAppeals();
  }

  private to12Hour(time: string | null | undefined): string {
    if (!time) return '—';
    if (time.includes('AM') || time.includes('PM')) return time;
    const [hourStr, minuteStr] = time.split(':');
    let hours = parseInt(hourStr, 10);
    const minutes = minuteStr ?? '00';
    const period = hours >= 12 ? 'PM' : 'AM';
    if (hours === 0) hours = 12;
    else if (hours > 12) hours -= 12;
    return `${hours}:${minutes} ${period}`;
  }

  // Updated to use the new string ENUM from the database
  private mapStatus(is_approved: string | null): string {
    if (is_approved === 'approved') return 'Approved';
    if (is_approved === 'denied')   return 'Denied';
    return 'Pending';
  }

  loadAppeals(): void {
    this.isLoading = true;
    this.reschedulingService.getMyAppeals().subscribe({
      next: (data) => {
        const filtered = data.filter(a => a.schedule_id === this.data.scheduleId);
        this.appeals = filtered.map(a => ({
          appealId:          a.appeal_id,
          status:            this.mapStatus(a.is_approved as string), // Casting to ensure type safety
          createdAt:         new Date(a.created_at).toLocaleDateString('en-US', {
                               year: 'numeric', month: 'short', day: 'numeric'
                             }),
          originalDay:       a.original_day,
          originalStartTime: this.to12Hour(a.original_start_time),
          originalEndTime:   this.to12Hour(a.original_end_time),
          originalRoom:      a.original_room ?? '—',
          appealDay:         a.appeal_day,
          appealStartTime:   this.to12Hour(a.appeal_start_time),
          appealEndTime:     this.to12Hour(a.appeal_end_time),
          appealRoom:        a.appeal_room ?? '—',
          reasoning:         a.reasoning,
          filePath:          a.file_path,
        }));
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Failed to load appeals:', err);
        this.isLoading = false;
      }
    });
  }

  onCancel(appeal: AppealView): void {
    if (appeal.status !== 'Pending') return;
    this.cancellingId = appeal.appealId;

    this.reschedulingService.cancelAppeal(appeal.appealId).subscribe({
      next: () => {
        this.snackBar.open('Appeal cancelled successfully.', 'Close', { duration: 3000 });
        this.appeals = this.appeals.filter(a => a.appealId !== appeal.appealId);
        this.cancellingId = null;
      },
      error: (err) => {
        this.snackBar.open(err?.error?.message ?? 'Failed to cancel appeal.', 'Close', { duration: 3000 });
        this.cancellingId = null;
      }
    });
  }

  getFileUrl(filePath: string | null): string {
    if (!filePath) return '#';
    
    // TODO: Temporary implementation. The process regarding file upload needs to be re-examined.
    // This dynamically removes '/api' from the end of the environment URL to point to the base storage folder.
    const baseUrl = environment.apiUrl.replace(/\/api\/?$/, '');
    return `${baseUrl}/storage/${filePath}`;
  }

  onClose(): void {
    this.dialogRef.close();
  }
}

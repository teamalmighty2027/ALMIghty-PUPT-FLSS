import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';

import { SystemNotice, SystemNoticeService } from '../../../../../services/superadmin/system-notice/system-notice.service';

@Component({
  selector: 'app-dialog-system-notice-details',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
  ],
  templateUrl: './dialog-system-notice-details.component.html',
  styleUrls: ['./dialog-system-notice-details.component.scss']
})
export class DialogSystemNoticeDetailsComponent {
  isResolving = false;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: SystemNotice,
    private dialogRef: MatDialogRef<DialogSystemNoticeDetailsComponent>,
    private noticeService: SystemNoticeService,
    private snackBar: MatSnackBar
  ) {}

  /**
   * Resolves the current system notice.
   */
  resolveNotice(): void {
    if (this.isResolving || !this.data.id) return;
    this.isResolving = true;

    this.noticeService.resolveNotice(this.data.id).subscribe({
      next: () => {
        this.snackBar.open('Notice marked as resolved successfully.', 'Close', {
          duration: 3000,
        });
        this.dialogRef.close(true);
      },
      error: (err) => {
        console.error('Failed to resolve notice:', err);
        this.snackBar.open('Failed to resolve notice.', 'Close', {
          duration: 3000,
        });
        this.isResolving = false;
      }
    });
  }

  /**
   * Formats Laravel date string to human-readable date.
   */
  formatDateTime(dateString?: string): string {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    });
  }

  /**
   * Formats JSON context to a pretty printed string.
   */
  getFormattedContext(): string {
    if (!this.data.context) return 'No context available';
    try {
      return JSON.stringify(this.data.context, null, 2);
    } catch (e) {
      return String(this.data.context);
    }
  }

  close(): void {
    this.dialogRef.close(false);
  }
}

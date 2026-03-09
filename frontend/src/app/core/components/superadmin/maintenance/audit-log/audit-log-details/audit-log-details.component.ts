import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { AuditEntry } from '../../../../../services/superadmin/audit-log/audit-log.service';

@Component({
  selector: 'app-audit-log-details',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, MatDividerModule],
  template: `
    <div class="dialog-header">
      <mat-icon class="header-icon">manage_search</mat-icon>
      <h2 mat-dialog-title>Audit Log Details</h2>
    </div>
    
    <mat-dialog-content class="custom-scrollbar">
      <div class="details-grid">
        <div class="info-group">
          <span class="label">Date & Time</span>
          <span class="value">{{ data.date_time }}</span>
        </div>
        
        <div class="info-group">
          <span class="label">User Role</span>
          <span class="value role-badge">{{ data.role }}</span>
        </div>

        <div class="info-group full-width">
          <span class="label">System User</span>
          <span class="value user-text">{{ data.user }}</span>
        </div>

        <mat-divider class="full-width"></mat-divider>

        <div class="info-group">
          <span class="label">Action Type</span>
          <span class="value action-badge" [ngClass]="data.action_type.toLowerCase()">
            {{ data.action_type | uppercase }}
          </span>
        </div>

        <div class="info-group full-width summary-box">
          <span class="label">Changes Summary</span>
          <p class="value summary-text">{{ data.changes_summary }}</p>
        </div>
      </div>
    </mat-dialog-content>

    <mat-dialog-actions align="end" class="dialog-footer">
      <button mat-stroked-button mat-dialog-close class="close-btn">Close Window</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .dialog-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 24px 24px 0;
      color: #800000; /* PUPT Maroon */
      
      h2 { margin: 0; font-weight: 700; font-size: 1.5rem; }
      .header-icon { font-size: 28px; height: 28px; width: 28px; }
    }

    .details-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      padding-top: 16px;
    }

    .full-width { grid-column: 1 / -1; }

    .info-group {
      display: flex;
      flex-direction: column;
      gap: 4px;

      .label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; font-weight: 600; }
      .value { font-size: 1rem; color: #111827; }
    }

    .role-badge {
      background: #f3f4f6; padding: 4px 12px; border-radius: 6px; width: fit-content; font-weight: 500; font-size: 0.875rem;
    }

    .summary-box {
      background: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 8px;
      .summary-text { margin: 0; line-height: 1.5; color: #334155; }
    }

    /* Bring in the pastel badges for the modal too! */
    .action-badge {
      padding: 4px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 700; text-align: center; width: fit-content;
      &.login, &.view { background-color: #dbeafe; color: #1e40af; }
      &.logout { background-color: #f3f4f6; color: #374151; }
      &.create { background-color: #dcfce7; color: #166534; }
      &.update { background-color: #fef08a; color: #854d0e; }
      &.delete { background-color: #fee2e2; color: #991b1b; }
    }

    .dialog-footer {
      padding: 16px 24px 24px;
      .close-btn { color: #800000; border-color: #800000; }
    }
  `]
})
export class AuditLogDetailsComponent {
  constructor(@Inject(MAT_DIALOG_DATA) public data: AuditEntry) {}
}
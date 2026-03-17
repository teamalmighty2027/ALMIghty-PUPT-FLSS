import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon'; 

// Using the verified path for your core service
import { AuditEntry } from '../../core/services/superadmin/audit-log/audit-log.service';

@Component({
  selector: 'app-dialog-auditlog-details',
  standalone: true,
  imports: [
    CommonModule, 
    MatDialogModule, 
    MatButtonModule, 
    MatIconModule 
  ],
  templateUrl: './dialog-auditlog-details.component.html',
  styleUrls: ['./dialog-auditlog-details.component.scss']
})
export class DialogAuditlogDetailsComponent {
  constructor(
    @Inject(MAT_DIALOG_DATA) public data: AuditEntry,
    private dialogRef: MatDialogRef<DialogAuditlogDetailsComponent>
  ) {}

  close(): void {
    this.dialogRef.close();
  }
}
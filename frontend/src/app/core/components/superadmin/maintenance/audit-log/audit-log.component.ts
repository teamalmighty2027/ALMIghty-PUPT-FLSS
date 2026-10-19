import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, ViewChild, TemplateRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, BehaviorSubject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import { MatDialog, MatDialogModule } from '@angular/material/dialog'; 

import { TableGenericComponent } from '../../../../../shared/table-generic/table-generic.component';
import { LoadingComponent } from '../../../../../shared/loading/loading.component';
import { AuditEntry, AuditLogService } from '../../../../services/superadmin/audit-log/audit-log.service';
import { fadeAnimation } from '../../../../animations/animations';
import { DialogAuditlogDetailsComponent } from '../../../../../shared/dialog-auditlog-details/dialog-auditlog-details.component';

@Component({
  selector: 'app-audit-log',
  standalone: true,
  imports: [CommonModule, TableGenericComponent, LoadingComponent, MatDialogModule], 
  templateUrl: './audit-log.component.html',
  styleUrls: ['./audit-log.component.scss'],
  animations: [fadeAnimation],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuditLogComponent implements OnInit, OnDestroy {
  isLoading = true;
  private destroy$ = new Subject<void>();
  private logsSubject = new BehaviorSubject<AuditEntry[]>([]);
  logs$ = this.logsSubject.asObservable();

  @ViewChild('actionBadgeTemplate', { static: true }) actionBadgeTemplate!: TemplateRef<any>;

  columns: any[] = [];
  displayedColumns: string[] = ['id', 'date_time', 'role', 'user', 'action_type', 'changes_summary'];

  // Pagination State
  totalLogs = 0;
  pageSize = 10;
  currentPage = 1; // Laravel's paginator expects pages to start at 1

  constructor(
    private cdr: ChangeDetectorRef,
    private auditService: AuditLogService,
    private dialog: MatDialog
  ) {}

  ngOnInit() {
    this.columns = [
      { key: 'id', label: '#' },
      { key: 'date_time', label: 'Date & Time' },
      { key: 'role', label: 'Role' },
      { key: 'user', label: 'User' },
      { key: 'action_type', label: 'Action Type', template: this.actionBadgeTemplate },
      { key: 'changes_summary', label: 'Changes Summary' },
    ];
    this.fetchLogs();
  }

  fetchLogs() {
    this.isLoading = true;
    this.auditService.getAuditLogs(this.currentPage, this.pageSize)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.isLoading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (response) => {
          this.logsSubject.next(response.data);
          this.totalLogs = response.total;
        },
        error: (err) => console.error('Failed to load audit logs:', err)
      });
  }

  onPageChange(event: any) {
    // Angular Material's paginator is 0-indexed, so we add 1 for Laravel
    this.currentPage = event.pageIndex + 1; 
    this.pageSize = event.pageSize;
    this.fetchLogs();
  }

  onViewDetails(log: AuditEntry) {
    this.dialog.open(DialogAuditlogDetailsComponent, { 
      width: '850px', 
      data: log,
      panelClass: 'custom-audit-log-panel',
      autoFocus: true,
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}